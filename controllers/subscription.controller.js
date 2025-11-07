import Plan from '../models/Plan.js';
import Subscription from '../models/Subscription.js';
import User from '../models/User.js';
const seedPlans = async () => {
  const count = await Plan.countDocuments();
  if (count === 0) {
    await Plan.create([
      {
        planType: 'free',
        price: 0,
        durationDays: 15, // Free plan lasts 15 days
        limits: {
          totalMessagesAllowed: 50,        // Total messages for entire subscription period
          totalAudioTimeSeconds: 5 * 60,   // 5 min total
          totalVideoTimeSeconds: 2 * 60,   // 2 min total
          matchesAllowed: 5                // Limited matches
        }
      },
      {
        planType: 'basic',
        price: 299,
        durationDays: 28,
        limits: {
          totalMessagesAllowed: 200,       // Total messages for entire subscription period
          totalAudioTimeSeconds: 10 * 60,  // 10 min total
          totalVideoTimeSeconds: 5 * 60,   // 5 min total
          matchesAllowed: 10
        }
      },
      {
        planType: 'standard',
        price: 499,
        durationDays: 28,
        limits: {
          totalMessagesAllowed: 400,       // Total messages for entire subscription period
          totalAudioTimeSeconds: 20 * 60,  // 20 min total
          totalVideoTimeSeconds: 15 * 60,  // 15 min total
          matchesAllowed: 20             // unlimited
        }
      },
      {
        planType: 'premium',
        price: 799,
        durationDays: 28,
        limits: {
          totalMessagesAllowed: 1000,      // Total messages for entire subscription period
          totalAudioTimeSeconds: 60 * 60,  // 60 min total
          totalVideoTimeSeconds: 60 * 60,  // 60 min total
          matchesAllowed: null             // unlimited
        }
      }
    ]);
    console.log("Plans seeded with free, basic, standard, and premium");
  }
};

// Function to assign free subscriptions to users without subscriptions
const assignFreeSubscriptions = async () => {
  try {
    // Find free plan
    const freePlan = await Plan.findOne({ planType: 'free' });
    if (!freePlan) {
      console.log("Free plan not found, cannot assign free subscriptions");
      return;
    }

    // Find users without memberships/subscriptions
    const usersWithoutSubscriptions = await User.find({ 
      $or: [
        { membership: null },
        { membership: { $exists: false } }
      ]
    });

    for (const user of usersWithoutSubscriptions) {
      // Check if user already has an active subscription
      const existingSubscription = await Subscription.findOne({ 
        userId: user._id,
        endDate: { $gt: new Date() }
      });

      if (!existingSubscription) {
        // Create free subscription
        const startDate = new Date();
        const endDate = new Date();
        endDate.setDate(startDate.getDate() + freePlan.durationDays);

        const subscription = await Subscription.create({
          userId: user._id,
          planId: freePlan._id,
          planType: freePlan.planType,
          paidAmount: 0,
          startDate,
          endDate,
          purchasedAt: new Date(),
          messagesUsedToday: 0,
          lastMessageDate: null,
          audioTimeUsedToday: 0,
          videoTimeUsedToday: 0,
          lastCallDate: null,
          totalMessagesUsed: 0,
          totalAudioUsed: 0,
          totalVideoUsed: 0,
          matchesAllowed: freePlan.limits?.matchesAllowed ?? null,
          // Copy plan limits to subscription
          messagesAllowed: freePlan.limits?.totalMessagesAllowed ?? null,
          audioTimeAllowed: freePlan.limits?.totalAudioTimeSeconds ?? 0,
          videoTimeAllowed: freePlan.limits?.totalVideoTimeSeconds ?? 0,
        });

        // Update user with membership
        user.membership = subscription._id;
        user.membershipStart = startDate;
        user.membershipExpiry = endDate;
        await user.save();

        console.log(`Assigned free subscription to user: ${user.email || user._id}`);
      }
    }
  } catch (error) {
    console.error("Error assigning free subscriptions:", error);
  }
};

// Seed membership plans on startup (do not auto-assign free plans)
seedPlans().catch(console.error);

export const createPlan = async (req, res) => {
  try {
    const userId = req.user._id; // ✅ token se aayi hui id

    const { planType, price, durationDays, limits = {} } = req.body;

    // Normalize legacy/new limit payload keys -> schema keys, coerce empty to 0
    const toInt = (v) => {
      if (v === null || v === undefined || v === '') return 0;
      const n = Number(v);
      return Number.isFinite(n) && n >= 0 ? n : 0;
    };
    const normalizedLimits = {
      totalMessagesAllowed: toInt(limits.totalMessagesAllowed ?? limits.messagesPerDay),
      totalAudioTimeSeconds: toInt(limits.totalAudioTimeSeconds ?? limits.audioTimeSeconds ?? (limits.audioTimeMinutes ? Number(limits.audioTimeMinutes) * 60 : undefined)),
      totalVideoTimeSeconds: toInt(limits.totalVideoTimeSeconds ?? limits.videoTimeSeconds ?? (limits.videoTimeMinutes ? Number(limits.videoTimeMinutes) * 60 : undefined)),
      matchesAllowed: toInt(limits.matchesAllowed),
    };

    const plan = await Plan.create({
      createdBy: userId, // ✅ save token user
      planType,
      price,
      durationDays,
      limits: normalizedLimits
    });

    res.status(201).json({ success: true, data: plan });
  } catch (err) {
    console.error("createPlan error:", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
};
// GET /api/plans
export const getPlans = async (req, res) => {
  try {

    const plans = await Plan.find();
    res.json({ success: true, plans });
  } catch (err) {
    console.error("getPlans error:", err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

// export const checkRemainingPlan = async (req, res) => {
//   try {
//     const userId = req.user.id;

//     const subscription = await Subscription.findOne({ userId })
//       .populate("planId")
//       .populate("userId", "name email profilePic"); // populate user details

//     if (!subscription) {
//       return res.status(404).json({ success: false, message: "No active subscription" });
//     }

//     const today = new Date().toISOString().split("T")[0];
//     if (subscription.lastCallDate !== today) {
//       subscription.audioTimeUsedToday = 0;
//       subscription.videoTimeUsedToday = 0;
//       subscription.lastCallDate = today;
//       subscription.audioTimeRemaining = subscription.planId.limits.audioTimeSeconds;
//       subscription.videoTimeRemaining = subscription.planId.limits.videoTimeSeconds;
//       await subscription.save();
//     }

//     return res.json({
//       success: true,
//       message: "Remaining info fetched successfully",
//       plans: {
//         userId: subscription.userId,
//         subscriptionId: subscription._id,
//         planType: subscription.planType,
//         audioTimeUsedToday: subscription.audioTimeUsedToday,
//         audioTimeRemaining: subscription.audioTimeRemaining ?? (subscription.planId.limits.audioTimeSeconds - subscription.audioTimeUsedToday),
//         videoTimeUsedToday: subscription.videoTimeUsedToday,
//         videoTimeRemaining: subscription.videoTimeRemaining ?? (subscription.planId.limits.videoTimeSeconds - subscription.videoTimeUsedToday),
//         messagesUsedToday: subscription.messagesUsedToday,
//         messagesPerDay: subscription.planId.limits.messagesPerDay,
//         matchesAllowed: subscription.planId.limits.matchesAllowed,
//       }
//     });

//   } catch (err) {
//     console.error("❌ getRemainingPlan error:", err);
//     res.status(500).json({ success: false, message: "Failed to fetch subscription info" });
//   }
// };

// 📌 Check Remaining Usage API
export const checkRemainingPlan = async (req, res) => {
  try {
    const userId = req.user.id;

    const subscription = await Subscription.findOne({ userId })
      .populate("planId", "limits price durationDays")
      .populate("userId", "Name  firstName lastName email profilePic"); // populate user details

    if (!subscription) {
      return res.status(404).json({ success: false, message: "No active subscription" });
    }

    // reset daily if needed
    // const today = new Date().toISOString().split("T")[0];
    // if (subscription.lastCheckDate !== today) {
    //   subscription.audioTimeUsedToday = 0;
    //   subscription.videoTimeUsedToday = 0;
    //   subscription.messagesUsedToday = 0;
    //   subscription.lastCheckDate = today;
    //   await subscription.save();
    // }

    const planLimits = subscription.planId?.limits || {};
    const allowedMessages = (subscription.messagesAllowed ?? planLimits.totalMessagesAllowed ?? 0) | 0;
    const usedMessages = subscription.messagesUsedTotal || 0;
    const remainingMessages = Math.max(0, allowedMessages - usedMessages);

    const allowedAudio = (subscription.audioTimeAllowed ?? planLimits.totalAudioTimeSeconds ?? 0) | 0;
    const usedAudio = subscription.audioTimeUsedTotal || 0;
    const remainingAudio = Math.max(0, allowedAudio - usedAudio);

    const allowedVideo = (subscription.videoTimeAllowed ?? planLimits.totalVideoTimeSeconds ?? 0) | 0;
    const usedVideo = subscription.videoTimeUsedTotal || 0;
    const remainingVideo = Math.max(0, allowedVideo - usedVideo);

    const limits = {
      totalMessagesAllowed: allowedMessages,
      totalAudioTimeSeconds: allowedAudio,
      totalVideoTimeSeconds: allowedVideo,
      matchesAllowed: planLimits.matchesAllowed ?? 0,
    };

    const result = {
      messages: { used: usedMessages, remaining: remainingMessages },
      audio: { used: usedAudio, remaining: remainingAudio },
      video: { used: usedVideo, remaining: remainingVideo },
    };

    console.log(`📊 API Response for user ${userId}:`, {
      subscription: {
        messagesUsedTotal: subscription.messagesUsedTotal,
        totalMessagesUsed: subscription.totalMessagesUsed,
        messagesAllowed: subscription.messagesAllowed
      },
      calculated: {
        allowedMessages,
        usedMessages,
        remainingMessages
      },
      result
    });

    return res.json({
      success: true,
        message: "Remaining usage fetched successfully",
        plans: {
            userId: subscription.userId,
            subscriptionId: subscription._id,
            planType: subscription.planType,
            price: subscription.planId?.price || 0,
            durationDays: subscription.planId?.durationDays || 0,
            isActive: new Date() < subscription.endDate,
            startDate: subscription.startDate,
            endDate: subscription.endDate,
      limits,
      usage: result
        }
    });

  } catch (err) {
    console.error("checkRemaining error:", err);
    return res.status(500).json({ success: false, message: "Failed to check remaining" });
  }
};

// export const subscribePlan = async (req, res) => {
//   try {
//     const userId = req.user.id; // ✅ always store ID
//     const { planId } = req.params;

//     // 🔎 Fetch user and plan
//     const user = await User.findById(userId);
//     if (!user) {
//       return res.status(404).json({ success: false, message: "User not found" });
//     }

//     const plan = await Plan.findById(planId);
//     if (!plan) {
//       return res.status(404).json({ success: false, message: "Plan not found" });
//     }

//     // ❌ Remove existing subscription if any
//     if (user.membership) {
//       await Subscription.findByIdAndDelete(user.membership);
//     }

//     // 📅 Dates
//     const startDate = new Date();
//     const endDate = new Date();
//     endDate.setDate(startDate.getDate() + plan.durationDays);

//     // 🆕 Create subscription
//     const subscription = await Subscription.create({
//       userId,
//       planId,
//       planType: plan.planType,
//       startDate,
//       endDate,
//       purchasedAt: new Date(),
//       chatTimeRemaining: plan.limits?.chatTimeSeconds ?? 0,
//       videoTimeRemaining: plan.limits?.videoTimeSeconds ?? 0,
//       audioTimeRemaining: plan.limits?.audioTimeSeconds ?? 0,
//       matchesAllowed: plan.limits?.matchesAllowed ?? 0,
//       messagesUsedToday: 0,
//       lastMessageDate: null,
//     });

//     // 🔄 Update user with membership
//     user.membership = subscription._id;
//     user.membershipStart = startDate;
//     user.membershipExpiry = endDate;
//     await user.save();

//     return res.json({
//       success: true,
//       message: "Plan subscribed successfully",
//       subscription,
//     });
//   } catch (err) {
//     console.error("❌ subscribePlan error:", err);
//     res.status(500).json({ success: false, message: "Failed to subscribe to plan" });
//   }
// };


let dummyWalletBalance = 100000;

// Reusable helper to create/replace a subscription and update user
export const createOrReplaceSubscription = async (userId, plan, amount = 0) => {
  const user = await User.findById(userId);
  if (!user) throw new Error('User not found');

  // Remove old membership pointer and duplicate active subscriptions if any
  if (user.membership) {
    await Subscription.findByIdAndDelete(user.membership);
  }
  const existing = await Subscription.findOne({ userId, endDate: { $gt: new Date() } });
  if (existing) {
    await Subscription.findByIdAndDelete(existing._id);
  }

  const startDate = new Date();
  const endDate = new Date();
  endDate.setDate(startDate.getDate() + plan.durationDays);

  const subscription = await Subscription.create({
    userId,
    planId: plan._id,
    planType: plan.planType,
    paidAmount: Number(amount) || 0,
    startDate,
    endDate,
    purchasedAt: new Date(),
    messagesUsedToday: 0,
    lastMessageDate: null,
    audioTimeUsedToday: 0,
    videoTimeUsedToday: 0,
    lastCallDate: null,
    totalMessagesUsed: 0,
    totalAudioUsed: 0,
    totalVideoUsed: 0,
    matchesAllowed: plan.limits?.matchesAllowed ?? null,
    messagesAllowed: plan.limits?.totalMessagesAllowed ?? null,
    audioTimeAllowed: plan.limits?.totalAudioTimeSeconds ?? 0,
    videoTimeAllowed: plan.limits?.totalVideoTimeSeconds ?? 0,
  });

  user.membership = subscription._id;
  user.membershipStart = startDate;
  user.membershipExpiry = endDate;
  await user.save();

  return subscription;
};
 
export const subscribePlan = async (req, res) => {
  try {
    const userId = req.user.id;
    const { planId } = req.params;
    const { amount } = req.body;
 
    // 🔎 Fetch user
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ success: false, message: "User not found" });
    }
 
    // 🔎 Fetch plan
    const plan = await Plan.findById(planId);
    if (!plan) {
      return res.status(404).json({ success: false, message: "Plan not found" });
    }
 
    // 💵 Check amount
    if (Number(plan.price) !== Number(amount)) {
      return res.status(400).json({
        success: false,
        message: `Amount does not match the selected plan. Expected: ${plan.price}, Received: ${amount}`,
      });
    }
 
    // 🚨 Check wallet balance (skip for free plans)
    if (plan.price > 0 && dummyWalletBalance < amount) {
      return res.status(400).json({
        success: false,
        message: "Insufficient dummy wallet balance",
      });
    }
 
    // 💳 Deduct amount (only for paid plans)
    if (plan.price > 0) {
      dummyWalletBalance -= Number(amount);
    }
 
    const subscription = await createOrReplaceSubscription(userId, plan, amount);

    return res.json({
      success: true,
      message: "Plan subscribed successfully",
      subscription,
      walletBalance: dummyWalletBalance // ✅ return remaining balance
    });
  } catch (err) {
    console.error("❌ subscribePlan error:", err);
    res.status(500).json({ success: false, message: "Failed to subscribe to plan" });
  }
};


export const getMySubscription = async (req, res) => {
  try {
    // 🔑 Fetch user from DB
    const user = await User.findById(req.user.id);

    if (!user || !user.membership) {
      return res.json({ success: true, subscription: null });
    }

    // 🔎 Find subscription
    const sub = await Subscription.findById(user.membership).populate("planId");

    if (!sub || new Date() > sub.endDate) {
      // ❌ Expired → reset user membership
      user.membership = null;
      user.membershipStart = null;
      user.membershipExpiry = null;
      await user.save();

      return res.json({ success: true, subscription: null });
    }

    // ✅ Return active subscription
    return res.json({
      success: true,
      subscription: {
        _id: sub._id,
        planType: sub.planId?.planType,
        limits: sub.planId?.limits,
        startDate: sub.startDate,
        endDate: sub.endDate,
      },
    });
  } catch (err) {
    console.error("❌ getMySubscription error:", err.message);
    res.status(500).json({ success: false, message: "Server error" });
  }
};

// Debug endpoint to check database state
export const debugDatabaseState = async (req, res) => {
  try {
    const users = await User.find().select('email membership membershipStart membershipExpiry');
    const subscriptions = await Subscription.find().populate('planId');
    const plans = await Plan.find();

    res.json({
      success: true,
      data: {
        totalUsers: users.length,
        usersWithMembership: users.filter(u => u.membership).length,
        users: users.map(u => ({
          id: u._id,
          email: u.email,
          hasMembership: !!u.membership,
          membershipId: u.membership,
          membershipStart: u.membershipStart,
          membershipExpiry: u.membershipExpiry
        })),
        totalSubscriptions: subscriptions.length,
        subscriptions: subscriptions.map(s => ({
          id: s._id,
          userId: s.userId,
          planType: s.planType,
          planId: s.planId?._id,
          planName: s.planId?.planType,
          paidAmount: s.paidAmount,
          startDate: s.startDate,
          endDate: s.endDate,
          isActive: new Date() < s.endDate
        })),
        totalPlans: plans.length,
        plans: plans.map(p => ({
          id: p._id,
          planType: p.planType,
          price: p.price,
          durationDays: p.durationDays
        }))
      }
    });
  } catch (err) {
    console.error("❌ debugDatabaseState error:", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
};

// Migration function to fix existing subscriptions that don't have messagesAllowed populated
export const fixExistingSubscriptions = async (req, res) => {
  try {
    console.log("🔧 Starting migration to fix existing subscriptions...");
    
    // Find all subscriptions that don't have messagesAllowed set
    const subscriptionsToFix = await Subscription.find({ 
      $or: [
        { messagesAllowed: null },
        { messagesAllowed: { $exists: false } }
      ]
    }).populate('planId');

    console.log(`Found ${subscriptionsToFix.length} subscriptions to fix`);

    let fixedCount = 0;
    for (const subscription of subscriptionsToFix) {
      if (subscription.planId && subscription.planId.limits) {
        const plan = subscription.planId;
        
        // Update subscription with plan limits
        await Subscription.findByIdAndUpdate(subscription._id, {
          messagesAllowed: plan.limits.totalMessagesAllowed ?? null,
          audioTimeAllowed: plan.limits.totalAudioTimeSeconds ?? 0,
          videoTimeAllowed: plan.limits.totalVideoTimeSeconds ?? 0
        });
        
        fixedCount++;
        console.log(`✅ Fixed subscription ${subscription._id} (${plan.planType}) - messagesAllowed: ${plan.limits.totalMessagesAllowed}`);
      }
    }

    res.json({
      success: true,
      message: `Migration completed. Fixed ${fixedCount} subscriptions.`,
      fixedCount,
      totalFound: subscriptionsToFix.length
    });
  } catch (err) {
    console.error("❌ fixExistingSubscriptions error:", err);
    res.status(500).json({ success: false, message: "Migration failed" });
  }
};

// Self-service function for users to fix their own subscription
export const fixMySubscription = async (req, res) => {
  try {
    const userId = req.user.id;
    console.log(`🔧 Fixing subscription for user: ${userId}`);
    
    // Find user's active subscription
    const subscription = await Subscription.findOne({ 
      userId,
      endDate: { $gt: new Date() }
    }).populate('planId');

    if (!subscription) {
      return res.status(404).json({
        success: false,
        message: "No active subscription found"
      });
    }

    // Always show current status for debugging
    console.log(`Current subscription status:`, {
      id: subscription._id,
      planType: subscription.planType,
      messagesAllowed: subscription.messagesAllowed,
      messagesUsedTotal: subscription.messagesUsedTotal,
      planId: subscription.planId?._id,
      planLimits: subscription.planId?.limits
    });

    if (!subscription.planId || !subscription.planId.limits) {
      return res.status(500).json({
        success: false,
        message: "Plan data not found for subscription",
        debug: {
          hasplanId: !!subscription.planId,
          planId: subscription.planId?._id,
          planType: subscription.planId?.planType,
          hasLimits: !!subscription.planId?.limits,
          limits: subscription.planId?.limits
        }
      });
    }

    const plan = subscription.planId;
    
    // Handle both old and new field names for backward compatibility
    let messagesAllowed = plan.limits.totalMessagesAllowed ?? plan.limits.messagesPerDay ?? null;
    const audioTimeAllowed = plan.limits.totalAudioTimeSeconds ?? plan.limits.audioTimeSeconds ?? 0;
    const videoTimeAllowed = plan.limits.totalVideoTimeSeconds ?? plan.limits.videoTimeSeconds ?? 0;
    
    // SPECIAL FIX: If premium plan has unlimited (null) messages, set it to 1000
    if (plan.planType === 'premium' && messagesAllowed === null) {
      messagesAllowed = 1000;
      console.log(`🔧 FIXING: Premium plan had unlimited messages, setting to 1000`);
    }
    
    // Apply limits based on plan type if not found in plan
    if (messagesAllowed === null || messagesAllowed === undefined) {
      switch (plan.planType) {
        case 'free':
          messagesAllowed = 50;
          break;
        case 'basic':
          messagesAllowed = 200;
          break;
        case 'standard':
          messagesAllowed = 400;
          break;
        case 'premium':
          messagesAllowed = 1000;
          break;
        default:
          messagesAllowed = null;
      }
      console.log(`🔧 APPLIED DEFAULT: ${plan.planType} plan set to ${messagesAllowed} messages`);
    }
    
    console.log(`Plan limits found:`, {
      planType: plan.planType,
      totalMessagesAllowed: plan.limits.totalMessagesAllowed,
      messagesPerDay: plan.limits.messagesPerDay,
      finalMessagesAllowed: messagesAllowed
    });
    
    // Update subscription with plan limits
    const updatedSubscription = await Subscription.findByIdAndUpdate(
      subscription._id, 
      {
        messagesAllowed,
        audioTimeAllowed,
        videoTimeAllowed
      },
      { new: true }
    );
    
    console.log(`✅ Fixed subscription for user ${userId} (${plan.planType}) - messagesAllowed: ${plan.limits.totalMessagesAllowed}`);

    const remainingMessages = updatedSubscription.messagesAllowed 
      ? Math.max(0, updatedSubscription.messagesAllowed - (updatedSubscription.messagesUsedTotal || 0))
      : "Unlimited";

    res.json({
      success: true,
      message: "Subscription fixed successfully!",
      subscription: {
        planType: updatedSubscription.planType,
        messagesAllowed: updatedSubscription.messagesAllowed,
        messagesUsed: updatedSubscription.messagesUsedTotal || 0,
        remainingMessages: remainingMessages,
        endDate: updatedSubscription.endDate
      }
    });
  } catch (err) {
    console.error("❌ fixMySubscription error:", err);
    res.status(500).json({ success: false, message: "Failed to fix subscription" });
  }
};

// Function to update existing plans to new field structure
export const updateExistingPlans = async (req, res) => {
  try {
    console.log("🔧 Updating existing plans to new field structure...");
    
    const plans = await Plan.find({});
    
    let updatedCount = 0;
    for (const plan of plans) {
      let needsUpdate = false;
      const newLimits = { ...plan.limits };
      
      // Convert old field names to new ones and fix unlimited premium
      if (plan.limits.messagesPerDay !== undefined && plan.limits.totalMessagesAllowed === undefined) {
        // Set specific limits based on plan type instead of unlimited
        switch (plan.planType) {
          case 'free':
            newLimits.totalMessagesAllowed = 50;
            break;
          case 'basic':
            newLimits.totalMessagesAllowed = 200;
            break;
          case 'standard':
            newLimits.totalMessagesAllowed = 400;
            break;
          case 'premium':
            newLimits.totalMessagesAllowed = 1000; // Fix the unlimited premium
            break;
        }
        delete newLimits.messagesPerDay;
        needsUpdate = true;
      }
      
      if (plan.limits.audioTimeSeconds !== undefined && plan.limits.totalAudioTimeSeconds === undefined) {
        newLimits.totalAudioTimeSeconds = plan.limits.audioTimeSeconds;
        delete newLimits.audioTimeSeconds;
        needsUpdate = true;
      }
      
      if (plan.limits.videoTimeSeconds !== undefined && plan.limits.totalVideoTimeSeconds === undefined) {
        newLimits.totalVideoTimeSeconds = plan.limits.videoTimeSeconds;  
        delete newLimits.videoTimeSeconds;
        needsUpdate = true;
      }
      
      if (needsUpdate) {
        await Plan.findByIdAndUpdate(plan._id, { limits: newLimits });
        updatedCount++;
        console.log(`✅ Updated plan ${plan.planType} - totalMessagesAllowed: ${newLimits.totalMessagesAllowed}`);
      }
    }
    
    res.json({
      success: true,
      message: `Plans updated successfully. Updated ${updatedCount} plans.`,
      updatedCount
    });
  } catch (err) {
    console.error("❌ updateExistingPlans error:", err);
    res.status(500).json({ success: false, message: "Failed to update plans" });
  }
};

// Hard normalize: ensure no null/undefined values remain; set missing to 0
export const normalizePlanLimits = async (req, res) => {
  try {
    console.log('🔧 Normalizing plan limits to non-null numeric defaults (0)...');
    const plans = await Plan.find({});
    let updated = 0;
    for (const plan of plans) {
      const limits = plan.limits || {};
      const normalized = { ...limits };
      const fields = ['totalMessagesAllowed','totalVideoTimeSeconds','totalAudioTimeSeconds','matchesAllowed'];
      let changed = false;
      for (const f of fields) {
        if (normalized[f] === null || normalized[f] === undefined) {
          normalized[f] = 0;
          changed = true;
        }
        if (typeof normalized[f] !== 'number' || Number.isNaN(normalized[f])) {
          normalized[f] = 0;
          changed = true;
        }
        if (normalized[f] < 0) {
          normalized[f] = 0;
          changed = true;
        }
      }
      if (changed) {
        await Plan.findByIdAndUpdate(plan._id, { limits: normalized });
        updated++;
        console.log(`✅ Normalized plan ${plan.planType}`);
      }
    }
    return res.json({ success: true, updated });
  } catch (err) {
    console.error('❌ normalizePlanLimits error:', err);
    return res.status(500).json({ success: false, message: 'Normalization failed' });
  }
};