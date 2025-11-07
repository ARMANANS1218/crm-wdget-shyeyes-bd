import mongoose from "mongoose";

const friendshipSchema = new mongoose.Schema(
  {
    user1: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true }, // sender
    user2: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true }, // receiver
    status: {
      type: String,
     
      enum: ["Pending", "Accepted", "Rejected", "Blocked", "Cancelled", "Unblocked"],
      default: "Pending",
      index: true,
    },
    actionBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" }, // who sent or rejected
  },
  { timestamps: true }
);

// Prevent duplicates (one relationship per user pair)
friendshipSchema.index({ user1: 1, user2: 1 }, { unique: true });
friendshipSchema.index({ user1: 1, status: 1 });
friendshipSchema.index({ user2: 1, status: 1 });

export default mongoose.model("Friendship", friendshipSchema);
