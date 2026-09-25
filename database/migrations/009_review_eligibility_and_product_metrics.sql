-- Migration 009: Review Uniqueness, Sold Quantity Function, and Optimized Indexes
-- 1. Enforces customer_id + product_id uniqueness on reviews table
-- 2. Creates get_product_sold_quantity function for consistent units sold calculation
-- 3. Adds supporting indexes for high-performance order item and review lookups

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'uq_reviews_customer_product'
    ) THEN
        ALTER TABLE reviews ADD CONSTRAINT uq_reviews_customer_product UNIQUE (customer_id, product_id);
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_order_items_product_id ON order_items(product_id);
CREATE INDEX IF NOT EXISTS idx_orders_customer_status ON orders(customer_id, status);
CREATE INDEX IF NOT EXISTS idx_reviews_customer_product ON reviews(customer_id, product_id);

CREATE OR REPLACE FUNCTION get_product_sold_quantity(p_product_id BIGINT)
RETURNS INTEGER AS $$
DECLARE
    v_sold INTEGER;
BEGIN
    SELECT COALESCE(SUM(oi.quantity), 0)::INTEGER
    INTO v_sold
    FROM order_items oi
    JOIN orders o ON o.order_id = oi.order_id
    WHERE oi.product_id = p_product_id
      AND (o.status = 'Delivered' OR o.delivery_status = 'delivered');

    RETURN v_sold;
END;
$$ LANGUAGE plpgsql STABLE;
