import Notification from "../models/Notification.js";

// ➕ Create Notification
export const createNotification = async (req, res) => {
  try {
    const { userId, type, title = "", text } = req.body;
    if (!userId || !type || !text) {
      return res.status(400).json({ success: false, message: "userId, type, and text are required" });
    }

    const notification = await Notification.create({ userId, type, title, text, isRead: false });
    return res.status(201).json({ success: true, notification });
  } catch (err) {
    console.error("createNotification error:", err);
    return res.status(500).json({ success: false, message: "Failed to create notification" });
  }
};

// 📥 Get User Notifications
export const getNotifications = async (req, res) => {
  try {
    const userId = req.user.id;
    const notifications = await Notification.find({ userId }).sort({ createdAt: -1 }).lean();
    return res.json({ success: true, notifications });
  } catch (err) {
    console.error("getNotifications error:", err);
    return res.status(500).json({ success: false, message: "Failed to fetch notifications" });
  }
};

// ✅ Mark as Read
export const markAsRead = async (req, res) => {
  try {
    const { id } = req.params;
    if (!id) return res.status(400).json({ success: false, message: "Notification ID is required" });

    const notification = await Notification.findByIdAndUpdate(id, { isRead: true }, { new: true });
    if (!notification) return res.status(404).json({ success: false, message: "Notification not found" });

    return res.json({ success: true, notification });
  } catch (err) {
    console.error("markAsRead error:", err);
    return res.status(500).json({ success: false, message: "Failed to mark notification as read" });
  }
};

// ❌ Delete Notification
export const deleteNotification = async (req, res) => {
  try {
    const { id } = req.params;
    if (!id) return res.status(400).json({ success: false, message: "Notification ID is required" });

    const deleted = await Notification.findByIdAndDelete(id);
    if (!deleted) return res.status(404).json({ success: false, message: "Notification not found" });

    return res.json({ success: true, message: "Notification deleted" });
  } catch (err) {
    console.error("deleteNotification error:", err);
    return res.status(500).json({ success: false, message: "Failed to delete notification" });
  }
};

// ❌ Clear All Notifications
export const clearNotifications = async (req, res) => {
  try {
    const userId = req.user.id;
    await Notification.deleteMany({ userId });
    return res.json({ success: true, message: "All notifications cleared" });
  } catch (err) {
    console.error("clearNotifications error:", err);
    return res.status(500).json({ success: false, message: "Failed to clear notifications" });
  }
};