const pool = require("../db");
const { createSellerNotification, createAdminNotification } = require("../services/notificationService");
const { getDeliveryCoordinates, isLocationInBangladesh } = require("../services/deliveryLocationService");
const eventService = require("../services/eventService");

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
    const coordinates = getDeliveryCoordinates(body);
    if (!coordinates || !isLocationInBangladesh(coordinates)) return "Please select a delivery location within Bangladesh.";
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
    if (error.code === "42703" && /delivery_(latitude|longitude)/.test(error.message)) {
        return res.status(500).json({ message: "Order setup is incomplete. Apply the delivery-location database migration and try again." });
    }
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

    const coordinates = getDeliveryCoordinates(req.body);
    const client = await pool.connect();
    try {
        await client.query("BEGIN");

        // CSE216 Stored Procedure 2: process_order_checkout
        const callResult = await client.query(
            "CALL process_order_checkout($1, $2, $3, $4, $5, NULL, NULL)",
            [
                req.user.sub,
                req.body.payment_method.trim(),
                req.body.shipping_address.trim(),
                coordinates.latitude,
                coordinates.longitude
            ]
        );
        const orderId = callResult.rows[0].p_order_id;

        const orderResult = await client.query(
            `SELECT order_id, order_date, total_amount, payment_method, shipping_address, delivery_latitude, delivery_longitude, status, customer_id
             FROM orders
             WHERE order_id = $1`,
            [orderId]
        );
        const order = orderResult.rows[0];

        const itemsResult = await client.query(
            `SELECT oi.order_item_id, oi.quantity, oi.price, oi.order_id, oi.product_id,
                    p.name AS product_name, p.image AS product_image,
                    (oi.price * oi.quantity) AS subtotal
             FROM order_items oi
             JOIN products p ON p.product_id = oi.product_id
             WHERE oi.order_id = $1
             ORDER BY oi.order_item_id`,
            [orderId]
        );
        const createdItems = itemsResult.rows.map((row) => ({
            order_item_id: row.order_item_id,
            quantity: row.quantity,
            price: row.price,
            order_id: row.order_id,
            product_id: row.product_id,
            product_name: row.product_name,
            product_image: row.product_image,
            subtotal: calculateSubtotal(row.price, row.quantity)
        }));

        await client.query("COMMIT");
        eventService.broadcast("notification_sent", { role: "admin" });
        eventService.broadcast("order_updated", { orderId: order.order_id, status: "Pending" });
        eventService.broadcast("stats_updated");
        return res.status(201).json({ message: "Order created successfully.", order, items: createdItems });
    } catch (error) {
        await rollback(client);
        if (error.code === "P0002" || (error.message && error.message.includes("Cart not found"))) {
            return res.status(404).json({ message: "Cart not found." });
        }
        if (error.code === "P0003" || (error.message && error.message.includes("Cart is empty"))) {
            return res.status(400).json({ message: "Cart is empty." });
        }
        if (error.code === "P0004" || (error.message && error.message.includes("Insufficient stock"))) {
            return res.status(409).json({ message: error.message });
        }
        if (error.code === "P0005" || (error.message && error.message.includes("Cart contains an invalid item quantity"))) {
            return res.status(400).json({ message: "Cart contains an invalid item quantity." });
        }
        return sendOrderError(error, res);
    } finally {
        client.release();
    }
};

exports.validateDeliveryLocation = (req, res) => {
    if (!requireCustomer(req, res)) return;
    const coordinates = getDeliveryCoordinates(req.body);
    if (!coordinates || !isLocationInBangladesh(coordinates)) {
        return res.status(400).json({ message: "Please select a delivery location within Bangladesh." });
    }
    return res.status(200).json({ message: "Delivery location is valid." });
};

exports.getOrders = async (req, res) => {
    if (!requireCustomer(req, res)) return;

    try {
        const ordersResult = await pool.query(
            `SELECT o.order_id, o.order_date, o.total_amount, o.payment_method, o.shipping_address, o.delivery_latitude, o.delivery_longitude, o.status, o.delivery_status, o.estimated_delivery_time,
                    d.name AS deliveryman_name, d.phone AS deliveryman_phone
             FROM orders o LEFT JOIN deliverymen d ON d.deliveryman_id = o.deliveryman_id
             WHERE o.customer_id = $1
             ORDER BY o.order_id DESC`,
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
            `SELECT o.order_id, o.order_date, o.total_amount, o.payment_method, o.shipping_address, o.delivery_latitude, o.delivery_longitude, o.status, o.delivery_status, o.estimated_delivery_time,
                    d.name AS deliveryman_name, d.phone AS deliveryman_phone
             FROM orders o LEFT JOIN deliverymen d ON d.deliveryman_id=o.deliveryman_id
             WHERE o.order_id = $1 AND o.customer_id = $2`,
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

        // CSE216 Stored Procedure 1: cancel_order_procedure
        await client.query("CALL cancel_order_procedure($1, $2)", [orderId, req.user.sub]);

        const cancelledOrder = await client.query(
            "SELECT order_id, order_date, total_amount, payment_method, shipping_address, delivery_latitude, delivery_longitude, status FROM orders WHERE order_id = $1",
            [orderId]
        );
        await client.query("COMMIT");
        eventService.broadcast("order_updated", { orderId, status: "Cancelled" });
        eventService.broadcast("stats_updated");
        return res.status(200).json({ message: "Order cancelled successfully.", order: cancelledOrder.rows[0] });
    } catch (error) {
        await rollback(client);
        if (error.code === "P0002" || (error.message && error.message.includes("Order not found"))) {
            return res.status(404).json({ message: "Order not found." });
        }
        if (error.code === "P0001" || (error.message && error.message.includes("Only Pending orders can be cancelled"))) {
            return res.status(409).json({ message: "Only Pending orders can be cancelled." });
        }
        return sendOrderError(error, res);
    } finally {
        client.release();
    }
};
