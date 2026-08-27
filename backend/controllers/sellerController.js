const pool = require("../db");
const { createCustomerNotification } = require("../services/notificationService");

const editableProductFields = ["name", "description", "price", "stock", "image", "category_id"];
const supportedOrderStatuses = ["Pending", "Processing", "Shipped", "Delivered", "Cancelled"];
const sellerStatusTransitions = {
    Pending: ["Processing"],
    Processing: ["Shipped"],
    Shipped: ["Delivered"],
    Delivered: [],
    Cancelled: []
};

function requireSeller(req, res) {
    if (req.user.role === "seller") return true;
    res.status(403).json({ message: "Only seller accounts can access seller management endpoints." });
    return false;
}

function isValidId(value) {
    return typeof value === "string" && /^\d+$/.test(value) && BigInt(value) > 0n;
}

function validateProductData(body, requireAllFields) {
    if (!body || typeof body !== "object" || Array.isArray(body)) return "Request body must be a JSON object.";
    if (Object.prototype.hasOwnProperty.call(body, "seller_id")) return "seller_id is assigned from the authenticated seller and cannot be provided.";

    if (requireAllFields) {
        const missingFields = editableProductFields.filter((field) => body[field] === undefined || body[field] === null || body[field] === "");
        if (missingFields.length > 0) return `Missing required fields: ${missingFields.join(", ")}.`;
    }
    if (body.name !== undefined && (typeof body.name !== "string" || body.name.trim() === "" || body.name.trim().length > 200)) return "name must be a non-empty string of at most 200 characters.";
    if (body.description !== undefined && (typeof body.description !== "string" || body.description.trim() === "")) return "description must be a non-empty string.";
    if (body.image !== undefined && (typeof body.image !== "string" || body.image.trim() === "")) return "image must be a non-empty string.";
    if (body.price !== undefined && (!Number.isFinite(Number(body.price)) || Number(body.price) < 0)) return "price must be a non-negative number.";
    if (body.stock !== undefined && (!Number.isSafeInteger(Number(body.stock)) || Number(body.stock) < 0)) return "stock must be a non-negative integer.";
    if (body.category_id !== undefined && !isValidId(String(body.category_id))) return "category_id must be a positive integer.";
    return null;
}

async function ensureCategoryExists(categoryId) {
    const result = await pool.query("SELECT category_id FROM categories WHERE category_id = $1", [categoryId]);
    return result.rowCount > 0;
}

async function findOwnedProduct(productId, sellerId) {
    const result = await pool.query("SELECT product_id, seller_id FROM products WHERE product_id = $1", [productId]);
    if (result.rowCount === 0) return { exists: false, owned: false };
    return { exists: true, owned: String(result.rows[0].seller_id) === String(sellerId) };
}

function sendSellerError(error, res) {
    console.error("Seller management database error:", error);
    if (error.code === "23503") return res.status(409).json({ message: "This product is still referenced by another record and cannot be deleted." });
    if (error.code === "23514" || error.code === "22P02") return res.status(400).json({ message: "Data violates a database validation rule." });
    return res.status(500).json({ message: "Unable to process seller management request." });
}

function calculateSubtotal(price, quantity) {
    const [whole, decimal = ""] = String(price).split(".");
    const cents = BigInt(whole) * 100n + BigInt(`${decimal}00`.slice(0, 2));
    const subtotalInCents = cents * BigInt(quantity);
    const formatted = subtotalInCents.toString().padStart(3, "0");
    return `${formatted.slice(0, -2)}.${formatted.slice(-2)}`;
}

exports.getSellerProducts = async (req, res) => {
    if (!requireSeller(req, res)) return;

    try {
        const result = await pool.query(
            `SELECT p.product_id, p.name, p.description, p.price, p.stock, p.image,
                    c.category_id, c.category_name
             FROM products p
             INNER JOIN categories c ON c.category_id = p.category_id
             WHERE p.seller_id = $1
             ORDER BY p.product_id`,
            [req.user.sub]
        );
        return res.status(200).json(result.rows);
    } catch (error) {
        return sendSellerError(error, res);
    }
};

exports.createSellerProduct = async (req, res) => {
    if (!requireSeller(req, res)) return;
    const validationError = validateProductData(req.body, true);
    if (validationError) return res.status(400).json({ message: validationError });

    const { name, description, price, stock, image, category_id: categoryId } = req.body;
    try {
        if (!(await ensureCategoryExists(categoryId))) return res.status(404).json({ message: "Category not found." });

        const result = await pool.query(
            `INSERT INTO products (name, description, price, stock, image, seller_id, category_id)
             VALUES ($1, $2, $3, $4, $5, $6, $7)
             RETURNING product_id, name, description, price, stock, image, seller_id, category_id`,
            [name.trim(), description.trim(), price, stock, image.trim(), req.user.sub, categoryId]
        );
        return res.status(201).json(result.rows[0]);
    } catch (error) {
        return sendSellerError(error, res);
    }
};

exports.updateSellerProduct = async (req, res) => {
    if (!requireSeller(req, res)) return;
    const { productId } = req.params;
    if (!isValidId(productId)) return res.status(400).json({ message: "productId must be a positive integer." });

    const validationError = validateProductData(req.body, false);
    if (validationError) return res.status(400).json({ message: validationError });
    const suppliedFields = editableProductFields.filter((field) => Object.prototype.hasOwnProperty.call(req.body, field));
    if (suppliedFields.length === 0) return res.status(400).json({ message: "Provide at least one editable product field." });

    try {
        const product = await findOwnedProduct(productId, req.user.sub);
        if (!product.exists) return res.status(404).json({ message: "Product not found." });
        if (!product.owned) return res.status(403).json({ message: "You are not authorized to modify this product." });
        if (req.body.category_id !== undefined && !(await ensureCategoryExists(req.body.category_id))) {
            return res.status(404).json({ message: "Category not found." });
        }

        const values = suppliedFields.map((field) => {
            const value = req.body[field];
            return ["name", "description", "image"].includes(field) ? value.trim() : value;
        });
        values.push(productId, req.user.sub);
        const assignments = suppliedFields.map((field, index) => `${field} = $${index + 1}`).join(", ");
        const result = await pool.query(
            `UPDATE products SET ${assignments}
             WHERE product_id = $${values.length - 1} AND seller_id = $${values.length}
             RETURNING product_id, name, description, price, stock, image, seller_id, category_id`,
            values
        );
        if (result.rowCount === 0) return res.status(403).json({ message: "You are not authorized to modify this product." });
        return res.status(200).json(result.rows[0]);
    } catch (error) {
        return sendSellerError(error, res);
    }
};

exports.deleteSellerProduct = async (req, res) => {
    if (!requireSeller(req, res)) return;
    const { productId } = req.params;
    if (!isValidId(productId)) return res.status(400).json({ message: "productId must be a positive integer." });

    try {
        const product = await findOwnedProduct(productId, req.user.sub);
        if (!product.exists) return res.status(404).json({ message: "Product not found." });
        if (!product.owned) return res.status(403).json({ message: "You are not authorized to delete this product." });

        const result = await pool.query(
            "DELETE FROM products WHERE product_id = $1 AND seller_id = $2 RETURNING product_id",
            [productId, req.user.sub]
        );
        if (result.rowCount === 0) return res.status(403).json({ message: "You are not authorized to delete this product." });
        return res.status(200).json({ message: "Product deleted successfully.", product_id: result.rows[0].product_id });
    } catch (error) {
        return sendSellerError(error, res);
    }
};

exports.getSellerOrders = async (req, res) => {
    if (!requireSeller(req, res)) return;

    try {
        const result = await pool.query(
            `SELECT
                o.order_id, o.order_date, o.total_amount, o.payment_method, o.shipping_address, o.status,
                c.customer_id, c.name AS customer_name, c.email AS customer_email,
                oi.order_item_id, oi.product_id, oi.quantity, oi.price,
                p.name AS product_name, p.image AS product_image
             FROM orders o
             INNER JOIN customers c ON c.customer_id = o.customer_id
             INNER JOIN order_items oi ON oi.order_id = o.order_id
             INNER JOIN products p ON p.product_id = oi.product_id
             WHERE p.seller_id = $1
             ORDER BY o.order_id DESC, oi.order_item_id`,
            [req.user.sub]
        );

        const ordersById = new Map();
        for (const row of result.rows) {
            const key = String(row.order_id);
            if (!ordersById.has(key)) {
                ordersById.set(key, {
                    order_id: row.order_id,
                    order_date: row.order_date,
                    total_amount: row.total_amount,
                    payment_method: row.payment_method,
                    shipping_address: row.shipping_address,
                    status: row.status,
                    customer: {
                        customer_id: row.customer_id,
                        name: row.customer_name,
                        email: row.customer_email
                    },
                    items: []
                });
            }
            ordersById.get(key).items.push({
                order_item_id: row.order_item_id,
                product_id: row.product_id,
                product_name: row.product_name,
                product_image: row.product_image,
                quantity: row.quantity,
                price: row.price,
                subtotal: calculateSubtotal(row.price, row.quantity)
            });
        }
        return res.status(200).json([...ordersById.values()]);
    } catch (error) {
        return sendSellerError(error, res);
    }
};

exports.updateSellerOrderStatus = async (req, res) => {
    if (!requireSeller(req, res)) return;
    const { orderId } = req.params;
    if (!isValidId(orderId)) return res.status(400).json({ message: "orderId must be a positive integer." });
    if (!req.body || typeof req.body.status !== "string" || !supportedOrderStatuses.includes(req.body.status)) {
        return res.status(400).json({ message: `status must be one of: ${supportedOrderStatuses.join(", ")}.` });
    }

    const client = await pool.connect();
    try {
        await client.query("BEGIN");
        const orderResult = await client.query(
            "SELECT order_id, customer_id, status FROM orders WHERE order_id = $1 FOR UPDATE",
            [orderId]
        );
        if (orderResult.rowCount === 0) {
            await client.query("ROLLBACK");
            return res.status(404).json({ message: "Order not found." });
        }

        const ownershipResult = await client.query(
            `SELECT 1
             FROM order_items oi
             INNER JOIN products p ON p.product_id = oi.product_id
             WHERE oi.order_id = $1 AND p.seller_id = $2
             LIMIT 1`,
            [orderId, req.user.sub]
        );
        if (ownershipResult.rowCount === 0) {
            await client.query("ROLLBACK");
            return res.status(403).json({ message: "You are not authorized to manage this order." });
        }

        const currentStatus = orderResult.rows[0].status;
        const requestedStatus = req.body.status;
        if (requestedStatus === "Cancelled") {
            await client.query("ROLLBACK");
            return res.status(409).json({ message: "Use the customer cancellation endpoint for Pending orders so stock is restored correctly." });
        }
        if (!sellerStatusTransitions[currentStatus] || !sellerStatusTransitions[currentStatus].includes(requestedStatus)) {
            await client.query("ROLLBACK");
            return res.status(409).json({ message: `Cannot change order status from ${currentStatus} to ${requestedStatus}.` });
        }

        const result = await client.query(
            "UPDATE orders SET status = $1 WHERE order_id = $2 RETURNING order_id, order_date, total_amount, payment_method, shipping_address, status",
            [requestedStatus, orderId]
        );
        await createCustomerNotification(
            client,
            orderResult.rows[0].customer_id,
            `Your order #${orderId} status has been updated to ${requestedStatus}.`
        );
        await client.query("COMMIT");
        return res.status(200).json({
            message: "Order status updated successfully.",
            order: result.rows[0],
            warning: "Order status is stored once per order. Updating it affects the entire order, including items from other sellers."
        });
    } catch (error) {
        try {
            await client.query("ROLLBACK");
        } catch (rollbackError) {
            console.error("Seller order status rollback error:", rollbackError);
        }
        return sendSellerError(error, res);
    } finally {
        client.release();
    }
};
122002662006200                                                                                                                           
