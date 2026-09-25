-- PostgreSQL schema for the E-Commerce DBMS ER diagram


-- =========================================================
-- 1. CUSTOMER
-- =========================================================

CREATE TABLE customers (
    customer_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    name VARCHAR(150) NOT NULL,
    email VARCHAR(254) NOT NULL UNIQUE,
    password TEXT NOT NULL,
    phone VARCHAR(30) NOT NULL
);


-- =========================================================
-- 2. SELLER
-- =========================================================

CREATE TABLE sellers (
    seller_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    name VARCHAR(150) NOT NULL,
    email VARCHAR(254) NOT NULL UNIQUE,
    phone VARCHAR(30) NOT NULL,
    password TEXT NOT NULL,
    approval_status VARCHAR(20) NOT NULL DEFAULT 'pending'
        CHECK (approval_status IN ('pending', 'approved', 'rejected', 'suspended')),
    suspended_until TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Central platform emails registry to guarantee cross-table email uniqueness
CREATE TABLE platform_user_emails (
    email VARCHAR(254) PRIMARY KEY,
    role VARCHAR(20) NOT NULL CHECK (role IN ('customer', 'seller', 'deliveryman', 'admin')),
    user_id BIGINT NOT NULL
);

-- Admin accounts are deliberately separate from public customer/seller accounts.
CREATE TABLE admins (
    admin_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    name VARCHAR(150) NOT NULL,
    email VARCHAR(254) NOT NULL UNIQUE,
    password TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE deliverymen (
    deliveryman_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    name VARCHAR(150) NOT NULL, email VARCHAR(254) NOT NULL UNIQUE, phone VARCHAR(30) NOT NULL, password TEXT NOT NULL,
    delivery_location TEXT, delivery_latitude NUMERIC(9, 6), delivery_longitude NUMERIC(9, 6),
    approval_status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (approval_status IN ('pending', 'approved', 'rejected', 'suspended')),
    suspended_until TIMESTAMPTZ,
    availability_status VARCHAR(20) NOT NULL DEFAULT 'offline' CHECK (availability_status IN ('available', 'busy', 'offline')),
    last_assigned_at TIMESTAMPTZ, created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);


-- =========================================================
-- 3. CATEGORY
-- =========================================================

CREATE TABLE categories (
    category_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    category_name VARCHAR(150) NOT NULL UNIQUE
);


-- =========================================================
-- 4. PRODUCT
-- Seller LISTS Product
-- Product belongs to Category
-- =========================================================

CREATE TABLE products (
    product_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    name VARCHAR(200) NOT NULL,
    description TEXT NOT NULL,
    price NUMERIC(12, 2) NOT NULL CHECK (price >= 0),
    stock INTEGER NOT NULL CHECK (stock >= 0),
    image TEXT NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'paused')),

    seller_id BIGINT NOT NULL,
    category_id BIGINT NOT NULL,

    CONSTRAINT fk_products_seller
        FOREIGN KEY (seller_id)
        REFERENCES sellers (seller_id),

    CONSTRAINT fk_products_category
        FOREIGN KEY (category_id)
        REFERENCES categories (category_id)
);


-- =========================================================
-- 5. CART
-- Customer OWNS Cart
-- One customer has one cart
-- =========================================================

CREATE TABLE carts (
    cart_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    created_date DATE NOT NULL,

    customer_id BIGINT NOT NULL UNIQUE,

    CONSTRAINT fk_carts_customer
        FOREIGN KEY (customer_id)
        REFERENCES customers (customer_id)
);


-- =========================================================
-- 6. ORDER
-- Customer PLACES Order
-- =========================================================

CREATE TABLE orders (
    order_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    order_date DATE NOT NULL,
    total_amount NUMERIC(12, 2) NOT NULL
        CHECK (total_amount >= 0),
    payment_method VARCHAR(100) NOT NULL,
    shipping_address TEXT NOT NULL,
    delivery_latitude NUMERIC(9, 6),
    delivery_longitude NUMERIC(9, 6),
    deliveryman_id BIGINT REFERENCES deliverymen(deliveryman_id),
    delivery_status VARCHAR(30) CHECK (delivery_status IS NULL OR delivery_status IN ('assigned', 'picked_up', 'out_for_delivery', 'delivered')),
    estimated_delivery_time TIMESTAMPTZ,
    status VARCHAR(100) NOT NULL,

    customer_id BIGINT NOT NULL,

    CONSTRAINT fk_orders_customer
        FOREIGN KEY (customer_id)
        REFERENCES customers (customer_id)
);


-- =========================================================
-- 7. ORDER_ITEM
-- Order HAS OrderItem
-- OrderItem REPRESENTS Product
-- =========================================================

CREATE TABLE order_items (
    order_item_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    quantity INTEGER NOT NULL CHECK (quantity > 0),
    price NUMERIC(12, 2) NOT NULL
        CHECK (price >= 0),

    order_id BIGINT NOT NULL,
    product_id BIGINT NOT NULL,

    CONSTRAINT fk_order_items_order
        FOREIGN KEY (order_id)
        REFERENCES orders (order_id),

    CONSTRAINT fk_order_items_product
        FOREIGN KEY (product_id)
        REFERENCES products (product_id)
);


-- =========================================================
-- 8. CART_ITEM
-- Cart HAS CartItem
-- CartItem IS IN Product
-- =========================================================

CREATE TABLE cart_items (
    cart_item_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    quantity INTEGER NOT NULL CHECK (quantity > 0),

    cart_id BIGINT NOT NULL,
    product_id BIGINT NOT NULL,

    CONSTRAINT fk_cart_items_cart
        FOREIGN KEY (cart_id)
        REFERENCES carts (cart_id),

    CONSTRAINT fk_cart_items_product
        FOREIGN KEY (product_id)
        REFERENCES products (product_id)
);


-- =========================================================
-- 9. REVIEW
-- Customer WRITES Review
-- Product has/reviews Review
-- =========================================================

CREATE TABLE reviews (
    review_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    rating INTEGER NOT NULL
        CHECK (rating BETWEEN 1 AND 5),
    comment TEXT NOT NULL,

    customer_id BIGINT NOT NULL,
    product_id BIGINT NOT NULL,

    CONSTRAINT fk_reviews_customer
        FOREIGN KEY (customer_id)
        REFERENCES customers (customer_id),

    CONSTRAINT fk_reviews_product
        FOREIGN KEY (product_id)
        REFERENCES products (product_id)
);


-- =========================================================
-- 10. NOTIFICATION
--
-- Customer RECEIVES Notification
-- Seller RECEIVES Notification
--
-- Each notification belongs to exactly ONE recipient:
-- either a customer OR a seller.
-- =========================================================

CREATE TABLE notifications (
    notification_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    message TEXT NOT NULL,
    notification_date DATE NOT NULL,
    status VARCHAR(100) NOT NULL,

    customer_id BIGINT,
    seller_id BIGINT,
    deliveryman_id BIGINT,
    admin_id BIGINT,

    CONSTRAINT fk_notifications_customer
        FOREIGN KEY (customer_id)
        REFERENCES customers (customer_id),

    CONSTRAINT fk_notifications_seller
        FOREIGN KEY (seller_id)
        REFERENCES sellers (seller_id),

    CONSTRAINT fk_notifications_deliveryman
        FOREIGN KEY (deliveryman_id)
        REFERENCES deliverymen (deliveryman_id),

    CONSTRAINT fk_notifications_admin
        FOREIGN KEY (admin_id)
        REFERENCES admins (admin_id),

    CONSTRAINT chk_notification_recipient
        CHECK (
            ((customer_id IS NOT NULL)::int + (seller_id IS NOT NULL)::int + (deliveryman_id IS NOT NULL)::int + (admin_id IS NOT NULL)::int) = 1
        )
);

CREATE TABLE delivery_messages (
    message_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    order_id BIGINT REFERENCES orders (order_id) ON DELETE CASCADE,
    sender_role VARCHAR(20) NOT NULL CHECK (sender_role IN ('customer', 'deliveryman', 'seller', 'admin')),
    sender_id BIGINT NOT NULL,
    recipient_role VARCHAR(20) CHECK (recipient_role IS NULL OR recipient_role IN ('customer', 'deliveryman', 'seller', 'admin')),
    recipient_id BIGINT,
    message TEXT NOT NULL CHECK (length(trim(message)) BETWEEN 1 AND 2000),
    is_read BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_delivery_messages_unread ON delivery_messages (recipient_role, recipient_id, is_read);

CREATE TABLE delivery_requests (
    delivery_request_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    order_id BIGINT NOT NULL REFERENCES orders(order_id) ON DELETE CASCADE,
    seller_id BIGINT NOT NULL REFERENCES sellers(seller_id),
    deliveryman_id BIGINT NOT NULL REFERENCES deliverymen(deliveryman_id),
    status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'rejected', 'cancelled')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    responded_at TIMESTAMPTZ
);
CREATE UNIQUE INDEX uq_delivery_requests_pending_order ON delivery_requests(order_id) WHERE status = 'pending';


-- =========================================================
-- STORED FUNCTIONS & STORED PROCEDURES (CSE216 Compliance)
-- =========================================================

-- FUNCTION 1: get_product_rating_stats
CREATE OR REPLACE FUNCTION get_product_rating_stats(p_product_id BIGINT)
RETURNS TABLE (
    review_count BIGINT,
    average_rating NUMERIC(4, 2),
    five_star_count BIGINT,
    four_star_count BIGINT,
    three_star_count BIGINT,
    two_star_count BIGINT,
    one_star_count BIGINT
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        COUNT(*)::BIGINT AS review_count,
        COALESCE(ROUND(AVG(rating)::numeric, 2), 0.00)::NUMERIC(4, 2) AS average_rating,
        COUNT(CASE WHEN rating = 5 THEN 1 END)::BIGINT AS five_star_count,
        COUNT(CASE WHEN rating = 4 THEN 1 END)::BIGINT AS four_star_count,
        COUNT(CASE WHEN rating = 3 THEN 1 END)::BIGINT AS three_star_count,
        COUNT(CASE WHEN rating = 2 THEN 1 END)::BIGINT AS two_star_count,
        COUNT(CASE WHEN rating = 1 THEN 1 END)::BIGINT AS one_star_count
    FROM reviews
    WHERE product_id = p_product_id;
END;
$$ LANGUAGE plpgsql STABLE;

-- FUNCTION 2: get_seller_total_revenue
CREATE OR REPLACE FUNCTION get_seller_total_revenue(p_seller_id BIGINT)
RETURNS NUMERIC(12, 2) AS $$
DECLARE
    v_total_revenue NUMERIC(12, 2);
BEGIN
    SELECT COALESCE(SUM(oi.price * oi.quantity), 0.00)::NUMERIC(12, 2)
    INTO v_total_revenue
    FROM order_items oi
    JOIN products p ON p.product_id = oi.product_id
    JOIN orders o ON o.order_id = oi.order_id
    WHERE p.seller_id = p_seller_id
      AND o.status != 'Cancelled';

    RETURN v_total_revenue;
END;
$$ LANGUAGE plpgsql STABLE;

-- PROCEDURE 1: cancel_order_procedure
CREATE OR REPLACE PROCEDURE cancel_order_procedure(
    IN p_order_id BIGINT,
    IN p_customer_id BIGINT
)
AS $$
DECLARE
    v_order_status VARCHAR(100);
    v_item RECORD;
BEGIN
    SELECT status INTO v_order_status
    FROM orders
    WHERE order_id = p_order_id AND customer_id = p_customer_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Order not found.' USING ERRCODE = 'P0002';
    END IF;

    IF v_order_status <> 'Pending' THEN
        RAISE EXCEPTION 'Only Pending orders can be cancelled.' USING ERRCODE = 'P0001';
    END IF;

    FOR v_item IN
        SELECT product_id, quantity
        FROM order_items
        WHERE order_id = p_order_id
        FOR UPDATE
    LOOP
        UPDATE products
        SET stock = stock + v_item.quantity
        WHERE product_id = v_item.product_id;
    END LOOP;

    UPDATE delivery_requests
    SET status = 'cancelled'
    WHERE order_id = p_order_id AND status = 'pending';

    UPDATE orders
    SET status = 'Cancelled'
    WHERE order_id = p_order_id;

    INSERT INTO notifications (message, notification_date, status, customer_id)
    VALUES ('Your order #' || p_order_id || ' has been successfully cancelled.', CURRENT_DATE, 'Unread', p_customer_id);

    INSERT INTO notifications (message, notification_date, status, seller_id)
    SELECT DISTINCT 'Order #' || p_order_id || ' containing your product has been cancelled.', CURRENT_DATE, 'Unread', p.seller_id
    FROM order_items oi
    JOIN products p ON p.product_id = oi.product_id
    WHERE oi.order_id = p_order_id;
END;
$$ LANGUAGE plpgsql;

-- PROCEDURE 2: process_order_checkout
CREATE OR REPLACE PROCEDURE process_order_checkout(
    IN p_customer_id BIGINT,
    IN p_payment_method VARCHAR(100),
    IN p_shipping_address TEXT,
    IN p_delivery_latitude NUMERIC(9, 6),
    IN p_delivery_longitude NUMERIC(9, 6),
    INOUT p_order_id BIGINT DEFAULT NULL,
    INOUT p_total_amount NUMERIC(12, 2) DEFAULT NULL
)
AS $$
DECLARE
    v_cart_id BIGINT;
    v_item RECORD;
    v_seller RECORD;
BEGIN
    SELECT cart_id INTO v_cart_id
    FROM carts
    WHERE customer_id = p_customer_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Cart not found.' USING ERRCODE = 'P0002';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM cart_items WHERE cart_id = v_cart_id) THEN
        RAISE EXCEPTION 'Cart is empty.' USING ERRCODE = 'P0003';
    END IF;

    FOR v_item IN
        SELECT ci.product_id, ci.quantity, p.stock, p.price, p.name, p.seller_id
        FROM cart_items ci
        JOIN products p ON p.product_id = ci.product_id
        WHERE ci.cart_id = v_cart_id
        FOR UPDATE OF p
    LOOP
        IF v_item.quantity <= 0 THEN
            RAISE EXCEPTION 'Cart contains an invalid item quantity.' USING ERRCODE = 'P0005';
        END IF;

        IF v_item.quantity > v_item.stock THEN
            RAISE EXCEPTION 'Insufficient stock for product %.', v_item.product_id USING ERRCODE = 'P0004';
        END IF;
    END LOOP;

    SELECT COALESCE(SUM(p.price * ci.quantity), 0.00)::NUMERIC(12, 2)
    INTO p_total_amount
    FROM cart_items ci
    JOIN products p ON p.product_id = ci.product_id
    WHERE ci.cart_id = v_cart_id;

    INSERT INTO orders (
        order_date, total_amount, payment_method, shipping_address,
        delivery_latitude, delivery_longitude, status, customer_id
    )
    VALUES (
        CURRENT_DATE, p_total_amount, p_payment_method, p_shipping_address,
        p_delivery_latitude, p_delivery_longitude, 'Pending', p_customer_id
    )
    RETURNING order_id INTO p_order_id;

    FOR v_item IN
        SELECT ci.product_id, ci.quantity, p.price
        FROM cart_items ci
        JOIN products p ON p.product_id = ci.product_id
        WHERE ci.cart_id = v_cart_id
    LOOP
        INSERT INTO order_items (quantity, price, order_id, product_id)
        VALUES (v_item.quantity, v_item.price, p_order_id, v_item.product_id);

        UPDATE products
        SET stock = stock - v_item.quantity
        WHERE product_id = v_item.product_id;
    END LOOP;

    DELETE FROM cart_items WHERE cart_id = v_cart_id;

    FOR v_seller IN
        SELECT DISTINCT p.seller_id
        FROM order_items oi
        JOIN products p ON p.product_id = oi.product_id
        WHERE oi.order_id = p_order_id
    LOOP
        INSERT INTO notifications (message, notification_date, status, seller_id)
        VALUES ('New order received: Order #' || p_order_id, CURRENT_DATE, 'Unread', v_seller.seller_id);
    END LOOP;

    INSERT INTO notifications (message, notification_date, status, admin_id)
    SELECT 'New order placed: Order #' || p_order_id || ' totaling $' || p_total_amount || '.', CURRENT_DATE, 'Unread', admin_id
    FROM admins
    LIMIT 1;
END;
$$ LANGUAGE plpgsql;
