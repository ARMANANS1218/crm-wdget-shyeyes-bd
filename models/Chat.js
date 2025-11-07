import mongoose from "mongoose";
// ✅ Reply Schema
const replySchema = new mongoose.Schema({
 from: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true
    },
    to: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true
    },
  message: { type: String, required: true },
  createdAt: { type: Date, default: Date.now }
});

// ✅ Message Schema
const   messageSchema = new mongoose.Schema({
 from: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true
    },
    to: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true
    },
  message: { type: String, required: true },
  petitionId: { type: String, default: null },
  createdAt: { type: Date, default: Date.now },
  replies: [replySchema]
});

// ✅ Main Conversation Schema
const ChatSchema = new mongoose.Schema(
  {
    // ✅ One conversation belongs to one user
    from: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true
    },
    to: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true
    },
    isActive: { type: Boolean, default: true },
    status: {
      type: String,
      enum: ["send","read","unread","replied"],
      default: "send"
    },

    messages: [messageSchema],
    
    // ✅ Per-user clear history timestamps
    // Map of userId -> Date when that user cleared this conversation
    clearedAt: {
      type: Map,
      of: Date,
      default: {}
    }
  },
  { timestamps: true }
);

export default mongoose.model("Chat", ChatSchema);