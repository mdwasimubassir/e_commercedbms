const jwt = require("jsonwebtoken");

function authenticateToken(req, res, next) {
    const authorization = req.headers.authorization;
    if (!authorization || !authorization.startsWith("Bearer ")) {
        return res.status(401).json({ message: "Authorization token is required." });
    }

    const token = authorization.slice(7);
    const secret = process.env.JWT_SECRET;
    if (!secret) return res.status(500).json({ message: "Authentication is not configured. Set JWT_SECRET in the environment." });

    try {
        req.user = jwt.verify(token, secret);
        return next();
    } catch (error) {
        return res.status(401).json({ message: "Invalid or expired authorization token." });
    }
}

module.exports = authenticateToken;
