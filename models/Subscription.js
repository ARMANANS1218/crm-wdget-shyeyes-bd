import mongoose from "mongoose";

const subscriptionSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  planId: { type: mongoose.Schema.Types.ObjectId, ref: "Plan", required: true },

  planType: {
    type: String,
    required: true,
    enum: ["free", "basic", "standard", "premium"]
  },

  paidAmount: { type: Number, required: true }, // ✅ NEW FIELD

  startDate: { type: Date, required: true },
  endDate: { type: Date, required: true },
  purchasedAt: { type: Date, default: Date.now },


  // 📩 Messages tracking (Total for entire subscription period)
  messagesUsedTotal: { type: Number, default: 0 }, // Total messages used in this subscription
  messagesAllowed: { type: Number, default: null }, // Total messages allowed for this subscription (copied from plan)

  // 🎤 Audio & 🎥 Video tracking (Total for entire subscription period)
  audioTimeUsedTotal: { type: Number, default: 0 }, // Total audio time used in seconds
  videoTimeUsedTotal: { type: Number, default: 0 }, // Total video time used in seconds
  audioTimeAllowed: { type: Number, default: 0 }, // Total audio time allowed (copied from plan)
  videoTimeAllowed: { type: Number, default: 0 }, // Total video time allowed (copied from plan)

  // 🧾 Legacy fields (keeping for backward compatibility - but not used)
  totalMessagesUsed: { type: Number, default: 0 }, // Same as messagesUsedTotal
  totalAudioUsed: { type: Number, default: 0 }, // Same as audioTimeUsedTotal  
  totalVideoUsed: { type: Number, default: 0 }, // Same as videoTimeUsedTotal

 


  matchesAllowed: { type: Number, default: null }
}, { timestamps: true });

export default mongoose.model("Subscription", subscriptionSchema);