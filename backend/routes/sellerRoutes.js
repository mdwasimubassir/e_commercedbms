const express = require("express");
const sellerController = require("../controllers/sellerController");
const authenticateToken = require("../middleware/authenticateToken");

const router = express.Router();

router.use(authenticateToken);
router.use(authenticateToken.requireApprovedSeller);
router.get("/products", sellerController.getSellerProducts);
router.post("/products", sellerController.createSellerProduct);
router.put("/products/:productId", sellerController.updateSellerProduct);
router.delete("/products/:productId", sellerController.deleteSellerProduct);
router.get("/orders", sellerController.getSellerOrders);
router.get("/revenue", sellerController.getSellerRevenue);
router.put("/orders/:orderId/status", sellerController.updateSellerOrderStatus);
router.get("/deliverymen/available", sellerController.getAvailableDeliverymen);
router.post("/orders/:orderId/delivery-requests", sellerController.sendDeliveryRequest);

module.exports = router;
