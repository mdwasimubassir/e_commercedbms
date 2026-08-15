const express = require("express");
const pool = require("./db");

const app = express();

const PORT = 3000;

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

// Get all products
app.get("/api/products", async (req, res) => {
    try {
        const result = await pool.query("SELECT * FROM products");

        res.json(result.rows);
    } catch (error) {
        console.error("Error fetching products:", error);

        res.status(500).json({
            message: "Failed to fetch products"
        });
    }
});

// Start server
app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});