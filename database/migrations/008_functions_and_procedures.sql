-- Migration 008: Stored Functions and Procedures for CSE216 Compliance
-- 1. Function: get_product_rating_stats(product_id)
-- 2. Function: get_seller_total_revenue(seller_id)
-- 3. Procedure: cancel_order_procedure(order_id, customer_id)
-- 4. Procedure: process_order_checkout(customer_id, payment_method, shipping_address, lat, lng, OUT order_id, OUT total_amount)

-- ============================================================================
-- FUNCTION 1: get_product_rating_stats
-- Computes and returns statistical review metrics for a product.
-- ============================================================================
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

-- ============================================================================
-- FUNCTION 2: get_seller_total_revenue
-- Computes statistical total revenue earned by a seller across all valid orders.
-- ============================================================================
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

-- ============================================================================
-- PROCEDURE 1: cancel_order_procedure
-- Multi-step atomic workflow modifying 4 tables:
-- 1. Validates order status is 'Pending'
-- 2. Restores inventory stock for all products in the order
-- 3. Cancels any pending delivery requests
-- 4. Updates order status to 'Cancelled'
-- 5. Generates cancellation notifications for customer and sellers
-- ============================================================================
CREATE OR REPLACE PROCEDURE cancel_order_procedure(
    IN p_order_id BIGINT,
    IN p_customer_id BIGINT
)
AS $$
DECLARE
    v_order_status VARCHAR(100);
    v_item RECORD;
BEGIN
    -- 1. Check order existence and ownership with row lock
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

    -- 2. Restore inventory for all items in the order
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

    -- 3. Cancel any pending delivery requests for this order
    UPDATE delivery_requests
    SET status = 'cancelled'
    WHERE order_id = p_order_id AND status = 'pending';

    -- 4. Mark the order as Cancelled
    UPDATE orders
    SET status = 'Cancelled'
    WHERE order_id = p_order_id;

    -- 5. Insert cancellation notification for the customer
    INSERT INTO notifications (message, notification_date, status, customer_id)
    VALUES ('Your order #' || p_order_id || ' has been successfully cancelled.', CURRENT_DATE, 'Unread', p_customer_id);

    -- 6. Insert cancellation notification for sellers
    INSERT INTO notifications (message, notification_date, status, seller_id)
    SELECT DISTINCT 'Order #' || p_order_id || ' containing your product has been cancelled.', CURRENT_DATE, 'Unread', p.seller_id
    FROM order_items oi
    JOIN products p ON p.product_id = oi.product_id
    WHERE oi.order_id = p_order_id;

END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- PROCEDURE 2: process_order_checkout
-- Multi-step atomic workflow modifying 4 tables:
-- 1. Validates cart exists and is not empty
-- 2. Validates and locks product stock
-- 3. Calculates total amount
-- 4. Inserts new order record
-- 5. Inserts order items and decrements product inventory
-- 6. Clears customer cart items
-- 7. Generates real-time notifications for sellers and admin
-- ============================================================================
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
    -- 1. Locate the customer's cart
    SELECT cart_id INTO v_cart_id
    FROM carts
    WHERE customer_id = p_customer_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Cart not found.' USING ERRCODE = 'P0002';
    END IF;

    -- 2. Verify cart is not empty
    IF NOT EXISTS (SELECT 1 FROM cart_items WHERE cart_id = v_cart_id) THEN
        RAISE EXCEPTION 'Cart is empty.' USING ERRCODE = 'P0003';
    END IF;

    -- 3. Verify stock availability for all items with row locks
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

    -- 4. Calculate total amount
    SELECT COALESCE(SUM(p.price * ci.quantity), 0.00)::NUMERIC(12, 2)
    INTO p_total_amount
    FROM cart_items ci
    JOIN products p ON p.product_id = ci.product_id
    WHERE ci.cart_id = v_cart_id;

    -- 5. Insert order
    INSERT INTO orders (
        order_date, total_amount, payment_method, shipping_address,
        delivery_latitude, delivery_longitude, status, customer_id
    )
    VALUES (
        CURRENT_DATE, p_total_amount, p_payment_method, p_shipping_address,
        p_delivery_latitude, p_delivery_longitude, 'Pending', p_customer_id
    )
    RETURNING order_id INTO p_order_id;

    -- 6. Insert order items & update product stock
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

    -- 7. Clear cart
    DELETE FROM cart_items WHERE cart_id = v_cart_id;

    -- 8. Create seller notifications
    FOR v_seller IN
        SELECT DISTINCT p.seller_id
        FROM order_items oi
        JOIN products p ON p.product_id = oi.product_id
        WHERE oi.order_id = p_order_id
    LOOP
        INSERT INTO notifications (message, notification_date, status, seller_id)
        VALUES ('New order received: Order #' || p_order_id, CURRENT_DATE, 'Unread', v_seller.seller_id);
    END LOOP;

    -- 9. Create admin notification
    INSERT INTO notifications (message, notification_date, status, admin_id)
    SELECT 'New order placed: Order #' || p_order_id || ' totaling $' || p_total_amount || '.', CURRENT_DATE, 'Unread', admin_id
    FROM admins
    LIMIT 1;

END;
$$ LANGUAGE plpgsql;
