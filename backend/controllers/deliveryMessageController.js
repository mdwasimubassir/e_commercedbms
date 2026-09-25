const pool = require("../db");
const {
  createCustomerNotification,
  createSellerNotification,
  createDeliverymanNotification,
  createAdminNotification
} = require("../services/notificationService");
const eventService = require("../services/eventService");

const validId = (value) => typeof value === "string" && /^\d+$/.test(value) && BigInt(value) > 0n;

async function checkOrderAccess(orderId, user) {
  if (user.role === "admin") {
    const res = await pool.query(
      `SELECT o.order_id, o.customer_id, o.deliveryman_id, o.status,
              c.name AS customer_name, c.email AS customer_email,
              d.name AS deliveryman_name, d.phone AS deliveryman_phone
       FROM orders o
       LEFT JOIN customers c ON c.customer_id = o.customer_id
       LEFT JOIN deliverymen d ON d.deliveryman_id = o.deliveryman_id
       WHERE o.order_id = $1`,
      [orderId]
    );
    return res.rows[0] || null;
  }

  if (user.role === "customer") {
    const res = await pool.query(
      `SELECT o.order_id, o.customer_id, o.deliveryman_id, o.status,
              c.name AS customer_name, c.email AS customer_email,
              d.name AS deliveryman_name, d.phone AS deliveryman_phone
       FROM orders o
       LEFT JOIN customers c ON c.customer_id = o.customer_id
       LEFT JOIN deliverymen d ON d.deliveryman_id = o.deliveryman_id
       WHERE o.order_id = $1 AND o.customer_id = $2`,
      [orderId, user.sub]
    );
    return res.rows[0] || null;
  }

  if (user.role === "deliveryman") {
    const res = await pool.query(
      `SELECT o.order_id, o.customer_id, o.deliveryman_id, o.status,
              c.name AS customer_name, c.email AS customer_email,
              d.name AS deliveryman_name, d.phone AS deliveryman_phone
       FROM orders o
       LEFT JOIN customers c ON c.customer_id = o.customer_id
       LEFT JOIN deliverymen d ON d.deliveryman_id = o.deliveryman_id
       WHERE o.order_id = $1 AND o.deliveryman_id = $2`,
      [orderId, user.sub]
    );
    return res.rows[0] || null;
  }

  if (user.role === "seller") {
    const res = await pool.query(
      `SELECT o.order_id, o.customer_id, o.deliveryman_id, o.status,
              c.name AS customer_name, c.email AS customer_email,
              d.name AS deliveryman_name, d.phone AS deliveryman_phone
       FROM orders o
       LEFT JOIN customers c ON c.customer_id = o.customer_id
       LEFT JOIN deliverymen d ON d.deliveryman_id = o.deliveryman_id
       WHERE o.order_id = $1
         AND EXISTS (
           SELECT 1 FROM order_items oi
           JOIN products p ON p.product_id = oi.product_id
           WHERE oi.order_id = o.order_id AND p.seller_id = $2
         )`,
      [orderId, user.sub]
    );
    return res.rows[0] || null;
  }

  return null;
}

// ==========================================
// 1. UNREAD COUNT
// ==========================================
exports.getUnreadCount = async (req, res) => {
  const { role, sub: userId } = req.user;
  try {
    let countQuery = "";
    let params = [];

    if (role === "admin") {
      countQuery = `
        SELECT COUNT(1)::int AS count
        FROM delivery_messages m
        WHERE m.is_read = FALSE
          AND (
            (m.recipient_role = 'admin')
            OR (m.recipient_role IS NULL AND m.sender_role != 'admin')
          )
          AND NOT EXISTS (
            SELECT 1 FROM message_deletions md
            WHERE md.message_id = m.message_id
              AND md.user_role = 'admin'
              AND md.user_id = $1
          )
      `;
      params = [userId];
    } else if (role === "customer") {
      countQuery = `
        SELECT COUNT(1)::int AS count
        FROM delivery_messages m
        WHERE m.is_read = FALSE
          AND (
            (m.recipient_role = 'customer' AND m.recipient_id = $1)
            OR (
              m.recipient_role IS NULL
              AND m.sender_role != 'customer'
              AND m.order_id IN (SELECT order_id FROM orders WHERE customer_id = $1)
            )
          )
          AND NOT EXISTS (
            SELECT 1 FROM message_deletions md
            WHERE md.message_id = m.message_id
              AND md.user_role = 'customer'
              AND md.user_id = $1
          )
      `;
      params = [userId];
    } else if (role === "deliveryman") {
      countQuery = `
        SELECT COUNT(1)::int AS count
        FROM delivery_messages m
        WHERE m.is_read = FALSE
          AND (
            (m.recipient_role = 'deliveryman' AND m.recipient_id = $1)
            OR (
              m.recipient_role IS NULL
              AND m.sender_role != 'deliveryman'
              AND m.order_id IN (SELECT order_id FROM orders WHERE deliveryman_id = $1)
            )
          )
          AND NOT EXISTS (
            SELECT 1 FROM message_deletions md
            WHERE md.message_id = m.message_id
              AND md.user_role = 'deliveryman'
              AND md.user_id = $1
          )
      `;
      params = [userId];
    } else if (role === "seller") {
      countQuery = `
        SELECT COUNT(1)::int AS count
        FROM delivery_messages m
        WHERE m.is_read = FALSE
          AND (
            (m.recipient_role = 'seller' AND m.recipient_id = $1)
            OR (
              m.recipient_role IS NULL
              AND m.sender_role != 'seller'
              AND m.order_id IN (
                SELECT DISTINCT oi.order_id
                FROM order_items oi
                JOIN products p ON p.product_id = oi.product_id
                WHERE p.seller_id = $1
              )
            )
          )
          AND NOT EXISTS (
            SELECT 1 FROM message_deletions md
            WHERE md.message_id = m.message_id
              AND md.user_role = 'seller'
              AND md.user_id = $1
          )
      `;
      params = [userId];
    }

    const result = await pool.query(countQuery, params);
    return res.json({ unreadCount: Number(result.rows[0]?.count || 0) });
  } catch (e) {
    console.error("Unread count error:", e);
    return res.status(500).json({ message: "Unable to retrieve unread message count." });
  }
};

// ==========================================
// 2. ORDER PARTICIPANTS
// ==========================================
exports.getOrderParticipants = async (req, res) => {
  const orderId = String(req.query.orderId || "");
  if (!validId(orderId)) {
    return res.status(400).json({ message: "orderId must be a positive integer." });
  }

  try {
    const order = await checkOrderAccess(orderId, req.user);
    if (!order) {
      return res.status(403).json({ message: "You are not authorized to view participants for this order." });
    }

    // Sellers with products in this order
    const sellerRes = await pool.query(
      `SELECT DISTINCT s.seller_id, s.name AS seller_name, s.email AS seller_email
       FROM order_items oi
       JOIN products p ON p.product_id = oi.product_id
       JOIN sellers s ON s.seller_id = p.seller_id
       WHERE oi.order_id = $1
       ORDER BY s.seller_id ASC`,
      [orderId]
    );

    return res.json({
      orderId: Number(order.order_id),
      orderStatus: order.status,
      customer: {
        id: Number(order.customer_id),
        name: order.customer_name || "Customer",
        email: order.customer_email || ""
      },
      deliveryman: order.deliveryman_id ? {
        id: Number(order.deliveryman_id),
        name: order.deliveryman_name || "Deliveryman",
        phone: order.deliveryman_phone || ""
      } : null,
      sellers: sellerRes.rows.map((s) => ({
        id: Number(s.seller_id),
        name: s.seller_name,
        email: s.seller_email
      })),
      admin: {
        role: "admin",
        name: "Support & Admin"
      }
    });
  } catch (e) {
    console.error("Get order participants error:", e);
    return res.status(500).json({ message: "Unable to retrieve order participants." });
  }
};

// ==========================================
// 3. CONVERSATIONS LIST
// ==========================================
exports.getConversations = async (req, res) => {
  const { role, sub: userId } = req.user;
  try {
    let orderFilter = "";
    let params = [];

    if (role === "customer") {
      orderFilter = "WHERE o.customer_id = $1";
      params = [userId];
    } else if (role === "deliveryman") {
      orderFilter = "WHERE o.deliveryman_id = $1";
      params = [userId];
    } else if (role === "seller") {
      orderFilter = `WHERE EXISTS (
        SELECT 1 FROM order_items oi
        JOIN products p ON p.product_id = oi.product_id
        WHERE oi.order_id = o.order_id AND p.seller_id = $1
      )`;
      params = [userId];
    } else if (role === "admin") {
      orderFilter = "";
      params = [];
    }

    const orderQuery = `
      SELECT
        o.order_id,
        o.status AS order_status,
        o.order_date,
        c.name AS customer_name,
        d.deliveryman_id,
        d.name AS deliveryman_name,
        latest.message AS last_message,
        latest.sender_role AS last_sender_role,
        latest.created_at AS last_message_time,
        COALESCE(unread.unread_count, 0)::int AS unread_count
      FROM orders o
      LEFT JOIN customers c ON c.customer_id = o.customer_id
      LEFT JOIN deliverymen d ON d.deliveryman_id = o.deliveryman_id
      LEFT JOIN LATERAL (
        SELECT m.message, m.sender_role, m.created_at
        FROM delivery_messages m
        WHERE m.order_id = o.order_id
          AND NOT EXISTS (
            SELECT 1 FROM message_deletions md
            WHERE md.message_id = m.message_id
              AND md.user_role = '${role}'
              AND md.user_id = ${userId || 'NULL'}
          )
        ORDER BY m.message_id DESC
        LIMIT 1
      ) latest ON true
      LEFT JOIN LATERAL (
        SELECT COUNT(1) AS unread_count
        FROM delivery_messages m
        WHERE m.order_id = o.order_id
          AND m.is_read = FALSE
          AND (
            (m.recipient_role = '${role}' AND m.recipient_id = ${userId || 'NULL'})
            OR (m.recipient_role IS NULL AND m.sender_role != '${role}')
            OR ('${role}' = 'admin' AND m.sender_role != 'admin')
          )
          AND NOT EXISTS (
            SELECT 1 FROM message_deletions md
            WHERE md.message_id = m.message_id
              AND md.user_role = '${role}'
              AND md.user_id = ${userId || 'NULL'}
          )
      ) unread ON true
      LEFT JOIN LATERAL (
        SELECT cd.deleted_at
        FROM conversation_deletions cd
        WHERE cd.order_id = o.order_id
          AND cd.user_role = '${role}'
          AND cd.user_id = ${userId || 'NULL'}
      ) conv_del ON true
      ${orderFilter ? orderFilter + " AND" : "WHERE"} (
        conv_del.deleted_at IS NULL
        OR (latest.created_at IS NOT NULL AND latest.created_at > conv_del.deleted_at)
      )
      ORDER BY COALESCE(latest.created_at, o.order_date::timestamptz) DESC
      LIMIT 50
    `;

    const orderRes = await pool.query(orderQuery, params);
    const conversations = orderRes.rows.map((row) => ({
      type: "order",
      order_id: row.order_id,
      order_status: row.order_status,
      order_date: row.order_date,
      customer_name: row.customer_name,
      deliveryman_id: row.deliveryman_id,
      deliveryman_name: row.deliveryman_name,
      last_message: row.last_message,
      last_sender_role: row.last_sender_role,
      last_message_time: row.last_message_time,
      unread_count: row.unread_count
    }));

    // For non-admin (seller, deliveryman, customer), include direct Admin Support conversation
    if (role !== "admin") {
      const supportRes = await pool.query(
        `SELECT
           latest.message AS last_message,
           latest.sender_role AS last_sender_role,
           latest.created_at AS last_message_time,
           COUNT(CASE WHEN m.is_read = FALSE AND m.recipient_role = $1 AND m.recipient_id = $2 THEN 1 END)::int AS unread_count
         FROM delivery_messages m
         LEFT JOIN LATERAL (
           SELECT dm_sub.message, dm_sub.sender_role, dm_sub.created_at
           FROM delivery_messages dm_sub
           WHERE dm_sub.order_id IS NULL
             AND (
               (dm_sub.sender_role = $1 AND dm_sub.sender_id = $2 AND dm_sub.recipient_role = 'admin')
               OR (dm_sub.sender_role = 'admin' AND dm_sub.recipient_role = $1 AND dm_sub.recipient_id = $2)
             )
             AND NOT EXISTS (
               SELECT 1 FROM message_deletions md
               WHERE md.message_id = dm_sub.message_id
                 AND md.user_role = $1
                 AND md.user_id = $2
             )
           ORDER BY dm_sub.message_id DESC
           LIMIT 1
         ) latest ON true
         WHERE m.order_id IS NULL
           AND (
             (m.sender_role = $1 AND m.sender_id = $2 AND m.recipient_role = 'admin')
             OR (m.sender_role = 'admin' AND m.recipient_role = $1 AND m.recipient_id = $2)
           )
           AND NOT EXISTS (
             SELECT 1 FROM message_deletions md
             WHERE md.message_id = m.message_id
               AND md.user_role = $1
               AND md.user_id = $2
           )
         GROUP BY latest.message, latest.sender_role, latest.created_at`,
        [role, userId]
      );

      const supportRow = supportRes.rows[0];
      conversations.unshift({
        type: "support",
        order_id: null,
        conversation_id: "support_admin",
        title: "Admin Support & Appeals",
        other_party: "Platform Admin",
        last_message: supportRow?.last_message || "Direct channel for appeals and support inquiry.",
        last_sender_role: supportRow?.last_sender_role || null,
        last_message_time: supportRow?.last_message_time || null,
        unread_count: supportRow ? Number(supportRow.unread_count || 0) : 0
      });
    } else {
      // For Admin, fetch all direct support/appeal threads grouped by user
      const adminSupportRes = await pool.query(
        `SELECT
           dm.other_role AS sender_role,
           dm.other_id AS sender_id,
           COALESCE(s.name, d.name, c.name, 'User #' || dm.other_id) AS sender_name,
           latest.message AS last_message,
           latest.sender_role AS last_sender_role,
           latest.created_at AS last_message_time,
           COALESCE(unread.unread_count, 0)::int AS unread_count
         FROM (
           SELECT DISTINCT
             CASE WHEN sender_role = 'admin' THEN recipient_role ELSE sender_role END AS other_role,
             CASE WHEN sender_role = 'admin' THEN recipient_id ELSE sender_id END AS other_id
           FROM delivery_messages
           WHERE order_id IS NULL
         ) dm
         LEFT JOIN sellers s ON s.seller_id = dm.other_id AND dm.other_role = 'seller'
         LEFT JOIN deliverymen d ON d.deliveryman_id = dm.other_id AND dm.other_role = 'deliveryman'
         LEFT JOIN customers c ON c.customer_id = dm.other_id AND dm.other_role = 'customer'
         LEFT JOIN LATERAL (
           SELECT dm_sub.message, dm_sub.sender_role, dm_sub.created_at
           FROM delivery_messages dm_sub
           WHERE dm_sub.order_id IS NULL
             AND (
               (dm_sub.sender_role = dm.other_role AND dm_sub.sender_id = dm.other_id AND dm_sub.recipient_role = 'admin')
               OR (dm_sub.sender_role = 'admin' AND dm_sub.recipient_role = dm.other_role AND dm_sub.recipient_id = dm.other_id)
             )
             AND NOT EXISTS (
               SELECT 1 FROM message_deletions md
               WHERE md.message_id = dm_sub.message_id
                 AND md.user_role = 'admin'
                 AND md.user_id = $1
             )
           ORDER BY dm_sub.message_id DESC
           LIMIT 1
         ) latest ON true
         LEFT JOIN LATERAL (
           SELECT COUNT(1) AS unread_count
           FROM delivery_messages m
           WHERE m.order_id IS NULL
             AND is_read = FALSE
             AND recipient_role = 'admin'
             AND sender_role = dm.other_role
             AND sender_id = dm.other_id
             AND NOT EXISTS (
               SELECT 1 FROM message_deletions md
               WHERE md.message_id = m.message_id
                 AND md.user_role = 'admin'
                 AND md.user_id = $1
             )
         ) unread ON true
         ORDER BY latest.created_at DESC`,
        [userId]
      );

      for (const row of adminSupportRes.rows) {
        conversations.unshift({
          type: "support",
          order_id: null,
          conversation_id: `support_${row.sender_role}_${row.sender_id}`,
          recipient_role: row.sender_role,
          recipient_id: row.sender_id,
          title: `Appeal / Support (${row.sender_role.toUpperCase()})`,
          other_party: `${row.sender_name} (${row.sender_role})`,
          last_message: row.last_message,
          last_sender_role: row.last_sender_role,
          last_message_time: row.last_message_time,
          unread_count: row.unread_count
        });
      }
    }

    return res.json(conversations);
  } catch (e) {
    console.error("Conversations list error:", e);
    return res.status(500).json({ message: "Unable to retrieve conversations." });
  }
};

// ==========================================
// 4. GET MESSAGES
// ==========================================
exports.getMessages = async (req, res) => {
  const { role, sub: userId } = req.user;
  const orderId = req.query.orderId ? String(req.query.orderId) : null;
  const recipientRole = req.query.recipientRole ? String(req.query.recipientRole) : null;
  const recipientId = req.query.recipientId ? String(req.query.recipientId) : null;
  const isSupport = req.query.support === "admin" || !orderId;

  try {
    // CASE A: Direct Support / Appeal Thread (order_id IS NULL)
    if (isSupport && !orderId) {
      let targetRole = recipientRole;
      let targetId = recipientId;

      if (role !== "admin") {
        // User querying their direct messages with admin
        const msgRes = await pool.query(
          `SELECT message_id, order_id, sender_role, sender_id, recipient_role, recipient_id, message, is_read, created_at
           FROM delivery_messages dm
           WHERE order_id IS NULL
             AND (
               (sender_role = $1 AND sender_id = $2 AND recipient_role = 'admin')
               OR (sender_role = 'admin' AND recipient_role = $1 AND recipient_id = $2)
             )
             AND NOT EXISTS (
               SELECT 1 FROM message_deletions md
               WHERE md.message_id = dm.message_id
                 AND md.user_role = $1
                 AND md.user_id = $2
             )
           ORDER BY message_id ASC`,
          [role, userId]
        );

        // Mark as read for current user
        const updateRes = await pool.query(
          `UPDATE delivery_messages
           SET is_read = TRUE
           WHERE order_id IS NULL
             AND is_read = FALSE
             AND recipient_role = $1
             AND recipient_id = $2`,
          [role, userId]
        );

        if (updateRes.rowCount > 0) {
          eventService.broadcast("message_read", { support: true, role, userId });
        }
        return res.json(msgRes.rows);
      } else {
        // Admin querying messages with a specific user
        if (!targetRole || !targetId) {
          return res.status(400).json({ message: "recipientRole and recipientId required for admin support messages." });
        }

        const msgRes = await pool.query(
          `SELECT message_id, order_id, sender_role, sender_id, recipient_role, recipient_id, message, is_read, created_at
           FROM delivery_messages dm
           WHERE order_id IS NULL
             AND (
               (sender_role = 'admin' AND recipient_role = $1 AND recipient_id = $2)
               OR (sender_role = $1 AND sender_id = $2 AND recipient_role = 'admin')
             )
             AND NOT EXISTS (
               SELECT 1 FROM message_deletions md
               WHERE md.message_id = dm.message_id
                 AND md.user_role = 'admin'
                 AND md.user_id = $3
             )
           ORDER BY message_id ASC`,
          [targetRole, targetId, userId]
        );

        // Mark as read for Admin
        const updateRes = await pool.query(
          `UPDATE delivery_messages
           SET is_read = TRUE
           WHERE order_id IS NULL
             AND is_read = FALSE
             AND recipient_role = 'admin'
             AND sender_role = $1
             AND sender_id = $2`,
          [targetRole, targetId]
        );

        if (updateRes.rowCount > 0) {
          eventService.broadcast("message_read", { support: true, role: "admin", targetRole, targetId });
        }
        return res.json(msgRes.rows);
      }
    }

    // CASE B: Order-based conversation
    if (!validId(orderId)) {
      return res.status(400).json({ message: "Valid orderId is required." });
    }

    const order = await checkOrderAccess(orderId, req.user);
    if (!order) {
      return res.status(403).json({ message: "You are not authorized to view messages for this order." });
    }

    let query = "";
    let params = [];

    if (recipientRole) {
      // Filter by the specific participant pair
      if (recipientRole === "admin") {
        if (role === "admin") {
          // Admin querying specific order participant
          query = `
            SELECT message_id, order_id, sender_role, sender_id, recipient_role, recipient_id, message, is_read, created_at
            FROM delivery_messages dm
            WHERE order_id = $1
              AND (
                (sender_role = 'admin' AND recipient_role = $2 AND recipient_id = $3)
                OR (sender_role = $2 AND sender_id = $3 AND recipient_role = 'admin')
              )
              AND NOT EXISTS (
                SELECT 1 FROM message_deletions md
                WHERE md.message_id = dm.message_id
                  AND md.user_role = $4
                  AND md.user_id = $5
              )
            ORDER BY message_id ASC
          `;
          params = [orderId, recipientRole, recipientId, role, userId];
        } else {
          // User querying messages with Admin for this order
          query = `
            SELECT message_id, order_id, sender_role, sender_id, recipient_role, recipient_id, message, is_read, created_at
            FROM delivery_messages dm
            WHERE order_id = $1
              AND (
                (sender_role = $2 AND sender_id = $3 AND recipient_role = 'admin')
                OR (sender_role = 'admin' AND recipient_role = $2 AND recipient_id = $3)
              )
              AND NOT EXISTS (
                SELECT 1 FROM message_deletions md
                WHERE md.message_id = dm.message_id
                  AND md.user_role = $2
                  AND md.user_id = $3
              )
            ORDER BY message_id ASC
          `;
          params = [orderId, role, userId];
        }
      } else {
        // Between two non-admin roles (e.g. customer <-> deliveryman, customer <-> seller, seller <-> deliveryman)
        // or Admin with a specific role
        query = `
          SELECT message_id, order_id, sender_role, sender_id, recipient_role, recipient_id, message, is_read, created_at
          FROM delivery_messages dm
          WHERE order_id = $1
            AND (
              (sender_role = $2 AND (recipient_role = $3 OR recipient_role IS NULL))
              OR (sender_role = $3 AND (recipient_role = $2 OR recipient_role IS NULL))
            )
            AND NOT EXISTS (
              SELECT 1 FROM message_deletions md
              WHERE md.message_id = dm.message_id
                AND md.user_role = $4
                AND md.user_id = $5
            )
          ORDER BY message_id ASC
        `;
        params = [orderId, role, recipientRole, role, userId];
      }
    } else {
      // Return all messages for this order visible to this user
      query = `
        SELECT message_id, order_id, sender_role, sender_id, recipient_role, recipient_id, message, is_read, created_at
        FROM delivery_messages dm
        WHERE order_id = $1
          AND NOT EXISTS (
            SELECT 1 FROM message_deletions md
            WHERE md.message_id = dm.message_id
              AND md.user_role = $2
              AND md.user_id = $3
          )
        ORDER BY message_id ASC
      `;
      params = [orderId, role, userId];
    }

    const result = await pool.query(query, params);

    // Mark as read for current user
    const updateRes = await pool.query(
      `UPDATE delivery_messages
       SET is_read = TRUE
       WHERE order_id = $1
         AND is_read = FALSE
         AND (
           (recipient_role = $2 AND (recipient_id = $3 OR recipient_id IS NULL))
           OR (recipient_role IS NULL AND sender_role != $2)
           OR ($2 = 'admin' AND sender_role != 'admin')
         )`,
      [orderId, role, userId]
    );

    if (updateRes.rowCount > 0) {
      eventService.broadcast("message_read", { orderId, role, userId });
    }
    return res.json(result.rows);
  } catch (e) {
    console.error("Message list error:", e);
    return res.status(500).json({ message: "Unable to retrieve messages." });
  }
};

// ==========================================
// 5. SEND MESSAGE
// ==========================================
exports.sendMessage = async (req, res) => {
  const body = req.body || {};
  const rawOrderId = body.order_id !== undefined ? body.order_id : body.orderId;
  const rawRecipientRole = body.recipient_role !== undefined ? body.recipient_role : body.recipientRole;
  const rawRecipientId = body.recipient_id !== undefined ? body.recipient_id : body.recipientId;
  const message = body.message;

  const cleanId = (val) => {
    if (val === undefined || val === null || val === "null" || val === "") return null;
    return String(val);
  };

  const orderId = cleanId(rawOrderId);
  const { role, sub: userId } = req.user;

  if (typeof message !== "string" || !message.trim() || message.trim().length > 2000) {
    return res.status(400).json({ message: "A message of between 1 and 2000 characters is required." });
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // CASE A: Direct Support / Appeal message (order_id is NULL)
    if (!orderId) {
      let targetRole = rawRecipientRole ? String(rawRecipientRole).toLowerCase() : "admin";
      let targetId = cleanId(rawRecipientId);

      if (role !== "admin") {
        // Non-admin can only message admin
        targetRole = "admin";
        targetId = null;
      } else {
        // Admin replying to user
        if (!targetRole || !targetId || !validId(targetId)) {
          await client.query("ROLLBACK");
          return res.status(400).json({ message: "recipient_role and recipient_id are required when Admin sends direct messages." });
        }
      }

      const insertRes = await client.query(
        `INSERT INTO delivery_messages (order_id, sender_role, sender_id, recipient_role, recipient_id, message, is_read)
         VALUES (NULL, $1, $2, $3, $4, $5, FALSE)
         RETURNING message_id, order_id, sender_role, sender_id, recipient_role, recipient_id, message, is_read, created_at`,
        [role, userId, targetRole, targetId, message.trim()]
      );

      const createdMsg = insertRes.rows[0];
      const snippet = message.trim().length > 60 ? `${message.trim().slice(0, 57)}…` : message.trim();

      if (targetRole === "admin") {
        // Notify admins
        await createAdminNotification(client, `New appeal/support message from ${role} (ID #${userId}): "${snippet}"`);
      } else if (targetRole === "seller") {
        await createSellerNotification(client, targetId, `New message from Admin: "${snippet}"`);
      } else if (targetRole === "deliveryman") {
        await createDeliverymanNotification(client, targetId, `New message from Admin: "${snippet}"`);
      } else if (targetRole === "customer") {
        await createCustomerNotification(client, targetId, `New message from Admin: "${snippet}"`);
      }

      await client.query("COMMIT");

      eventService.broadcast("message_sent", {
        orderId: null,
        messageId: createdMsg.message_id,
        senderRole: role,
        senderId: userId,
        recipientRole: targetRole,
        recipientId: targetId
      });
      eventService.broadcast("notification_sent", { role: targetRole, recipientId: targetId });

      return res.status(201).json(createdMsg);
    }

    // CASE B: Order-based message
    if (!validId(orderId)) {
      await client.query("ROLLBACK");
      return res.status(400).json({ message: "Valid order_id is required." });
    }

    const order = await checkOrderAccess(orderId, req.user);
    if (!order) {
      await client.query("ROLLBACK");
      return res.status(403).json({ message: "You are not authorized to send messages for this order." });
    }

    let targetRole = rawRecipientRole ? String(rawRecipientRole).toLowerCase() : null;
    let targetId = cleanId(rawRecipientId);

    // Validate authorized recipients for this order
    if (!targetRole) {
      // Fallback default participant
      if (role === "customer") {
        targetRole = order.deliveryman_id ? "deliveryman" : "admin";
        targetId = order.deliveryman_id ? String(order.deliveryman_id) : null;
      } else if (role === "deliveryman") {
        targetRole = "customer";
        targetId = String(order.customer_id);
      } else if (role === "seller") {
        targetRole = order.deliveryman_id ? "deliveryman" : "customer";
        targetId = order.deliveryman_id ? String(order.deliveryman_id) : String(order.customer_id);
      } else if (role === "admin") {
        targetRole = "customer";
        targetId = String(order.customer_id);
      }
    }

    if (targetRole === "deliveryman") {
      if (!order.deliveryman_id) {
        await client.query("ROLLBACK");
        return res.status(400).json({ message: "No deliveryman has been assigned to this order yet." });
      }
      targetId = String(order.deliveryman_id);
    } else if (targetRole === "customer") {
      if (role === "customer") {
        await client.query("ROLLBACK");
        return res.status(400).json({ message: "You cannot message yourself." });
      }
      targetId = String(order.customer_id);
    } else if (targetRole === "seller") {
      if (role === "seller" && targetId === String(userId)) {
        await client.query("ROLLBACK");
        return res.status(400).json({ message: "You cannot message yourself." });
      }
      // Check seller is legitimate for this order
      const sellerCheck = await client.query(
        `SELECT 1 FROM order_items oi
         JOIN products p ON p.product_id = oi.product_id
         WHERE oi.order_id = $1 ${targetId ? "AND p.seller_id = $2" : ""}`,
        targetId ? [orderId, targetId] : [orderId]
      );
      if (!sellerCheck.rowCount) {
        await client.query("ROLLBACK");
        return res.status(403).json({ message: "The selected seller is not associated with this order." });
      }
      if (!targetId) {
        // If not specified, select the first seller in the order
        const sRow = await client.query(
          `SELECT p.seller_id FROM order_items oi JOIN products p ON p.product_id = oi.product_id WHERE oi.order_id = $1 LIMIT 1`,
          [orderId]
        );
        targetId = String(sRow.rows[0].seller_id);
      }
    } else if (targetRole === "admin") {
      // Any order participant can message admin
      targetId = null;
    } else {
      await client.query("ROLLBACK");
      return res.status(400).json({ message: `Invalid recipient role: ${targetRole}` });
    }

    const insertRes = await client.query(
      `INSERT INTO delivery_messages (order_id, sender_role, sender_id, recipient_role, recipient_id, message, is_read)
       VALUES ($1, $2, $3, $4, $5, $6, FALSE)
       RETURNING message_id, order_id, sender_role, sender_id, recipient_role, recipient_id, message, is_read, created_at`,
      [orderId, role, userId, targetRole, targetId, message.trim()]
    );

    const createdMsg = insertRes.rows[0];
    const snippet = message.trim().length > 50 ? `${message.trim().slice(0, 47)}…` : message.trim();
    const notifText = `New message from ${role} on Order #${orderId}: "${snippet}"`;

    if (targetRole === "deliveryman" && targetId) {
      await createDeliverymanNotification(client, targetId, notifText);
    } else if (targetRole === "customer" && targetId) {
      await createCustomerNotification(client, targetId, notifText);
    } else if (targetRole === "seller" && targetId) {
      await createSellerNotification(client, targetId, notifText);
    } else if (targetRole === "admin") {
      await createAdminNotification(client, notifText);
    }

    await client.query("COMMIT");

    eventService.broadcast("message_sent", {
      orderId,
      messageId: createdMsg.message_id,
      senderRole: role,
      senderId: userId,
      recipientRole: targetRole,
      recipientId: targetId
    });
    eventService.broadcast("notification_sent", { role: targetRole, recipientId: targetId });

    return res.status(201).json(createdMsg);
  } catch (e) {
    try { await client.query("ROLLBACK"); } catch (_) {}
    console.error("Message send error:", e);
    return res.status(500).json({ message: "Unable to send message." });
  } finally {
    client.release();
  }
};

// ==========================================
// 6. MARK AS READ
// ==========================================
exports.markAsRead = async (req, res) => {
  const { orderId, recipientRole, recipientId } = req.body || {};
  const { role, sub: userId } = req.user;

  try {
    if (orderId && validId(String(orderId))) {
      await pool.query(
        `UPDATE delivery_messages
         SET is_read = TRUE
         WHERE order_id = $1
           AND is_read = FALSE
           AND (
             (recipient_role = $2 AND (recipient_id = $3 OR recipient_id IS NULL))
             OR (recipient_role IS NULL AND sender_role != $2)
             OR ($2 = 'admin' AND sender_role != 'admin')
           )`,
        [orderId, role, userId]
      );
      eventService.broadcast("message_read", { orderId, role, userId });
    } else {
      // Direct support read
      if (role === "admin") {
        await pool.query(
          `UPDATE delivery_messages
           SET is_read = TRUE
           WHERE order_id IS NULL
             AND is_read = FALSE
             AND recipient_role = 'admin'
             ${recipientRole ? "AND sender_role = $1" : ""}
             ${recipientId ? "AND sender_id = $2" : ""}`,
          recipientRole && recipientId ? [recipientRole, recipientId] : []
        );
      } else {
        await pool.query(
          `UPDATE delivery_messages
           SET is_read = TRUE
           WHERE order_id IS NULL
             AND is_read = FALSE
             AND recipient_role = $1
             AND recipient_id = $2`,
          [role, userId]
        );
      }
      eventService.broadcast("message_read", { support: true, role, userId });
    }

    return res.json({ message: "Messages marked as read." });
  } catch (e) {
    console.error("Mark read error:", e);
    return res.status(500).json({ message: "Unable to mark messages as read." });
  }
};

// ==========================================
// 7. DELETE MESSAGE
// ==========================================
exports.deleteMessage = async (req, res) => {
  const { messageId } = req.params;
  const { role, sub: userId } = req.user;

  if (!validId(messageId)) {
    return res.status(400).json({ message: "messageId must be a positive integer." });
  }

  try {
    const msgRes = await pool.query(
      `SELECT message_id, order_id, sender_role, sender_id, recipient_role, recipient_id, message, created_at
       FROM delivery_messages
       WHERE message_id = $1`,
      [messageId]
    );

    if (msgRes.rowCount === 0) {
      return res.status(404).json({ message: "Message not found." });
    }

    const msg = msgRes.rows[0];

    // Verify user is an authorized participant of this conversation
    if (role !== "admin") {
      if (msg.order_id) {
        const orderAccess = await checkOrderAccess(msg.order_id, req.user);
        if (!orderAccess) {
          return res.status(403).json({
            message: "You are not authorized to access messages for this order."
          });
        }
      } else {
        // Direct support channel: verify caller is participant
        const isParticipant =
          (msg.sender_role === role && String(msg.sender_id) === String(userId)) ||
          (msg.recipient_role === role && String(msg.recipient_id) === String(userId));
        if (!isParticipant) {
          return res.status(403).json({
            message: "You are not authorized to access this support message."
          });
        }
      }
    }

    // Per-user soft deletion (notification-style dismissal):
    // Deletes the message strictly from the calling user's account, leaving it intact for others on the other end.
    // If admin explicitly specifies ?hard=true, allow hard purge for moderation.
    if (role === "admin" && req.query.hard === "true") {
      await pool.query("DELETE FROM delivery_messages WHERE message_id = $1", [messageId]);
    } else {
      await pool.query(
        `INSERT INTO message_deletions (message_id, user_role, user_id)
         VALUES ($1, $2, $3)
         ON CONFLICT (message_id, user_role, user_id) DO NOTHING`,
        [messageId, role, userId]
      );
    }

    eventService.broadcast("message_deleted", {
      messageId: Number(messageId),
      orderId: msg.order_id,
      deletedByRole: role,
      deletedByUserId: userId
    });

    return res.status(200).json({
      message: "Message deleted from your account.",
      messageId: Number(messageId)
    });
  } catch (e) {
    console.error("Delete message error:", e);
    return res.status(500).json({ message: "Unable to delete message." });
  }
};

// ==========================================
// 8. DELETE CONVERSATION (ADMIN ANY CONVERSATION / USER OWN ACCOUNT)
// ==========================================
exports.deleteConversation = async (req, res) => {
  const target = req.params.orderId || req.params.target;
  const { role, sub: userId } = req.user;
  const targetRole = req.query.recipientRole || req.query.targetRole;
  const targetId = req.query.recipientId || req.query.targetId;

  try {
    const isSupportTarget =
      String(target).startsWith("support_") ||
      req.query.type === "support" ||
      target === "support" ||
      (!validId(String(target)) && (targetRole || String(target).includes("support")));

    if (isSupportTarget) {
      // ONLY Admin can delete the admin support conversation
      if (role !== "admin") {
        return res.status(403).json({
          message: "The Admin Support channel conversation on top cannot be deleted."
        });
      }

      let parsedRole = targetRole ? String(targetRole).toLowerCase() : null;
      let parsedId = targetId ? String(targetId) : null;

      if (!parsedRole || !parsedId) {
        const match = String(target).match(/^support_([a-zA-Z]+)_(\d+)$/);
        if (match) {
          parsedRole = match[1].toLowerCase();
          parsedId = match[2];
        }
      }

      if (!parsedRole || !parsedId) {
        return res.status(400).json({
          message: "Target user role and ID are required to delete a support conversation."
        });
      }

      const delRes = await pool.query(
        `DELETE FROM delivery_messages
         WHERE order_id IS NULL
           AND (
             (sender_role = $1 AND sender_id = $2 AND recipient_role = 'admin')
             OR (sender_role = 'admin' AND recipient_role = $1 AND recipient_id = $2)
           )`,
        [parsedRole, parsedId]
      );

      eventService.broadcast("conversation_cleared", {
        type: "support",
        targetRole: parsedRole,
        targetId: parsedId,
        clearedByRole: "admin",
        clearedByUserId: userId
      });

      return res.status(200).json({
        message: "Support conversation deleted successfully.",
        deletedCount: delRes.rowCount
      });
    }

    const orderId = String(target);
    if (!validId(orderId)) {
      return res.status(400).json({ message: "Valid orderId is required." });
    }

    if (role === "admin") {
      // Admin can delete ANY conversation he wants!
      const delRes = await pool.query(
        "DELETE FROM delivery_messages WHERE order_id = $1",
        [orderId]
      );
      await pool.query(
        `INSERT INTO conversation_deletions (order_id, user_role, user_id, deleted_at)
         VALUES ($1, $2, $3, CURRENT_TIMESTAMP)
         ON CONFLICT (order_id, user_role, user_id) DO UPDATE SET deleted_at = CURRENT_TIMESTAMP`,
        [orderId, role, userId]
      );

      eventService.broadcast("conversation_cleared", {
        orderId: Number(orderId),
        clearedByRole: "admin",
        clearedByUserId: userId
      });

      return res.status(200).json({
        message: "Order conversation deleted successfully.",
        orderId: Number(orderId),
        deletedCount: delRes.rowCount
      });
    }

    // For non-admin users: order access verification and per-user account soft deletion
    const orderAccess = await checkOrderAccess(orderId, req.user);
    if (!orderAccess) {
      return res.status(403).json({
        message: "You are not authorized to manage messages for this order."
      });
    }

    // 1. Mark all existing messages for this order as deleted for this user
    const insertRes = await pool.query(
      `INSERT INTO message_deletions (message_id, user_role, user_id)
       SELECT message_id, $1, $2
       FROM delivery_messages
       WHERE order_id = $3
       ON CONFLICT (message_id, user_role, user_id) DO NOTHING`,
      [role, userId, orderId]
    );

    // 2. Record conversation deletion so it is hidden from this user's conversation list
    await pool.query(
      `INSERT INTO conversation_deletions (order_id, user_role, user_id, deleted_at)
       VALUES ($1, $2, $3, CURRENT_TIMESTAMP)
       ON CONFLICT (order_id, user_role, user_id) DO UPDATE SET deleted_at = CURRENT_TIMESTAMP`,
      [orderId, role, userId]
    );

    eventService.broadcast("conversation_cleared", {
      orderId: Number(orderId),
      clearedByRole: role,
      clearedByUserId: userId
    });

    return res.status(200).json({
      message: "Conversation deleted from your account.",
      orderId: Number(orderId),
      deletedCount: insertRes.rowCount
    });
  } catch (e) {
    console.error("Delete conversation error:", e);
    return res.status(500).json({ message: "Unable to delete conversation." });
  }
};

