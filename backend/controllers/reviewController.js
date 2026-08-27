const pool = require("../db");
const { createSellerNotification } = require("../services/notificationService");

function requireCustomer(req, res) {
    if (req.user.role === "customer") return true;
    res.status(403).json({ message: "Only customer accounts can manage reviews." });
    return false;
}

function isValidId(value) {
    return /^\d+$/.test(String(value)) && BigInt(String(value)) > 0n;
}

function validateReviewData(body, requireProductId) {
    if (!body || typeof body !== "object" || Array.isArray(body)) return "Request body must be a JSON object.";
    if (Object.prototype.hasOwnProperty.call(body, "customer_id")) return "customer_id is determined from the authenticated customer and cannot be provided.";
    if (requireProductId && !isValidId(body.product_id)) return "product_id must be a positive integer.";
    if (typeof body.rating !== "number" || !Number.isInteger(body.rating) || body.rating < 1 || body.rating > 5) return "rating must be an integer between 1 and 5.";
    if (typeof body.comment !== "string" || body.comment.trim() === "") return "comment must be a non-empty string.";
    return null;
}

async function rollback(client) {
    try {
        await client.query("ROLLBACK");
    } catch (error) {
        console.error("Review rollback error:", error);
    }
}

function sendReviewError(error, res) {
    console.error("Review database error:", error);
    if (error.code === "23503") return res.status(409).json({ message: "The referenced product or customer no longer exists." });
    if (error.code === "23514" || error.code === "22P02") return res.status(400).json({ message: "Review data violates a database validation rule." });
    return res.status(500).json({ message: "Unable to process review request." });
}

async function findReview(reviewId) {
    const result = await pool.query("SELECT review_id, customer_id FROM reviews WHERE review_id = $1", [reviewId]);
    return result.rows[0];
}

exports.createReview = async (req, res) => {
    if (!requireCustomer(req, res)) return;
    const validationError = validateReviewData(req.body, true);
    if (validationError) return res.status(400).json({ message: validationError });

    const { product_id: productId, rating, comment } = req.body;
    const client = await pool.connect();
    try {
        await client.query("BEGIN");
        // The schema cannot enforce one review per customer/product. This transaction
        // lock serializes concurrent create requests for the same pair.
        await client.query("SELECT pg_advisory_xact_lock(hashtext($1 || ':' || $2))", [String(req.user.sub), String(productId)]);

        const productResult = await client.query("SELECT product_id, name, seller_id FROM products WHERE product_id = $1", [productId]);
        if (productResult.rowCount === 0) {
            await rollback(client);
            return res.status(404).json({ message: "Product not found." });
        }

        const purchaseResult = await client.query(
            `SELECT 1
             FROM orders o
             INNER JOIN order_items oi ON oi.order_id = o.order_id
             WHERE o.customer_id = $1 AND oi.product_id = $2
             LIMIT 1`,
            [req.user.sub, productId]
        );
        if (purchaseResult.rowCount === 0) {
            await rollback(client);
            return res.status(403).json({ message: "You can only review products you have purchased." });
        }

        const duplicateResult = await client.query(
            "SELECT review_id FROM reviews WHERE customer_id = $1 AND product_id = $2 LIMIT 1",
            [req.user.sub, productId]
        );
        if (duplicateResult.rowCount > 0) {
            await rollback(client);
            return res.status(409).json({ message: "You have already reviewed this product." });
        }

        const result = await client.query(
            `INSERT INTO reviews (rating, comment, customer_id, product_id)
             VALUES ($1, $2, $3, $4)
             RETURNING review_id, rating, comment, customer_id, product_id`,
            [rating, comment.trim(), req.user.sub, productId]
        );
        const product = productResult.rows[0];
        await createSellerNotification(client, product.seller_id, `Your product '${product.name}' received a new review.`);
        await client.query("COMMIT");
        return res.status(201).json({ message: "Review created successfully.", review: result.rows[0] });
    } catch (error) {
        await rollback(client);
        return sendReviewError(error, res);
    } finally {
        client.release();
    }
};

exports.getProductReviews = async (req, res) => {
    const { productId } = req.params;
    if (!isValidId(productId)) return res.status(400).json({ message: "productId must be a positive integer." });

    try {
        const productResult = await pool.query("SELECT product_id FROM products WHERE product_id = $1", [productId]);
        if (productResult.rowCount === 0) return res.status(404).json({ message: "Product not found." });

        const [summaryResult, reviewsResult] = await Promise.all([
            pool.query(
                `SELECT COUNT(*) AS review_count, COALESCE(ROUND(AVG(rating), 2), 0) AS average_rating
                 FROM reviews
                 WHERE product_id = $1`,
                [productId]
            ),
            pool.query(
                `SELECT r.review_id, r.product_id, r.rating, r.comment, c.name AS customer_name
                 FROM reviews r
                 INNER JOIN customers c ON c.customer_id = r.customer_id
                 WHERE r.product_id = $1
                 ORDER BY r.review_id DESC`,
                [productId]
            )
        ]);
        const summary = summaryResult.rows[0];
        return res.status(200).json({
            product_id: productResult.rows[0].product_id,
            review_count: Number(summary.review_count),
            average_rating: Number(summary.average_rating),
            reviews: reviewsResult.rows
        });
    } catch (error) {
        return sendReviewError(error, res);
    }
};

exports.updateReview = async (req, res) => {
    if (!requireCustomer(req, res)) return;
    const { reviewId } = req.params;
    if (!isValidId(reviewId)) return res.status(400).json({ message: "reviewId must be a positive integer." });
    const validationError = validateReviewData(req.body, false);
    if (validationError) return res.status(400).json({ message: validationError });

    try {
        const review = await findReview(reviewId);
        if (!review) return res.status(404).json({ message: "Review not found." });
        if (String(review.customer_id) !== String(req.user.sub)) {
            return res.status(403).json({ message: "You are not authorized to update this review." });
        }

        const result = await pool.query(
            `UPDATE reviews SET rating = $1, comment = $2
             WHERE review_id = $3 AND customer_id = $4
             RETURNING review_id, rating, comment, customer_id, product_id`,
            [req.body.rating, req.body.comment.trim(), reviewId, req.user.sub]
        );
        if (result.rowCount === 0) return res.status(403).json({ message: "You are not authorized to update this review." });
        return res.status(200).json({ message: "Review updated successfully.", review: result.rows[0] });
    } catch (error) {
        return sendReviewError(error, res);
    }
};

exports.deleteReview = async (req, res) => {
    if (!requireCustomer(req, res)) return;
    const { reviewId } = req.params;
    if (!isValidId(reviewId)) return res.status(400).json({ message: "reviewId must be a positive integer." });

    try {
        const review = await findReview(reviewId);
        if (!review) return res.status(404).json({ message: "Review not found." });
        if (String(review.customer_id) !== String(req.user.sub)) {
            return res.status(403).json({ message: "You are not authorized to delete this review." });
        }

        const result = await pool.query(
            "DELETE FROM reviews WHERE review_id = $1 AND customer_id = $2 RETURNING review_id",
            [reviewId, req.user.sub]
        );
        if (result.rowCount === 0) return res.status(403).json({ message: "You are not authorized to delete this review." });
        return res.status(200).json({ message: "Review deleted successfully.", review_id: result.rows[0].review_id });
    } catch (error) {
        return sendReviewError(error, res);
    }
};
