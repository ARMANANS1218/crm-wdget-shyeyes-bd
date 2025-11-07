import mongoose from "mongoose";

const planSchema = new mongoose.Schema(
  {
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "Role",},
    planType: {
      type: String,
      required: true,
      enum: ["free", "basic", "standard", "premium"],
      default: "free",
      index: true,
    },
    price: {
      type: Number,
      required: true,
      min: 0,
    },
    durationDays: {
      type: Number,
      required: true,
      min: 1,
    },
    limits: {
      // If not provided, default to 0 (no implicit unlimited)
      totalMessagesAllowed: { type: Number, default: 0, min: 0 },
      totalVideoTimeSeconds: { type: Number, default: 0, min: 0 },
      totalAudioTimeSeconds: { type: Number, default: 0, min: 0 },
      matchesAllowed: { type: Number, default: 0, min: 0 },
    },
    isActive: {
      type: Boolean,
      default: true,
      index: true,
    },
  },
  { timestamps: true }
);

planSchema.index({ planType: 1, isActive: 1 });

export default mongoose.model("Plan", planSchema);