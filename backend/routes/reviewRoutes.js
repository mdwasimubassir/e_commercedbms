const express = require("express");
const reviewController = require("../controllers/reviewController");
const authenticateToken = require("../middleware/authenticateToken");

const reviewRoutes = express.Router();
const productReviewRoutes = express.Router();

reviewRoutes.post("/", authenticateToken, reviewController.createReview);
reviewRoutes.put("/:reviewId", authenticateToken, reviewController.updateReview);
reviewRoutes.delete("/:reviewId", authenticateToken, reviewController.deleteReview);

productReviewRoutes.get("/:productId/reviews", reviewController.getProductReviews);

module.exports = reviewRoutes;
module.exports.productReviewRoutes = productReviewRoutes;
