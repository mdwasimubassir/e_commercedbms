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
    password TEXT NOT NULL
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

    CONSTRAINT fk_notifications_customer
        FOREIGN KEY (customer_id)
        REFERENCES customers (customer_id),

    CONSTRAINT fk_notifications_seller
        FOREIGN KEY (seller_id)
        REFERENCES sellers (seller_id),

    CONSTRAINT chk_notification_recipient
        CHECK (
            (customer_id IS NOT NULL AND seller_id IS NULL)
            OR
            (customer_id IS NULL AND seller_id IS NOT NULL)
        )
);