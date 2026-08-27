const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const pool = require("../db");

const BCRYPT_SALT_ROUNDS = 12;
const validRoles = ["customer", "seller"];

function validateRole(role) {
    return typeof role === "string" && validRoles.includes(role.toLowerCase());
}

function validateRegistration(body) {
    if (!body || typeof body !== "object" || Array.isArray(body)) return "Request body must be a JSON object.";

    const requiredFields = ["role", "name", "email", "phone", "password"];
    const missingFields = requiredFields.filter((field) => body[field] === undefined || body[field] === null || body[field] === "");
    if (missingFields.length > 0) return `Missing required fields: ${missingFields.join(", ")}.`;
    if (!validateRole(body.role)) return "role must be either customer or seller.";
    if (typeof body.name !== "string" || body.name.trim() === "" || body.name.trim().length > 150) return "name must be a non-empty string of at most 150 characters.";
    if (typeof body.email !== "string" || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(body.email.trim()) || body.email.trim().length > 254) return "email must be a valid email address.";
    if (typeof body.phone !== "string" || body.phone.trim() === "" || body.phone.trim().length > 30) return "phone must be a non-empty string of at most 30 characters.";
    if (typeof body.password !== "string" || Buffer.byteLength(body.password, "utf8") < 8 || Buffer.byteLength(body.password, "utf8") > 72) return "password must be between 8 and 72 bytes.";

    return null;
}

function createSafeUser(row, role) {
    return {
        id: row.id,
        role,
        name: row.name,
        email: row.email,
        phone: row.phone
    };
}

function signToken(user) {
    const secret = process.env.JWT_SECRET;
    if (!secret) throw new Error("JWT_SECRET is not configured.");

    return jwt.sign(
        { sub: String(user.id), role: user.role, email: user.email },
        secret,
        { expiresIn: process.env.JWT_EXPIRES_IN || "1d" }
    );
}

function ensureJwtIsConfigured(res) {
    if (process.env.JWT_SECRET) return true;
    res.status(500).json({ message: "Authentication is not configured. Set JWT_SECRET in the environment." });
    return false;
}

async function findAccountByEmail(email) {
    const result = await pool.query(
        `SELECT id, name, email, phone, password, role
         FROM (
             SELECT customer_id AS id, name, email, phone, password, 'customer' AS role FROM customers WHERE email = $1
             UNION ALL
             SELECT seller_id AS id, name, email, phone, password, 'seller' AS role FROM sellers WHERE email = $1
         ) AS accounts`,
        [email]
    );
    return result.rows;
}

exports.register = async (req, res) => {
    const validationError = validateRegistration(req.body);
    if (validationError) return res.status(400).json({ message: validationError });
    if (!ensureJwtIsConfigured(res)) return;

    const role = req.body.role.toLowerCase();
    const name = req.body.name.trim();
    const email = req.body.email.trim().toLowerCase();
    const phone = req.body.phone.trim();

    try {
        const existingAccounts = await findAccountByEmail(email);
        if (existingAccounts.length > 0) return res.status(409).json({ message: "An account with this email already exists." });

        const passwordHash = await bcrypt.hash(req.body.password, BCRYPT_SALT_ROUNDS);
        const query = role === "customer"
            ? `INSERT INTO customers (name, email, password, phone)
               VALUES ($1, $2, $3, $4)
               RETURNING customer_id AS id, name, email, phone`
            : `INSERT INTO sellers (name, email, phone, password)
               VALUES ($1, $2, $3, $4)
               RETURNING seller_id AS id, name, email, phone`;
        const values = role === "customer"
            ? [name, email, passwordHash, phone]
            : [name, email, phone, passwordHash];
        const result = await pool.query(query, values);
        const user = createSafeUser(result.rows[0], role);
        const token = signToken(user);

        return res.status(201).json({ message: "Registration successful.", token, user });
    } catch (error) {
        console.error("Registration error:", error);
        if (error.code === "23505") return res.status(409).json({ message: "An account with this email already exists." });
        if (error.message === "JWT_SECRET is not configured.") return res.status(500).json({ message: "Authentication is not configured. Set JWT_SECRET in the environment." });
        return res.status(500).json({ message: "Unable to register account." });
    }
};

exports.login = async (req, res) => {
    if (!req.body || typeof req.body !== "object" || Array.isArray(req.body)) return res.status(400).json({ message: "Request body must be a JSON object." });
    const { role, email, password } = req.body;
    if (!validateRole(role)) return res.status(400).json({ message: "role must be either customer or seller." });
    if (typeof email !== "string" || email.trim() === "" || typeof password !== "string" || password === "") {
        return res.status(400).json({ message: "email and password are required." });
    }
    if (!ensureJwtIsConfigured(res)) return;

    try {
        const roleName = role.toLowerCase();
        const accounts = await findAccountByEmail(email.trim().toLowerCase());
        const account = accounts.find((candidate) => candidate.role === roleName);
        if (!account || !(await bcrypt.compare(password, account.password))) {
            return res.status(401).json({ message: "Invalid email, password, or role." });
        }

        const user = createSafeUser(account, roleName);
        const token = signToken(user);
        return res.status(200).json({ message: "Login successful.", token, user });
    } catch (error) {
        console.error("Login error:", error);
        if (error.message === "JWT_SECRET is not configured.") return res.status(500).json({ message: "Authentication is not configured. Set JWT_SECRET in the environment." });
        return res.status(500).json({ message: "Unable to log in." });
    }
};
