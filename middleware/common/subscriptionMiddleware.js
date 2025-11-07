// middlewares/plan.middleware.js
import Subscription from "../models/Subscription.js";

export const checkPlanLimit = (featureType, secondsRequested = 60) => {
  return async (req, res, next) => {
    try {
      const userId = req.user._id;
      const subscription = await Subscription.findOne({ userId });

      if (!subscription) {
        return res.status(403).json({ message: "No active subscription" });
      }

      // Expiry check
      if (new Date() > subscription.endDate) {
        return res.status(403).json({ message: "Subscription expired" });
      }

      // Map featureType → field
      let remainingField;
      switch (featureType) {
        case "chat": remainingField = "chatTimeRemaining"; break;
        case "video": remainingField = "videoTimeRemaining"; break;
        case "audio": remainingField = "audioTimeRemaining"; break;
        case "matches": remainingField = "matchesAllowed"; break;
        default:
          return res.status(400).json({ message: "Invalid feature type" });
      }

      const remaining = subscription[remainingField];

      if (remaining !== null && remaining < secondsRequested) {
        return res.status(403).json({
          message: `Not enough ${featureType} time remaining`
        });
      }

      // ⚡ Update without triggering planId validation
      await Subscription.updateOne(
        { _id: subscription._id },
        { $inc: { [remainingField]: -secondsRequested } }
      );

      next();
    } catch (err) {
      console.error("❌ checkPlanLimit error:", err);
      res.status(500).json({ message: "Plan check failed" });
    }
  };
};