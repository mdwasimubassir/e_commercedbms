const pool = require("../db");

const productSelect = `
    SELECT
        p.product_id,
        p.name,
        p.description,
        p.price,
        p.stock,
        p.image,
        c.category_id,
        c.category_name,
        s.seller_id,
        s.name AS seller_name,
        s.email AS seller_email,
        s.phone AS seller_phone
    FROM products p
    INNER JOIN categories c ON c.category_id = p.category_id
    INNER JOIN sellers s ON s.seller_id = p.seller_id
`;

const productFields = ["name", "description", "price", "stock", "image", "seller_id", "category_id"];

function isValidId(value) {
    return typeof value === "string" && /^\d+$/.test(value) && BigInt(value) > 0n;
}

function validateProduct(body, requireAllFields) {
    if (!body || typeof body !== "object" || Array.isArray(body)) {
        return "Request body must be a JSON object.";
    }

    if (requireAllFields) {
        const missingFields = productFields.filter((field) => body[field] === undefined || body[field] === null || body[field] === "");
        if (missingFields.length > 0) {
            return `Missing required fields: ${missingFields.join(", ")}.`;
        }
    }

    if (body.name !== undefined && (typeof body.name !== "string" || body.name.trim() === "")) return "name must be a non-empty string.";
    if (body.description !== undefined && (typeof body.description !== "string" || body.description.trim() === "")) return "description must be a non-empty string.";
    if (body.image !== undefined && (typeof body.image !== "string" || body.image.trim() === "")) return "image must be a non-empty string.";
    if (body.price !== undefined && (!Number.isFinite(Number(body.price)) || Number(body.price) < 0)) return "price must be a non-negative number.";
    if (body.stock !== undefined && (!Number.isInteger(Number(body.stock)) || Number(body.stock) < 0)) return "stock must be a non-negative integer.";
    if (body.seller_id !== undefined && !isValidId(String(body.seller_id))) return "seller_id must be a positive integer.";
    if (body.category_id !== undefined && !isValidId(String(body.category_id))) return "category_id must be a positive integer.";

    return null;
}

function handleDatabaseError(error, res) {
    console.error("Product database error:", error);

    if (error.code === "23503") {
        return res.status(409).json({ message: "The referenced record does not exist, or this product is still referenced by another record." });
    }
    if (error.code === "23505") {
        return res.status(409).json({ message: "A product with these unique values already exists." });
    }
    if (error.code === "23514" || error.code === "22P02") {
        return res.status(400).json({ message: "Product data violates a database validation rule." });
    }

    return res.status(500).json({ message: "An unexpected database error occurred." });
}

exports.getProducts = async (req, res) => {
    try {
        const result = await pool.query(`${productSelect} ORDER BY p.product_id`);
        res.status(200).json(result.rows);
    } catch (error) {
        handleDatabaseError(error, res);
    }
};

exports.getProductById = async (req, res) => {
    if (!isValidId(req.params.id)) return res.status(400).json({ message: "Product id must be a positive integer." });

    try {
        const result = await pool.query(`${productSelect} WHERE p.product_id = $1`, [req.params.id]);
        if (result.rowCount === 0) return res.status(404).json({ message: "Product not found." });
        res.status(200).json(result.rows[0]);
    } catch (error) {
        handleDatabaseError(error, res);
    }
};

exports.createProduct = async (req, res) => {
    const validationError = validateProduct(req.body, true);
    if (validationError) return res.status(400).json({ message: validationError });

    const { name, description, price, stock, image, seller_id, category_id } = req.body;
    try {
        const result = await pool.query(
            `INSERT INTO products (name, description, price, stock, image, seller_id, category_id)
             VALUES ($1, $2, $3, $4, $5, $6, $7)
             RETURNING product_id, name, description, price, stock, image, seller_id, category_id`,
            [name.trim(), description.trim(), price, stock, image.trim(), seller_id, category_id]
        );
        res.status(201).json(result.rows[0]);
    } catch (error) {
        handleDatabaseError(error, res);
    }
};

exports.updateProduct = async (req, res) => {
    if (!isValidId(req.params.id)) return res.status(400).json({ message: "Product id must be a positive integer." });

    const suppliedFields = productFields.filter((field) => req.body && Object.prototype.hasOwnProperty.call(req.body, field));
    if (suppliedFields.length === 0) return res.status(400).json({ message: "Provide at least one product field to update." });

    const validationError = validateProduct(req.body, false);
    if (validationError) return res.status(400).json({ message: validationError });

    const values = suppliedFields.map((field) => {
        const value = req.body[field];
        return ["name", "description", "image"].includes(field) ? value.trim() : value;
    });
    values.push(req.params.id);
    const assignments = suppliedFields.map((field, index) => `${field} = $${index + 1}`).join(", ");

    try {
        const result = await pool.query(
            `UPDATE products SET ${assignments} WHERE product_id = $${values.length}
             RETURNING product_id, name, description, price, stock, image, seller_id, category_id`,
            values
        );
        if (result.rowCount === 0) return res.status(404).json({ message: "Product not found." });
        res.status(200).json(result.rows[0]);
    } catch (error) {
        handleDatabaseError(error, res);
    }
};

exports.deleteProduct = async (req, res) => {
    if (!isValidId(req.params.id)) return res.status(400).json({ message: "Product id must be a positive integer." });

    try {
        const result = await pool.query("DELETE FROM products WHERE product_id = $1 RETURNING product_id", [req.params.id]);
        if (result.rowCount === 0) return res.status(404).json({ message: "Product not found." });
        res.status(200).json({ message: "Product deleted successfully.", product_id: result.rows[0].product_id });
    } catch (error) {
        handleDatabaseError(error, res);
    }
};
