import Notification from "../models/Notification.js";

export default function (nsp) {
  nsp.on("connection", (socket) => {
    const userId = socket.handshake.query.userId;
    if (!userId) return socket.disconnect();
    
    socket.join(userId);
    console.log(`🔔 User ${userId} connected to notifications`);

    /**
     * Example usage: Send notification
     * call this function wherever you need (friend request, message, call, like, comment)
     */
    const sendNotification = async ({ type, fromUserId, referenceId, text }) => {
      try {
        const notification = await Notification.create({
          userId,
          type,
          fromUserId,
          referenceId,
          text
        });

        // Emit real-time to user
        nsp.to(userId).emit("notification:new", notification);
      } catch (err) {
        console.error("sendNotification error:", err);
      }
    };

    // Example: message received (can be called from controller)
    socket.on("message:received", async (data) => {
      await sendNotification({
        type: "message",
        fromUserId: data.senderId,
        referenceId: data.messageId,
        text: `New message from ${data.senderName}`
      });
    });

    // Example: friend request
    socket.on("friend:request", async (data) => {
      await sendNotification({
        type: "friend_request",
        fromUserId: data.senderId,
        text: `${data.senderName} sent you a friend request`
      });
    });

    // Mark notification read
    socket.on("notification:read", async ({ notificationId }) => {
      const notification = await Notification.findByIdAndUpdate(
        notificationId,
        { isRead: true },
        { new: true }
      );
      if (notification) {
        nsp.to(notification.userId.toString()).emit("notification:read", notification);
      }
    });

    socket.on("disconnect", () => {
      console.log(`❌ User ${userId} disconnected from notifications`);
    });
  });
}