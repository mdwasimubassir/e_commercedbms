function validateRecipientId(value, recipientType) {
    if (!/^\d+$/.test(String(value)) || BigInt(String(value)) <= 0n) {
        throw new Error(`A valid ${recipientType} recipient id is required.`);
    }
}

async function createCustomerNotification(client, customerId, message) {
    validateRecipientId(customerId, "customer");
    if (typeof message !== "string" || message.trim() === "") throw new Error("Notification message is required.");

    const result = await client.query(
        `INSERT INTO notifications (message, notification_date, status, customer_id, seller_id)
         VALUES ($1, CURRENT_DATE, 'Unread', $2, NULL)
         RETURNING notification_id, message, notification_date, status, customer_id, seller_id`,
        [message.trim(), customerId]
    );
    return result.rows[0];
}

async function createSellerNotification(client, sellerId, message) {
    validateRecipientId(sellerId, "seller");
    if (typeof message !== "string" || message.trim() === "") throw new Error("Notification message is required.");

    const result = await client.query(
        `INSERT INTO notifications (message, notification_date, status, customer_id, seller_id)
         VALUES ($1, CURRENT_DATE, 'Unread', NULL, $2)
         RETURNING notification_id, message, notification_date, status, customer_id, seller_id`,
        [message.trim(), sellerId]
    );
    return result.rows[0];
}

module.exports = { createCustomerNotification, createSellerNotification };
