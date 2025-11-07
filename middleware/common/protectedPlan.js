export const requireFeature = (feature) => async (req, res, next) => {
  const sub = await Subscription.findOne({ user: req.user._id }).populate("plan");
  if (!sub || !sub.active) return res.status(403).json({ message: "No active subscription" });
  if (!sub.plan.features[feature]) return res.status(403).json({ message: "Feature not allowed" });
 
  req.subscription = sub;
  next();
};