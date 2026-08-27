const pool = require("../db");

function requireCustomer(req, res) {
    if (req.user.role === "customer") return true;
    res.status(403).json({ message: "Only customer accounts can use a cart." });
    return false;
}

function isPositiveInteger(value) {
    return typeof value === "number" && Number.isSafeInteger(value) && value > 0;
}

function isValidId(value) {
    return typeof value === "string" && /^\d+$/.test(value) && BigInt(value) > 0n;
}

function validateItemRequest(productId, quantity, res) {
    if (!isValidId(String(productId))) {
        res.status(400).json({ message: "product_id must be a positive integer." });
        return false;
    }
    if (!isPositiveInteger(quantity)) {
        res.status(400).json({ message: "quantity must be a positive integer." });
        return false;
    }
    return true;
}

async function getCartForUpdate(client, customerId) {
    const result = await client.query(
        `INSERT INTO carts (created_date, customer_id)
         VALUES (CURRENT_DATE, $1)
         ON CONFLICT (customer_id) DO UPDATE SET customer_id = EXCLUDED.customer_id
         RETURNING cart_id, created_date`,
        [customerId]
    );
    return result.rows[0];
}

async function findProduct(client, productId) {
    const result = await client.query(
        "SELECT product_id, stock FROM products WHERE product_id = $1 FOR SHARE",
        [productId]
    );
    return result.rows[0];
}

function sendCartError(error, res) {
    console.error("Cart database error:", error);
    return res.status(500).json({ message: "Unable to process cart request." });
}

exports.getCart = async (req, res) => {
    if (!requireCustomer(req, res)) return;

    try {
        const cartResult = await pool.query(
            "SELECT cart_id, created_date FROM carts WHERE customer_id = $1",
            [req.user.sub]
        );
        if (cartResult.rowCount === 0) {
            return res.status(200).json({ cart: null, items: [], total: "0.00" });
        }

        const cart = cartResult.rows[0];
        const itemsResult = await pool.query(
            `SELECT
                ci.cart_item_id,
                ci.product_id,
                p.name AS product_name,
                p.price,
                p.image,
                ci.quantity,
                (p.price * ci.quantity) AS subtotal
             FROM cart_items ci
             INNER JOIN products p ON p.product_id = ci.product_id
             WHERE ci.cart_id = $1
             ORDER BY ci.cart_item_id`,
            [cart.cart_id]
        );
        const totalResult = await pool.query(
            `SELECT COALESCE(SUM(p.price * ci.quantity), 0) AS total
             FROM cart_items ci
             INNER JOIN products p ON p.product_id = ci.product_id
             WHERE ci.cart_id = $1`,
            [cart.cart_id]
        );

        return res.status(200).json({
            cart,
            items: itemsResult.rows,
            total: totalResult.rows[0].total
        });
    } catch (error) {
        return sendCartError(error, res);
    }
};

exports.addCartItem = async (req, res) => {
    if (!requireCustomer(req, res)) return;
    const { product_id: productId, quantity } = req.body || {};
    if (!validateItemRequest(productId, quantity, res)) return;

    const client = await pool.connect();
    try {
        await client.query("BEGIN");
        const product = await findProduct(client, productId);
        if (!product) {
            await client.query("ROLLBACK");
            return res.status(404).json({ message: "Product not found." });
        }

        const requestedQuantity = Number(quantity);
        if (requestedQuantity > product.stock) {
            await client.query("ROLLBACK");
            return res.status(409).json({ message: "Requested quantity exceeds available stock." });
        }

        const cart = await getCartForUpdate(client, req.user.sub);
        const existingItem = await client.query(
            "SELECT COALESCE(SUM(quantity), 0) AS quantity FROM cart_items WHERE cart_id = $1 AND product_id = $2",
            [cart.cart_id, productId]
        );
        const existingQuantity = Number(existingItem.rows[0].quantity);
        const newQuantity = existingQuantity + requestedQuantity;
        if (newQuantity > product.stock) {
            await client.query("ROLLBACK");
            return res.status(409).json({ message: "Total cart quantity exceeds available stock." });
        }

        // The schema has no cart_id/product_id uniqueness constraint. Replacing any
        // legacy duplicates with one row maintains one logical item per product.
        await client.query("DELETE FROM cart_items WHERE cart_id = $1 AND product_id = $2", [cart.cart_id, productId]);
        const itemResult = await client.query(
            `INSERT INTO cart_items (quantity, cart_id, product_id)
             VALUES ($1, $2, $3)
             RETURNING cart_item_id, product_id, quantity`,
            [newQuantity, cart.cart_id, productId]
        );
        await client.query("COMMIT");

        return res.status(existingQuantity > 0 ? 200 : 201).json({
            message: existingQuantity > 0 ? "Cart item quantity increased." : "Product added to cart.",
            cart,
            item: itemResult.rows[0]
        });
    } catch (error) {
        await client.query("ROLLBACK");
        return sendCartError(error, res);
    } finally {
        client.release();
    }
};

exports.updateCartItem = async (req, res) => {
    if (!requireCustomer(req, res)) return;
    const { productId } = req.params;
    const { quantity } = req.body || {};
    if (!validateItemRequest(productId, quantity, res)) return;

    const client = await pool.connect();
    try {
        await client.query("BEGIN");
        const product = await findProduct(client, productId);
        if (!product) {
            await client.query("ROLLBACK");
            return res.status(404).json({ message: "Product not found." });
        }
        if (Number(quantity) > product.stock) {
            await client.query("ROLLBACK");
            return res.status(409).json({ message: "Requested quantity exceeds available stock." });
        }

        const cartResult = await client.query(
            "SELECT cart_id FROM carts WHERE customer_id = $1 FOR UPDATE",
            [req.user.sub]
        );
        if (cartResult.rowCount === 0) {
            await client.query("ROLLBACK");
            return res.status(404).json({ message: "Cart item not found." });
        }
        const cartId = cartResult.rows[0].cart_id;
        const itemResult = await client.query(
            "SELECT cart_item_id FROM cart_items WHERE cart_id = $1 AND product_id = $2 LIMIT 1",
            [cartId, productId]
        );
        if (itemResult.rowCount === 0) {
            await client.query("ROLLBACK");
            return res.status(404).json({ message: "Cart item not found." });
        }

        await client.query("DELETE FROM cart_items WHERE cart_id = $1 AND product_id = $2", [cartId, productId]);
        const updatedItem = await client.query(
            `INSERT INTO cart_items (quantity, cart_id, product_id)
             VALUES ($1, $2, $3)
             RETURNING cart_item_id, product_id, quantity`,
            [Number(quantity), cartId, productId]
        );
        await client.query("COMMIT");
        return res.status(200).json({ message: "Cart item updated.", item: updatedItem.rows[0] });
    } catch (error) {
        await client.query("ROLLBACK");
        return sendCartError(error, res);
    } finally {
        client.release();
    }
};

exports.removeCartItem = async (req, res) => {
    if (!requireCustomer(req, res)) return;
    const { productId } = req.params;
    if (!isValidId(productId)) return res.status(400).json({ message: "product_id must be a positive integer." });

    try {
        const result = await pool.query(
            `DELETE FROM cart_items ci
             USING carts c
             WHERE ci.cart_id = c.cart_id AND c.customer_id = $1 AND ci.product_id = $2
             RETURNING ci.cart_item_id`,
            [req.user.sub, productId]
        );
        if (result.rowCount === 0) return res.status(404).json({ message: "Cart item not found." });
        return res.status(200).json({ message: "Product removed from cart." });
    } catch (error) {
        return sendCartError(error, res);
    }
};

exports.clearCart = async (req, res) => {
    if (!requireCustomer(req, res)) return;

    try {
        const result = await pool.query(
            `DELETE FROM cart_items ci
             USING carts c
             WHERE ci.cart_id = c.cart_id AND c.customer_id = $1`,
            [req.user.sub]
        );
        return res.status(200).json({ message: "Cart cleared successfully.", removed_items: result.rowCount });
    } catch (error) {
        return sendCartError(error, res);
    }
};
