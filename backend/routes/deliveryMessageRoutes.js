const router = require("express").Router();
const auth = require("../middleware/authenticateToken");
const controller = require("../controllers/deliveryMessageController");

router.use(auth);

router.get("/unread-count", controller.getUnreadCount);
router.get("/conversations", controller.getConversations);
router.get("/order-participants", controller.getOrderParticipants);
router.patch("/read", controller.markAsRead);
router.get("/", controller.getMessages);
router.post("/", controller.sendMessage);
router.delete("/conversations/:orderId", controller.deleteConversation);
router.delete("/:messageId", controller.deleteMessage);

module.exports = router;
