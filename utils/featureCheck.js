import User from "../models/User.js";

export const canUseFeature = async (userId, feature, amount = 1) => {
  const user = await User.findById(userId).populate("membership");
  if (!user || !user.membership) return { allowed: false, reason: "No membership" };

  const plan = user.membership;

  switch (feature) {
    case "sendRequest":
      if (plan.features.unlimitedAccess) return { allowed: true };
      if (user.usage.requestsSent + amount <= plan.features.sendRequests) {
        user.usage.requestsSent += amount;
        await user.save();
        return { allowed: true };
      }
      return { allowed: false, reason: "Request limit reached" };

    case "chat":
      if (plan.features.unlimitedAccess) return { allowed: true };
      if (user.usage.chatSecondsUsed + amount <= plan.features.chatDurationSeconds) {
        user.usage.chatSecondsUsed += amount;
        await user.save();
        return { allowed: true };
      }
      return { allowed: false, reason: "Chat time limit reached" };

    case "audioCall":
      if (plan.features.audioCall || plan.features.unlimitedAccess) {
        user.usage.audioCallsMade += amount;
        await user.save();
        return { allowed: true };
      }
      return { allowed: false, reason: "Upgrade to access audio calls" };

    case "videoCall":
      if (plan.features.videoCall || plan.features.unlimitedAccess) {
        user.usage.videoCallsMade += amount;
        await user.save();
        return { allowed: true };
      }
      return { allowed: false, reason: "Upgrade to access video calls" };

    default:
      return { allowed: false, reason: "Unknown feature" };
  }
};
