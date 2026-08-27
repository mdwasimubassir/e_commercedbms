const express = require("express");
const orderController = require("../controllers/orderController");
const authenticateToken = require("../middleware/authenticateToken");

const router = express.Router();

router.use(authenticateToken);
router.post("/", orderController.createOrder);
router.get("/", orderController.getOrders);
router.get("/:orderId", orderController.getOrderById);
router.put("/:orderId/cancel", orderController.cancelOrder);

module.exports = router;
