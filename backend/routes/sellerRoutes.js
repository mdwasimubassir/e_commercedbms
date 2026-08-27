const express = require("express");
const sellerController = require("../controllers/sellerController");
const authenticateToken = require("../middleware/authenticateToken");

const router = express.Router();

router.use(authenticateToken);
router.get("/products", sellerController.getSellerProducts);
router.post("/products", sellerController.createSellerProduct);
router.put("/products/:productId", sellerController.updateSellerProduct);
router.delete("/products/:productId", sellerController.deleteSellerProduct);
router.get("/orders", sellerController.getSellerOrders);
router.put("/orders/:orderId/status", sellerController.updateSellerOrderStatus);

module.exports = router;
