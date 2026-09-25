const pool = require("../db");
const { createSellerNotification, createDeliverymanNotification } = require("../services/notificationService");
const eventService = require("../services/eventService");

function validId(value) {
    return typeof value === "string" && /^\d+$/.test(value) && BigInt(value) > 0n;
}

function publicSeller(row) {
    return {
        seller_id: row.seller_id,
        name: row.name,
        email: row.email,
        phone: row.phone,
        approval_status: row.approval_status,
        suspended_until: row.suspended_until,
        product_count: Number(row.product_count || 0),
        total_revenue: Number(row.total_revenue || 0),
        created_at: row.created_at
    };
}

function publicDeliveryman(row) {
    return {
        deliveryman_id: row.deliveryman_id,
        name: row.name,
        email: row.email,
        phone: row.phone,
        approval_status: row.approval_status,
        availability_status: row.availability_status,
        suspended_until: row.suspended_until,
        delivery_location: row.delivery_location,
        created_at: row.created_at
    };
}

// ==========================================
// 1. REAL-TIME DASHBOARD STATISTICS
// ==========================================

exports.getStats = async (req, res) => {
    try {
        const countsQuery = `
            SELECT
                (SELECT COUNT(1)::int FROM customers) AS total_customers,
                (SELECT COUNT(1)::int FROM sellers) AS total_sellers,
                (SELECT COUNT(1)::int FROM deliverymen) AS total_deliverymen,
                (SELECT COUNT(1)::int FROM admins) AS total_admins,
                (SELECT COUNT(1)::int FROM products) AS total_products,
                (SELECT COUNT(1)::int FROM products WHERE status = 'active') AS active_products,
                (SELECT COUNT(1)::int FROM products WHERE status = 'paused') AS paused_products,
                (SELECT COUNT(1)::int FROM orders) AS total_orders,
                (SELECT COALESCE(SUM(total_amount), 0)::numeric FROM orders WHERE status != 'Cancelled') AS total_sales,
                (SELECT COALESCE(SUM(total_amount), 0)::numeric FROM orders WHERE order_date = CURRENT_DATE AND status != 'Cancelled') AS sales_today,
                (SELECT COUNT(1)::int FROM orders WHERE order_date = CURRENT_DATE) AS orders_today,
                (SELECT COUNT(1)::int FROM orders WHERE status = 'Pending') AS pending_orders,
                (SELECT COUNT(1)::int FROM orders WHERE status = 'Processing') AS processing_orders,
                (SELECT COUNT(1)::int FROM orders WHERE status = 'Shipped') AS shipped_orders,
                (SELECT COUNT(1)::int FROM orders WHERE status = 'Delivered') AS completed_orders,
                (SELECT COUNT(1)::int FROM orders WHERE status = 'Cancelled') AS cancelled_orders,
                (SELECT COUNT(1)::int FROM sellers WHERE approval_status = 'pending') AS pending_seller_approvals,
                (SELECT COUNT(1)::int FROM sellers WHERE approval_status = 'approved') AS active_sellers,
                (SELECT COUNT(1)::int FROM sellers WHERE approval_status = 'suspended') AS paused_sellers,
                (SELECT COUNT(1)::int FROM sellers WHERE approval_status = 'rejected') AS rejected_sellers,
                (SELECT COUNT(1)::int FROM deliverymen WHERE approval_status = 'pending') AS pending_deliveryman_approvals,
                (SELECT COUNT(1)::int FROM deliverymen WHERE approval_status = 'approved') AS active_deliverymen,
                (SELECT COUNT(1)::int FROM deliverymen WHERE approval_status = 'suspended') AS paused_deliverymen
        `;

        const salesOverTimeQuery = `
            SELECT
                TO_CHAR(d.date, 'YYYY-MM-DD') AS day,
                TO_CHAR(d.date, 'Mon DD') AS label,
                COALESCE(SUM(o.total_amount), 0)::numeric AS sales,
                COUNT(o.order_id)::int AS orders
            FROM generate_series(CURRENT_DATE - INTERVAL '6 days', CURRENT_DATE, '1 day'::interval) d(date)
            LEFT JOIN orders o ON o.order_date = d.date::DATE AND o.status != 'Cancelled'
            GROUP BY d.date
            ORDER BY d.date ASC
        `;

        const [countsResult, salesOverTimeResult] = await Promise.all([
            pool.query(countsQuery),
            pool.query(salesOverTimeQuery)
        ]);

        const counts = countsResult.rows[0];
        const salesOverTime = salesOverTimeResult.rows;

        const ordersByStatus = [
            { status: "Pending", count: counts.pending_orders, color: "#f59e0b" },
            { status: "Processing", count: counts.processing_orders, color: "#3b82f6" },
            { status: "Shipped", count: counts.shipped_orders, color: "#8b5cf6" },
            { status: "Delivered", count: counts.completed_orders, color: "#10b981" },
            { status: "Cancelled", count: counts.cancelled_orders, color: "#ef4444" }
        ];

        const usersByType = [
            { type: "Customers", count: counts.total_customers, color: "#3b82f6" },
            { type: "Sellers", count: counts.total_sellers, color: "#10b981" },
            { type: "Deliverymen", count: counts.total_deliverymen, color: "#f59e0b" },
            { type: "Admins", count: counts.total_admins, color: "#6366f1" }
        ];

        return res.json({
            ...counts,
            total_sales: Number(counts.total_sales),
            sales_today: Number(counts.sales_today),
            sales_over_time: salesOverTime.map(s => ({ ...s, sales: Number(s.sales) })),
            orders_by_status: ordersByStatus,
            users_by_type: usersByType
        });
    } catch (error) {
        console.error("Admin stats error:", error);
        return res.status(500).json({ message: "Unable to retrieve admin statistics." });
    }
};

// ==========================================
// 2. PRODUCT ADMINISTRATION
// ==========================================

exports.getAdminProducts = async (req, res) => {
    try {
        const query = `
            SELECT
                p.product_id,
                p.name,
                p.description,
                p.price,
                p.stock,
                p.image,
                p.status,
                c.category_id,
                c.category_name,
                s.seller_id,
                s.name AS seller_name,
                s.email AS seller_email,
                (SELECT COUNT(1)::int FROM order_items oi WHERE oi.product_id = p.product_id) AS order_count,
                COALESCE(get_product_sold_quantity(p.product_id), 0) AS sold_quantity
            FROM products p
            INNER JOIN categories c ON c.category_id = p.category_id
            INNER JOIN sellers s ON s.seller_id = p.seller_id
            ORDER BY p.product_id DESC
        `;
        const result = await pool.query(query);
        return res.json(result.rows);
    } catch (error) {
        console.error("Admin product list error:", error);
        return res.status(500).json({ message: "Unable to retrieve products." });
    }
};

exports.pauseProduct = async (req, res) => {
    const { productId } = req.params;
    if (!validId(productId)) return res.status(400).json({ message: "productId must be a positive integer." });

    const client = await pool.connect();
    try {
        await client.query("BEGIN");
        const prodRes = await client.query(
            "SELECT product_id, name, seller_id FROM products WHERE product_id = $1 FOR UPDATE",
            [productId]
        );
        if (!prodRes.rowCount) {
            await client.query("ROLLBACK");
            return res.status(404).json({ message: "Product not found." });
        }
        const prod = prodRes.rows[0];

        const result = await client.query(
            "UPDATE products SET status = 'paused' WHERE product_id = $1 RETURNING product_id, name, status",
            [productId]
        );

        await createSellerNotification(
            client,
            prod.seller_id,
            `Your product "${prod.name}" (ID #${prod.product_id}) has been paused by the admin and removed from the store. You may contact admin to appeal this action.`
        );

        await client.query("COMMIT");

        eventService.broadcast("product_updated", { productId, status: "paused" });
        eventService.broadcast("notification_sent", { role: "seller", recipientId: prod.seller_id });
        eventService.broadcast("stats_updated");
        return res.json({ message: "Product paused successfully.", product: result.rows[0] });
    } catch (error) {
        try { await client.query("ROLLBACK"); } catch (_) {}
        console.error("Pause product error:", error);
        return res.status(500).json({ message: "Unable to pause product." });
    } finally {
        client.release();
    }
};

exports.unpauseProduct = async (req, res) => {
    const { productId } = req.params;
    if (!validId(productId)) return res.status(400).json({ message: "productId must be a positive integer." });

    const client = await pool.connect();
    try {
        await client.query("BEGIN");
        const prodRes = await client.query(
            "SELECT product_id, name, seller_id FROM products WHERE product_id = $1 FOR UPDATE",
            [productId]
        );
        if (!prodRes.rowCount) {
            await client.query("ROLLBACK");
            return res.status(404).json({ message: "Product not found." });
        }
        const prod = prodRes.rows[0];

        const result = await client.query(
            "UPDATE products SET status = 'active' WHERE product_id = $1 RETURNING product_id, name, status",
            [productId]
        );

        await createSellerNotification(
            client,
            prod.seller_id,
            `Your product "${prod.name}" (ID #${prod.product_id}) has been unpaused and is now active in the store.`
        );

        await client.query("COMMIT");

        eventService.broadcast("product_updated", { productId, status: "active" });
        eventService.broadcast("notification_sent", { role: "seller", recipientId: prod.seller_id });
        eventService.broadcast("stats_updated");
        return res.json({ message: "Product unpaused successfully.", product: result.rows[0] });
    } catch (error) {
        try { await client.query("ROLLBACK"); } catch (_) {}
        console.error("Unpause product error:", error);
        return res.status(500).json({ message: "Unable to unpause product." });
    } finally {
        client.release();
    }
};

exports.deleteProductSafely = async (req, res) => {
    const { productId } = req.params;
    if (!validId(productId)) return res.status(400).json({ message: "productId must be a positive integer." });

    const client = await pool.connect();
    try {
        await client.query("BEGIN");
        // Verify product exists
        const prod = await client.query("SELECT product_id, name FROM products WHERE product_id = $1 FOR UPDATE", [productId]);
        if (!prod.rowCount) {
            await client.query("ROLLBACK");
            return res.status(404).json({ message: "Product not found." });
        }

        // Check if there are orders referencing this product
        const orderItems = await client.query("SELECT COUNT(1)::int AS count FROM order_items WHERE product_id = $1", [productId]);
        if (orderItems.rows[0].count > 0) {
            await client.query("ROLLBACK");
            return res.status(409).json({
                message: "Cannot permanently delete product because it has associated orders in transaction history. You can pause the product instead to remove it from the store."
            });
        }

        // Safe to delete: remove dependent reviews and cart items
        await client.query("DELETE FROM cart_items WHERE product_id = $1", [productId]);
        await client.query("DELETE FROM reviews WHERE product_id = $1", [productId]);
        await client.query("DELETE FROM products WHERE product_id = $1", [productId]);

        await client.query("COMMIT");
        eventService.broadcast("product_updated", { productId, deleted: true });
        eventService.broadcast("stats_updated");
        return res.json({ message: "Product permanently deleted safely.", productId });
    } catch (error) {
        try { await client.query("ROLLBACK"); } catch (_) {}
        console.error("Safe delete product error:", error);
        return res.status(500).json({ message: "Unable to delete product." });
    } finally {
        client.release();
    }
};

// ==========================================
// 3. SELLER ADMINISTRATION
// ==========================================

exports.getSellers = async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT
                s.seller_id, s.name, s.email, s.phone, s.approval_status, s.suspended_until, s.created_at,
                COUNT(p.product_id)::int AS product_count,
                get_seller_total_revenue(s.seller_id) AS total_revenue
            FROM sellers s
            LEFT JOIN products p ON p.seller_id = s.seller_id
            GROUP BY s.seller_id
            ORDER BY s.seller_id DESC
        `);
        return res.json(result.rows.map(publicSeller));
    } catch (error) {
        console.error("Admin seller list error:", error);
        return res.status(500).json({ message: "Unable to retrieve sellers." });
    }
};

exports.getPendingSellers = async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT
                s.seller_id, s.name, s.email, s.phone, s.approval_status, s.suspended_until, s.created_at,
                0 AS product_count
            FROM sellers s
            WHERE s.approval_status = 'pending'
            ORDER BY s.created_at, s.seller_id
        `);
        return res.json(result.rows.map(publicSeller));
    } catch (error) {
        console.error("Pending seller list error:", error);
        return res.status(500).json({ message: "Unable to retrieve pending sellers." });
    }
};

exports.setSellerDecision = async (req, res) => {
    const { sellerId } = req.params;
    const status = req.decision;
    if (!validId(sellerId)) return res.status(400).json({ message: "sellerId must be a positive integer." });

    const client = await pool.connect();
    try {
        await client.query("BEGIN");
        const seller = await client.query("SELECT seller_id FROM sellers WHERE seller_id = $1 FOR UPDATE", [sellerId]);
        if (seller.rowCount === 0) {
            await client.query("ROLLBACK");
            return res.status(404).json({ message: "Seller not found." });
        }
        const result = await client.query(`UPDATE sellers SET approval_status = $1, suspended_until = NULL WHERE seller_id = $2
            RETURNING seller_id, name, email, phone, approval_status, suspended_until, created_at`, [status, sellerId]);
        const message = status === "approved"
            ? "Your seller account has been approved by the admin. You can now access seller features."
            : "Your seller account has been rejected by the admin.";
        await createSellerNotification(client, sellerId, message);
        await client.query("COMMIT");

        eventService.broadcast("seller_updated", { sellerId, approval_status: status });
        eventService.broadcast("notification_sent", { role: "seller", recipientId: sellerId });
        eventService.broadcast("stats_updated");
        return res.json({ message: `Seller ${status} successfully.`, seller: publicSeller(result.rows[0]) });
    } catch (error) {
        try { await client.query("ROLLBACK"); } catch (_) {}
        console.error("Seller decision error:", error);
        return res.status(500).json({ message: "Unable to update seller approval status." });
    } finally {
        client.release();
    }
};

exports.approveSeller = (req, res) => { req.decision = "approved"; return exports.setSellerDecision(req, res); };
exports.rejectSeller = (req, res) => { req.decision = "rejected"; return exports.setSellerDecision(req, res); };

exports.suspendSeller = async (req, res) => {
    const { sellerId } = req.params;
    const { durationDays, reason } = req.body || {};
    if (!validId(sellerId)) return res.status(400).json({ message: "sellerId must be a positive integer." });

    const client = await pool.connect();
    try {
        await client.query("BEGIN");
        const seller = await client.query("SELECT seller_id, name FROM sellers WHERE seller_id = $1 FOR UPDATE", [sellerId]);
        if (!seller.rowCount) {
            await client.query("ROLLBACK");
            return res.status(404).json({ message: "Seller not found." });
        }

        let query = "";
        let params = [];

        if (Number.isInteger(Number(durationDays)) && Number(durationDays) > 0) {
            query = `UPDATE sellers
                     SET approval_status = 'suspended',
                         suspended_until = CURRENT_TIMESTAMP + ($1 || ' days')::interval
                     WHERE seller_id = $2
                     RETURNING seller_id, name, email, phone, approval_status, suspended_until, created_at`;
            params = [Number(durationDays), sellerId];
        } else {
            query = `UPDATE sellers
                     SET approval_status = 'suspended',
                         suspended_until = NULL
                     WHERE seller_id = $1
                     RETURNING seller_id, name, email, phone, approval_status, suspended_until, created_at`;
            params = [sellerId];
        }

        const result = await client.query(query, params);
        const untilText = result.rows[0].suspended_until
            ? ` for ${durationDays} days (until ${new Date(result.rows[0].suspended_until).toLocaleDateString()})`
            : " indefinitely";
        const reasonText = reason && typeof reason === "string" && reason.trim() ? ` Reason: ${reason.trim()}` : "";
        await createSellerNotification(client, sellerId, `Your seller account has been suspended by the admin${untilText}.${reasonText} You can contact admin to appeal this decision.`);

        await client.query("COMMIT");
        eventService.broadcast("seller_updated", { sellerId, approval_status: "suspended" });
        eventService.broadcast("notification_sent", { role: "seller", recipientId: sellerId });
        eventService.broadcast("stats_updated");
        return res.json({ message: `Seller suspended successfully${untilText}.`, seller: publicSeller(result.rows[0]) });
    } catch (error) {
        try { await client.query("ROLLBACK"); } catch (_) {}
        console.error("Suspend seller error:", error);
        return res.status(500).json({ message: "Unable to suspend seller." });
    } finally {
        client.release();
    }
};

exports.reactivateSeller = async (req, res) => {
    const { sellerId } = req.params;
    if (!validId(sellerId)) return res.status(400).json({ message: "sellerId must be a positive integer." });

    const client = await pool.connect();
    try {
        await client.query("BEGIN");
        const result = await client.query(
            `UPDATE sellers SET approval_status = 'approved', suspended_until = NULL WHERE seller_id = $1
             RETURNING seller_id, name, email, phone, approval_status, suspended_until, created_at`,
            [sellerId]
        );
        if (!result.rowCount) {
            await client.query("ROLLBACK");
            return res.status(404).json({ message: "Seller not found." });
        }
        await createSellerNotification(client, sellerId, "Your seller account has been reactivated. You can now access your seller dashboard.");
        await client.query("COMMIT");

        eventService.broadcast("seller_updated", { sellerId, approval_status: "approved" });
        eventService.broadcast("notification_sent", { role: "seller", recipientId: sellerId });
        eventService.broadcast("stats_updated");
        return res.json({ message: "Seller reactivated successfully.", seller: publicSeller(result.rows[0]) });
    } catch (error) {
        try { await client.query("ROLLBACK"); } catch (_) {}
        console.error("Reactivate seller error:", error);
        return res.status(500).json({ message: "Unable to reactivate seller." });
    } finally {
        client.release();
    }
};

exports.deleteSellerSafely = async (req, res) => {
    const { sellerId } = req.params;
    if (!validId(sellerId)) return res.status(400).json({ message: "sellerId must be a positive integer." });

    const client = await pool.connect();
    try {
        await client.query("BEGIN");
        const seller = await client.query("SELECT seller_id, email FROM sellers WHERE seller_id = $1 FOR UPDATE", [sellerId]);
        if (!seller.rowCount) {
            await client.query("ROLLBACK");
            return res.status(404).json({ message: "Seller not found." });
        }

        // Check if orders exist for any products from this seller
        const orderCheck = await client.query(
            `SELECT COUNT(1)::int AS count
             FROM order_items oi
             JOIN products p ON p.product_id = oi.product_id
             WHERE p.seller_id = $1`,
            [sellerId]
        );

        if (orderCheck.rows[0].count > 0) {
            await client.query("ROLLBACK");
            return res.status(409).json({
                message: "Cannot permanently delete seller because customer orders exist for their products. You can suspend the seller instead."
            });
        }

        // Clean up seller's products and dependencies
        const prodIds = await client.query("SELECT product_id FROM products WHERE seller_id = $1", [sellerId]);
        if (prodIds.rowCount > 0) {
            const ids = prodIds.rows.map(r => r.product_id);
            await client.query("DELETE FROM cart_items WHERE product_id = ANY($1::BIGINT[])", [ids]);
            await client.query("DELETE FROM reviews WHERE product_id = ANY($1::BIGINT[])", [ids]);
            await client.query("DELETE FROM products WHERE seller_id = $1", [sellerId]);
        }

        await client.query("DELETE FROM delivery_requests WHERE seller_id = $1", [sellerId]);
        await client.query("DELETE FROM notifications WHERE seller_id = $1", [sellerId]);
        await client.query("DELETE FROM sellers WHERE seller_id = $1", [sellerId]);

        await client.query("COMMIT");
        eventService.broadcast("seller_updated", { sellerId, deleted: true });
        eventService.broadcast("stats_updated");
        return res.json({ message: "Seller deleted permanently.", sellerId });
    } catch (error) {
        try { await client.query("ROLLBACK"); } catch (_) {}
        console.error("Delete seller error:", error);
        return res.status(500).json({ message: "Unable to delete seller." });
    } finally {
        client.release();
    }
};

// ==========================================
// 4. DELIVERYMAN ADMINISTRATION
// ==========================================

exports.getDeliverymen = async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT deliveryman_id, name, email, phone, approval_status, availability_status, suspended_until, delivery_location, created_at
            FROM deliverymen
            ORDER BY deliveryman_id DESC
        `);
        return res.json(result.rows.map(publicDeliveryman));
    } catch (error) {
        console.error("Admin deliveryman list error:", error);
        return res.status(500).json({ message: "Unable to retrieve deliverymen." });
    }
};

exports.setDeliverymanDecision = async (req, res) => {
    const { deliverymanId } = req.params;
    const status = req.decision;
    if (!validId(deliverymanId)) return res.status(400).json({ message: "deliverymanId must be a positive integer." });

    const client = await pool.connect();
    try {
        await client.query("BEGIN");
        const result = await client.query(
            `UPDATE deliverymen
             SET approval_status = $1::varchar,
                 suspended_until = NULL,
                 availability_status = CASE WHEN $1::varchar = 'approved' AND availability_status = 'offline' THEN 'available' ELSE availability_status END
             WHERE deliveryman_id = $2
             RETURNING deliveryman_id, name, email, phone, approval_status, availability_status, suspended_until, delivery_location, created_at`,
            [status, deliverymanId]
        );
        if (!result.rowCount) {
            await client.query("ROLLBACK");
            return res.status(404).json({ message: "Deliveryman not found." });
        }

        const notifMsg = status === "approved"
            ? "Your deliveryman account has been approved by the admin. You can now go online to accept delivery requests."
            : "Your deliveryman application has been rejected by an administrator.";
        await createDeliverymanNotification(client, deliverymanId, notifMsg);

        await client.query("COMMIT");

        eventService.broadcast("deliveryman_updated", { deliverymanId, approval_status: status });
        eventService.broadcast("notification_sent", { role: "deliveryman", recipientId: deliverymanId });
        eventService.broadcast("stats_updated");
        return res.json({ message: `Deliveryman ${status} successfully.`, deliveryman: publicDeliveryman(result.rows[0]) });
    } catch (error) {
        try { await client.query("ROLLBACK"); } catch (_) {}
        console.error("Deliveryman decision error:", error);
        return res.status(500).json({ message: "Unable to update deliveryman approval status." });
    } finally {
        client.release();
    }
};

exports.approveDeliveryman = (req, res) => { req.decision = "approved"; return exports.setDeliverymanDecision(req, res); };
exports.rejectDeliveryman = (req, res) => { req.decision = "rejected"; return exports.setDeliverymanDecision(req, res); };

exports.suspendDeliveryman = async (req, res) => {
    const { deliverymanId } = req.params;
    const { durationDays, reason } = req.body || {};
    if (!validId(deliverymanId)) return res.status(400).json({ message: "deliverymanId must be a positive integer." });

    const client = await pool.connect();
    try {
        await client.query("BEGIN");
        let query = "";
        let params = [];

        if (Number.isInteger(Number(durationDays)) && Number(durationDays) > 0) {
            query = `UPDATE deliverymen
                     SET approval_status = 'suspended',
                         availability_status = 'offline',
                         suspended_until = CURRENT_TIMESTAMP + ($1 || ' days')::interval
                     WHERE deliveryman_id = $2
                     RETURNING deliveryman_id, name, email, phone, approval_status, availability_status, suspended_until, delivery_location, created_at`;
            params = [Number(durationDays), deliverymanId];
        } else {
            query = `UPDATE deliverymen
                     SET approval_status = 'suspended',
                         availability_status = 'offline',
                         suspended_until = NULL
                     WHERE deliveryman_id = $1
                     RETURNING deliveryman_id, name, email, phone, approval_status, availability_status, suspended_until, delivery_location, created_at`;
            params = [deliverymanId];
        }

        const result = await client.query(query, params);
        if (!result.rowCount) {
            await client.query("ROLLBACK");
            return res.status(404).json({ message: "Deliveryman not found." });
        }

        const dRow = result.rows[0];
        const untilText = dRow.suspended_until
            ? ` for ${durationDays} days (until ${new Date(dRow.suspended_until).toLocaleDateString()})`
            : " indefinitely";
        const reasonText = reason && typeof reason === "string" && reason.trim() ? ` Reason: ${reason.trim()}` : "";
        const notifMsg = `Your deliveryman account has been suspended by the admin${untilText}.${reasonText} You can contact admin to appeal this decision.`;
        await createDeliverymanNotification(client, deliverymanId, notifMsg);

        await client.query("COMMIT");

        eventService.broadcast("deliveryman_updated", { deliverymanId, approval_status: "suspended" });
        eventService.broadcast("notification_sent", { role: "deliveryman", recipientId: deliverymanId });
        eventService.broadcast("stats_updated");
        return res.json({ message: `Deliveryman suspended successfully${untilText}.`, deliveryman: publicDeliveryman(dRow) });
    } catch (error) {
        try { await client.query("ROLLBACK"); } catch (_) {}
        console.error("Suspend deliveryman error:", error);
        return res.status(500).json({ message: "Unable to suspend deliveryman." });
    } finally {
        client.release();
    }
};

exports.reactivateDeliveryman = async (req, res) => {
    const { deliverymanId } = req.params;
    if (!validId(deliverymanId)) return res.status(400).json({ message: "deliverymanId must be a positive integer." });

    const client = await pool.connect();
    try {
        await client.query("BEGIN");
        const result = await client.query(
            `UPDATE deliverymen
             SET approval_status = 'approved',
                 availability_status = 'available',
                 suspended_until = NULL
             WHERE deliveryman_id = $1
             RETURNING deliveryman_id, name, email, phone, approval_status, availability_status, suspended_until, delivery_location, created_at`,
            [deliverymanId]
        );
        if (!result.rowCount) {
            await client.query("ROLLBACK");
            return res.status(404).json({ message: "Deliveryman not found." });
        }

        await createDeliverymanNotification(client, deliverymanId, "Your deliveryman account has been reactivated. You are now available to take delivery orders.");

        await client.query("COMMIT");

        eventService.broadcast("deliveryman_updated", { deliverymanId, approval_status: "approved" });
        eventService.broadcast("notification_sent", { role: "deliveryman", recipientId: deliverymanId });
        eventService.broadcast("stats_updated");
        return res.json({ message: "Deliveryman reactivated successfully.", deliveryman: publicDeliveryman(result.rows[0]) });
    } catch (error) {
        try { await client.query("ROLLBACK"); } catch (_) {}
        console.error("Reactivate deliveryman error:", error);
        return res.status(500).json({ message: "Unable to reactivate deliveryman." });
    } finally {
        client.release();
    }
};

exports.deleteDeliverymanSafely = async (req, res) => {
    const { deliverymanId } = req.params;
    if (!validId(deliverymanId)) return res.status(400).json({ message: "deliverymanId must be a positive integer." });

    const client = await pool.connect();
    try {
        await client.query("BEGIN");
        const found = await client.query("SELECT deliveryman_id FROM deliverymen WHERE deliveryman_id = $1 FOR UPDATE", [deliverymanId]);
        if (!found.rowCount) {
            await client.query("ROLLBACK");
            return res.status(404).json({ message: "Deliveryman not found." });
        }

        const activeOrderCheck = await client.query(
            "SELECT COUNT(1)::int AS count FROM orders WHERE deliveryman_id = $1",
            [deliverymanId]
        );
        if (activeOrderCheck.rows[0].count > 0) {
            await client.query("ROLLBACK");
            return res.status(409).json({
                message: "Cannot permanently delete deliveryman because they have order delivery records. You can suspend the deliveryman instead."
            });
        }

        await client.query("DELETE FROM delivery_requests WHERE deliveryman_id = $1", [deliverymanId]);
        await client.query("DELETE FROM notifications WHERE deliveryman_id = $1", [deliverymanId]);
        await client.query("DELETE FROM deliverymen WHERE deliveryman_id = $1", [deliverymanId]);

        await client.query("COMMIT");
        eventService.broadcast("deliveryman_updated", { deliverymanId, deleted: true });
        eventService.broadcast("stats_updated");
        return res.json({ message: "Deliveryman deleted permanently.", deliverymanId });
    } catch (error) {
        try { await client.query("ROLLBACK"); } catch (_) {}
        console.error("Delete deliveryman error:", error);
        return res.status(500).json({ message: "Unable to delete deliveryman." });
    } finally {
        client.release();
    }
};
