const express = require("express");
const notificationController = require("../controllers/notificationController");
const authenticateToken = require("../middleware/authenticateToken");

const router = express.Router();

router.use(authenticateToken);
router.get("/", notificationController.getNotifications);
router.put("/:notificationId/read", notificationController.markNotificationRead);
router.delete("/:notificationId", notificationController.deleteNotification);

module.exports = router;
