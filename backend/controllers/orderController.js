const pool = require("../db");
const { createSellerNotification } = require("../services/notificationService");

function requireCustomer(req, res) {
    if (req.user.role === "customer") return true;
    res.status(403).json({ message: "Only customer accounts can access orders." });
    return false;
}

function isValidId(value) {
    return typeof value === "string" && /^\d+$/.test(value) && BigInt(value) > 0n;
}

function validateCheckout(body) {
    if (!body || typeof body !== "object" || Array.isArray(body)) return "Request body must be a JSON object.";
    if (typeof body.payment_method !== "string" || body.payment_method.trim() === "") return "payment_method is required.";
    if (body.payment_method.trim().length > 100) return "payment_method must be at most 100 characters.";
    if (typeof body.shipping_address !== "string" || body.shipping_address.trim() === "") return "shipping_address is required.";
    return null;
}

async function rollback(client) {
    try {
        await client.query("ROLLBACK");
    } catch (error) {
        console.error("Order rollback error:", error);
    }
}

function sendOrderError(error, res) {
    console.error("Order database error:", error);
    return res.status(500).json({ message: "Unable to process order request." });
}

function buildItems(rows) {
    return rows.map((row) => ({
        order_item_id: row.order_item_id,
        product_id: row.product_id,
        product_name: row.product_name,
        product_image: row.product_image,
        quantity: row.quantity,
        price: row.price,
        subtotal: row.subtotal
    }));
}

function calculateSubtotal(price, quantity) {
    const [whole, decimal = ""] = String(price).split(".");
    const cents = BigInt(whole) * 100n + BigInt(`${decimal}00`.slice(0, 2));
    const subtotalInCents = cents * BigInt(quantity);
    const formatted = subtotalInCents.toString().padStart(3, "0");
    return `${formatted.slice(0, -2)}.${formatted.slice(-2)}`;
}

exports.createOrder = async (req, res) => {
    if (!requireCustomer(req, res)) return;
    const validationError = validateCheckout(req.body);
    if (validationError) return res.status(400).json({ message: validationError });

    const client = await pool.connect();
    try {
        await client.query("BEGIN");
        const cartResult = await client.query(
            "SELECT cart_id FROM carts WHERE customer_id = $1 FOR UPDATE",
            [req.user.sub]
        );
        if (cartResult.rowCount === 0) {
            await rollback(client);
            return res.status(404).json({ message: "Cart not found." });
        }

        const cartId = cartResult.rows[0].cart_id;
        const cartItemsResult = await client.query(
            `SELECT
                ci.cart_item_id,
                ci.product_id,
                ci.quantity,
                p.name AS product_name,
                p.image AS product_image,
                p.price,
                p.stock,
                p.seller_id
             FROM cart_items ci
             INNER JOIN products p ON p.product_id = ci.product_id
             WHERE ci.cart_id = $1
             FOR UPDATE OF ci, p`,
            [cartId]
        );
        if (cartItemsResult.rowCount === 0) {
            await rollback(client);
            return res.status(400).json({ message: "Cart is empty." });
        }

        // Consolidate defensively in case legacy data contains duplicate cart rows.
        const itemsByProduct = new Map();
        for (const item of cartItemsResult.rows) {
            const quantity = Number(item.quantity);
            if (!Number.isSafeInteger(quantity) || quantity <= 0) {
                await rollback(client);
                return res.status(400).json({ message: "Cart contains an invalid item quantity." });
            }
            const existingItem = itemsByProduct.get(String(item.product_id));
            if (existingItem) {
                existingItem.quantity += quantity;
            } else {
                itemsByProduct.set(String(item.product_id), { ...item, quantity });
            }
        }
        const cartItems = [...itemsByProduct.values()];
        for (const item of cartItems) {
            if (item.quantity > item.stock) {
                await rollback(client);
                return res.status(409).json({ message: `Insufficient stock for product ${item.product_id}.` });
            }
        }

        const totalResult = await client.query(
            `SELECT COALESCE(SUM(p.price * ci.quantity), 0) AS total_amount
             FROM cart_items ci
             INNER JOIN products p ON p.product_id = ci.product_id
             WHERE ci.cart_id = $1`,
            [cartId]
        );
        const totalAmount = totalResult.rows[0].total_amount;
        const orderResult = await client.query(
            `INSERT INTO orders (order_date, total_amount, payment_method, shipping_address, status, customer_id)
             VALUES (CURRENT_DATE, $1, $2, $3, 'Pending', $4)
             RETURNING order_id, order_date, total_amount, payment_method, shipping_address, status, customer_id`,
            [totalAmount, req.body.payment_method.trim(), req.body.shipping_address.trim(), req.user.sub]
        );
        const order = orderResult.rows[0];
        const createdItems = [];

        for (const item of cartItems) {
            const orderItemResult = await client.query(
                `INSERT INTO order_items (quantity, price, order_id, product_id)
                 VALUES ($1, $2, $3, $4)
                 RETURNING order_item_id, quantity, price, order_id, product_id`,
                [item.quantity, item.price, order.order_id, item.product_id]
            );
            await client.query(
                "UPDATE products SET stock = stock - $1 WHERE product_id = $2",
                [item.quantity, item.product_id]
            );
            const orderItem = orderItemResult.rows[0];
            createdItems.push({
                ...orderItem,
                product_name: item.product_name,
                product_image: item.product_image,
                subtotal: calculateSubtotal(item.price, item.quantity)
            });
        }

        await client.query("DELETE FROM cart_items WHERE cart_id = $1", [cartId]);
        const sellerIds = new Set(cartItems.map((item) => String(item.seller_id)));
        for (const sellerId of sellerIds) {
            await createSellerNotification(client, sellerId, `New order received: Order #${order.order_id}`);
        }
        await client.query("COMMIT");
        return res.status(201).json({ message: "Order created successfully.", order, items: createdItems });
    } catch (error) {
        await rollback(client);
        return sendOrderError(error, res);
    } finally {
        client.release();
    }
};

exports.getOrders = async (req, res) => {
    if (!requireCustomer(req, res)) return;

    try {
        const ordersResult = await pool.query(
            `SELECT order_id, order_date, total_amount, payment_method, shipping_address, status
             FROM orders
             WHERE customer_id = $1
             ORDER BY order_id DESC`,
            [req.user.sub]
        );
        if (ordersResult.rowCount === 0) return res.status(200).json([]);

        const orderIds = ordersResult.rows.map((order) => order.order_id);
        const itemsResult = await pool.query(
            `SELECT
                oi.order_item_id,
                oi.order_id,
                oi.product_id,
                oi.quantity,
                oi.price,
                p.name AS product_name,
                p.image AS product_image,
                (oi.price * oi.quantity) AS subtotal
             FROM order_items oi
             INNER JOIN products p ON p.product_id = oi.product_id
             WHERE oi.order_id = ANY($1::BIGINT[])
             ORDER BY oi.order_item_id`,
            [orderIds]
        );
        const itemsByOrder = new Map();
        for (const item of itemsResult.rows) {
            const items = itemsByOrder.get(String(item.order_id)) || [];
            items.push(...buildItems([item]));
            itemsByOrder.set(String(item.order_id), items);
        }

        return res.status(200).json(ordersResult.rows.map((order) => ({
            ...order,
            items: itemsByOrder.get(String(order.order_id)) || []
        })));
    } catch (error) {
        return sendOrderError(error, res);
    }
};

exports.getOrderById = async (req, res) => {
    if (!requireCustomer(req, res)) return;
    const { orderId } = req.params;
    if (!isValidId(orderId)) return res.status(400).json({ message: "orderId must be a positive integer." });

    try {
        const orderResult = await pool.query(
            `SELECT order_id, order_date, total_amount, payment_method, shipping_address, status
             FROM orders
             WHERE order_id = $1 AND customer_id = $2`,
            [orderId, req.user.sub]
        );
        if (orderResult.rowCount === 0) return res.status(404).json({ message: "Order not found." });

        const itemsResult = await pool.query(
            `SELECT
                oi.order_item_id,
                oi.product_id,
                oi.quantity,
                oi.price,
                p.name AS product_name,
                p.image AS product_image,
                (oi.price * oi.quantity) AS subtotal
             FROM order_items oi
             INNER JOIN products p ON p.product_id = oi.product_id
             WHERE oi.order_id = $1
             ORDER BY oi.order_item_id`,
            [orderId]
        );
        return res.status(200).json({ ...orderResult.rows[0], items: buildItems(itemsResult.rows) });
    } catch (error) {
        return sendOrderError(error, res);
    }
};

exports.cancelOrder = async (req, res) => {
    if (!requireCustomer(req, res)) return;
    const { orderId } = req.params;
    if (!isValidId(orderId)) return res.status(400).json({ message: "orderId must be a positive integer." });

    const client = await pool.connect();
    try {
        await client.query("BEGIN");
        const orderResult = await client.query(
            `SELECT order_id, order_date, total_amount, payment_method, shipping_address, status
             FROM orders
             WHERE order_id = $1 AND customer_id = $2
             FOR UPDATE`,
            [orderId, req.user.sub]
        );
        if (orderResult.rowCount === 0) {
            await rollback(client);
            return res.status(404).json({ message: "Order not found." });
        }
        if (orderResult.rows[0].status !== "Pending") {
            await rollback(client);
            return res.status(409).json({ message: "Only Pending orders can be cancelled." });
        }

        const itemsResult = await client.query(
            `SELECT oi.product_id, oi.quantity
             FROM order_items oi
             INNER JOIN products p ON p.product_id = oi.product_id
             WHERE oi.order_id = $1
             FOR UPDATE OF oi, p`,
            [orderId]
        );
        for (const item of itemsResult.rows) {
            await client.query(
                "UPDATE products SET stock = stock + $1 WHERE product_id = $2",
                [item.quantity, item.product_id]
            );
        }

        const cancelledOrder = await client.query(
            "UPDATE orders SET status = 'Cancelled' WHERE order_id = $1 RETURNING order_id, order_date, total_amount, payment_method, shipping_address, status",
            [orderId]
        );
        await client.query("COMMIT");
        return res.status(200).json({ message: "Order cancelled successfully.", order: cancelledOrder.rows[0] });
    } catch (error) {
        await rollback(client);
        return sendOrderError(error, res);
    } finally {
        client.release();
    }
};
