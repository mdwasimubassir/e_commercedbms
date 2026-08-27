const express = require("express");
require("dotenv").config();
const pool = require("./db");
const productRoutes = require("./routes/productRoutes");
const authRoutes = require("./routes/authRoutes");
const cartRoutes = require("./routes/cartRoutes");
const orderRoutes = require("./routes/orderRoutes");
const sellerRoutes = require("./routes/sellerRoutes");
const reviewRoutes = require("./routes/reviewRoutes");
const productReviewRoutes = reviewRoutes.productReviewRoutes;
const notificationRoutes = require("./routes/notificationRoutes");

const app = express();

const PORT = 3000;

app.use(express.json());

// Test backend
app.get("/", (req, res) => {
    res.send("E-Commerce Backend is running!");
});

// Test PostgreSQL connection
app.get("/api/test-db", async (req, res) => {
    try {
        const result = await pool.query("SELECT NOW()");

        res.json({
            message: "PostgreSQL connection successful",
            database_time: result.rows[0].now
        });
    } catch (error) {
        console.error("Database connection error:", error);

        res.status(500).json({
            message: "Database connection failed"
        });
    }
});

app.use("/api/products", productRoutes);
app.use("/api/products", productReviewRoutes);
app.use("/api/auth", authRoutes);
app.use("/api/cart", cartRoutes);
app.use("/api/orders", orderRoutes);
app.use("/api/seller", sellerRoutes);
app.use("/api/reviews", reviewRoutes);
app.use("/api/notifications", notificationRoutes);

// Keep malformed JSON responses consistent with the API's JSON error format.
app.use((error, req, res, next) => {
    if (error instanceof SyntaxError && error.status === 400 && "body" in error) {
        return res.status(400).json({ message: "Request body must contain valid JSON." });
    }

    return next(error);
});

// Start server
app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});
