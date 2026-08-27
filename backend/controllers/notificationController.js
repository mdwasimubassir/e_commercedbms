const pool = require("../db");

function isValidId(value) {
    return typeof value === "string" && /^\d+$/.test(value) && BigInt(value) > 0n;
}

function recipientColumn(role) {
    if (role === "customer") return "customer_id";
    if (role === "seller") return "seller_id";
    return null;
}

function recipientError(req, res) {
    const column = recipientColumn(req.user.role);
    if (column) return column;
    res.status(403).json({ message: "This account type cannot access notifications." });
    return null;
}

function sendNotificationError(error, res) {
    console.error("Notification database error:", error);
    return res.status(500).json({ message: "Unable to process notification request." });
}

exports.getNotifications = async (req, res) => {
    const column = recipientError(req, res);
    if (!column) return;

    try {
        const result = await pool.query(
            `SELECT notification_id, message, notification_date, status
             FROM notifications
             WHERE ${column} = $1
             ORDER BY notification_id DESC`,
            [req.user.sub]
        );
        return res.status(200).json(result.rows);
    } catch (error) {
        return sendNotificationError(error, res);
    }
};

async function findOwnedNotification(notificationId, recipientId, column) {
    const result = await pool.query("SELECT notification_id FROM notifications WHERE notification_id = $1", [notificationId]);
    if (result.rowCount === 0) return { exists: false, owned: false };
    const ownership = await pool.query(`SELECT notification_id FROM notifications WHERE notification_id = $1 AND ${column} = $2`, [notificationId, recipientId]);
    return { exists: true, owned: ownership.rowCount > 0 };
}

exports.markNotificationRead = async (req, res) => {
    const column = recipientError(req, res);
    if (!column) return;
    const { notificationId } = req.params;
    if (!isValidId(notificationId)) return res.status(400).json({ message: "notificationId must be a positive integer." });

    try {
        const notification = await findOwnedNotification(notificationId, req.user.sub, column);
        if (!notification.exists) return res.status(404).json({ message: "Notification not found." });
        if (!notification.owned) return res.status(403).json({ message: "You are not authorized to modify this notification." });
        const result = await pool.query(
            `UPDATE notifications SET status = 'Read'
             WHERE notification_id = $1 AND ${column} = $2
             RETURNING notification_id, message, notification_date, status`,
            [notificationId, req.user.sub]
        );
        return res.status(200).json({ message: "Notification marked as read.", notification: result.rows[0] });
    } catch (error) {
        return sendNotificationError(error, res);
    }
};

exports.deleteNotification = async (req, res) => {
    const column = recipientError(req, res);
    if (!column) return;
    const { notificationId } = req.params;
    if (!isValidId(notificationId)) return res.status(400).json({ message: "notificationId must be a positive integer." });

    try {
        const notification = await findOwnedNotification(notificationId, req.user.sub, column);
        if (!notification.exists) return res.status(404).json({ message: "Notification not found." });
        if (!notification.owned) return res.status(403).json({ message: "You are not authorized to delete this notification." });
        const result = await pool.query(
            `DELETE FROM notifications WHERE notification_id = $1 AND ${column} = $2 RETURNING notification_id`,
            [notificationId, req.user.sub]
        );
        return res.status(200).json({ message: "Notification deleted successfully.", notification_id: result.rows[0].notification_id });
    } catch (error) {
        return sendNotificationError(error, res);
    }
};
