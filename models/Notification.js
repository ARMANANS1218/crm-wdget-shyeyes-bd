import mongoose from "mongoose";

const notificationSchema = new mongoose.Schema({
  userId: { // jisko notification milegi
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
  },
  type: { // type of notification
    type: String,
    enum: ["friend_request", "message", "call", "like", "comment", "system"],
    required: true,
  },
  fromUserId: { // jisse action hua (friend/message/call)
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
  },
  referenceId: { // optional reference e.g. messageId, callId, postId
    type: mongoose.Schema.Types.ObjectId,
  },
  text: String,  // description or message
  isRead: { type: Boolean, default: false },
  createdAt: { type: Date, default: Date.now },
});

export default mongoose.model("Notification", notificationSchema);