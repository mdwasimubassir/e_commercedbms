const express = require("express");
const cartController = require("../controllers/cartController");
const authenticateToken = require("../middleware/authenticateToken");

const router = express.Router();

router.use(authenticateToken);
router.get("/", cartController.getCart);
router.post("/items", cartController.addCartItem);
router.put("/items/:productId", cartController.updateCartItem);
router.delete("/items/:productId", cartController.removeCartItem);
router.delete("/", cartController.clearCart);

module.exports = router;
