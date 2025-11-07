import User from "../models/User.js";
import Membership from "../models/Membership.js";
import { resetUsage } from "../utils/membershipUtils.js";

export const upgradeMembership = async (userId, planName) => {
  const plan = await Membership.findOne({ name: planName });
  if (!plan) throw new Error("Invalid membership plan");

  const user = await User.findById(userId);
  if (!user) throw new Error("User not found");

  user.membership = plan._id;
  user.membershipStart = new Date();
  user.membershipExpiry = new Date(Date.now() + plan.durationDays * 24 * 60 * 60 * 1000);

  // reset usage when upgrading
  await resetUsage(userId);

  await user.save();
  return user;
};
