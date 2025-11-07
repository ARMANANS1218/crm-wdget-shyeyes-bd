import User from "../models/User.js";

export const resetUsage = async (userId) => {
  await User.findByIdAndUpdate(userId, {
    $set: {
      "usage.requestsSent": 0,
      "usage.chatSecondsUsed": 0,
      "usage.audioCallsMade": 0,
      "usage.videoCallsMade": 0,
    }
  });
};
