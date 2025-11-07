import Subscription from "../models/Subscription.js";

// Helper: get active subscription for a user
async function getActiveSubscription(userId) {
  const now = new Date();
  console.log("🔍 Looking for active subscription:", { userId: userId.toString(), now });
  
  const subscription = await Subscription.findOne({ userId, endDate: { $gt: now } });
  
  if (subscription) {
    console.log("✅ Found active subscription:", {
      id: subscription._id.toString(),
      userId: subscription.userId.toString(),
      planType: subscription.planType,
      endDate: subscription.endDate
    });
  } else {
    console.log("❌ No active subscription found");
    
    // Let's also check all subscriptions for this user
    const allSubs = await Subscription.find({ userId });
    console.log("📋 All subscriptions for user:", allSubs.map(s => ({
      id: s._id.toString(),
      planType: s.planType,
      endDate: s.endDate,
      isExpired: s.endDate <= now
    })));
  }
  
  return subscription;
}

// Helper: ensure user has remaining seconds for call type
async function ensureCallQuota(userId, type) {
  console.log("🔍 Checking call quota for:", { userId: userId.toString(), type });
  
  const sub = await getActiveSubscription(userId);
  if (!sub) {
    console.log("❌ No subscription found");
    return { ok: false, code: "NO_SUBSCRIPTION" };
  }

  const allowed = type === "audio" ? (sub.audioTimeAllowed ?? 0) : (sub.videoTimeAllowed ?? 0);
  const used = type === "audio" ? (sub.audioTimeUsedTotal ?? 0) : (sub.videoTimeUsedTotal ?? 0);
  const remaining = Math.max(0, Number(allowed) - Number(used));
  
  console.log("📊 Quota calculation:", {
    type,
    allowed,
    used,
    remaining,
    hasQuota: remaining > 0
  });
  
  if (remaining <= 0) {
    const code = type === "audio" ? "AUDIO_LIMIT_REACHED" : "VIDEO_LIMIT_REACHED";
    console.log("❌ Quota limit reached:", code);
    return { ok: false, code };
  }
  
  console.log("✅ Quota available:", remaining);
  return { ok: true, remaining, sub };
}

// POST /api/usage/call/start { type: 'audio'|'video' }
export async function startCallUsage(req, res) {
  try {
    const userId = req.user._id || req.user.id;
    const { type } = req.body;
    
    console.log("🚀 startCallUsage called:", { 
      userId: userId.toString(), 
      userObject: req.user._id ? 'Has _id' : 'No _id',
      type 
    });
    
    if (!type || !["audio", "video"].includes(type)) {
      console.log("❌ Invalid call type:", type);
      return res.status(400).json({ success: false, message: "Invalid call type" });
    }
    
    const check = await ensureCallQuota(userId, type);
    console.log("🔍 Quota check result:", check);
    
    if (!check.ok) {
      console.log("❌ Quota check failed:", check.code);
      return res.status(403).json({ success: false, code: check.code, remainingSec: 0 });
    }
    
    console.log("✅ Call allowed, remaining seconds:", check.remaining);
    return res.json({ success: true, remainingSec: check.remaining });
  } catch (err) {
    console.error("❌ startCallUsage error:", err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
}

// POST /api/usage/call/stop { type: 'audio'|'video', elapsedSec }
export async function stopCallUsage(req, res) {
  try {
    const userId = req.user._id || req.user.id;
    const { type, elapsedSec } = req.body;
    
    console.log("🔄 stopCallUsage called:", { 
      userId: userId.toString(), 
      userObject: req.user._id ? 'Has _id' : 'No _id',
      type, 
      elapsedSec 
    });
    
    if (!type || !["audio", "video"].includes(type)) {
      console.log("❌ Invalid call type:", type);
      return res.status(400).json({ success: false, message: "Invalid call type" });
    }
    
    const secs = Math.max(0, Math.floor(Number(elapsedSec || 0)));
    console.log("⏱️ Processed elapsed seconds:", secs);
    
    if (secs > 0) {
      const incField = type === "audio" 
        ? { audioTimeUsedTotal: secs, totalAudioUsed: secs } 
        : { videoTimeUsedTotal: secs, totalVideoUsed: secs };
      
      console.log("📊 Update fields:", incField);
      console.log("🔍 Searching for userId:", userId.toString());
      
      const updateResult = await Subscription.findOneAndUpdate(
        { userId: userId },
        { $inc: incField },
        { new: true } // Return updated document
      );
      
      if (updateResult) {
        console.log("✅ Subscription updated successfully:", {
          userId: updateResult.userId.toString(),
          audioTimeUsedTotal: updateResult.audioTimeUsedTotal,
          videoTimeUsedTotal: updateResult.videoTimeUsedTotal,
          totalAudioUsed: updateResult.totalAudioUsed,
          totalVideoUsed: updateResult.totalVideoUsed
        });
      } else {
        console.log("❌ No subscription found for userId:", userId.toString());
        
        // Let's also check if there are any subscriptions for this user with different query
        const allUserSubs = await Subscription.find({ userId: userId });
        console.log("🔍 All subscriptions for user:", allUserSubs.length);
        if (allUserSubs.length > 0) {
          console.log("📋 Found subscriptions:", allUserSubs.map(s => ({ id: s._id.toString(), userId: s.userId.toString() })));
        }
      }
    } else {
      console.log("⚠️ No time to update (elapsedSec <= 0)");
    }
    
    return res.json({ success: true });
  } catch (err) {
    console.error("❌ stopCallUsage error:", err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
}

export default { startCallUsage, stopCallUsage };
