import { v4 as uuidv4 } from "uuid";
import Chat from "../models/Chat.js";
import Subscription from "../models/Subscription.js";
import Plan from "../models/Plan.js";
import { onlineUsers, generateRoomId } from "../sockets/chat.namespace.js";

// Socket.IO instance will be set from server.js
let io;

// Function to set Socket.IO instance
export const setSocketIO = (socketInstance) => {
  io = socketInstance;
};

// Helper function to validate both users' subscriptions
// Supports bypass in development for faster local testing using env flag BYPASS_SUBSCRIPTION_CHECKS=true
const validateBothUsersSubscription = async (userId1, userId2) => {
  try {
    if (process.env.BYPASS_SUBSCRIPTION_CHECKS === 'true') {
      return { valid: true, message: 'Bypassed (dev mode)' };
    }
    const [user1Sub, user2Sub] = await Promise.all([
      Subscription.findOne({ userId: userId1 }).populate('planId'),
      Subscription.findOne({ userId: userId2 }).populate('planId')
    ]);

    if (!user1Sub || !user2Sub) {
      return {
        valid: false,
        message: 'Both users must have active subscriptions to chat'
      };
    }

    const now = new Date();
    if (now > user1Sub.endDate || now > user2Sub.endDate) {
      return {
        valid: false,
        message: 'One or both subscriptions have expired'
      };
    }

    return { valid: true };
  } catch (error) {
    return { valid: false, message: 'Failed to validate subscriptions' };
  }
};

// Send a message (Enhanced with Socket.IO integration)
export const sendMessage = async (req, res) => {
  try {
    const from = req.user.id;
    const { to, message } = req.body;

    // 🚫 Validate input
    if (!to) {
      return res.status(400).json({ success: false, message: "Recipient (to) is required" });
    }
    if (!message?.trim()) {
      return res.status(400).json({ success: false, message: "Message text is required" });
    }

    // ✅ Validate both users have active subscriptions (unless bypassed)
    const bothUsersValid = await validateBothUsersSubscription(from, to);
    if (!bothUsersValid.valid) {
      return res.status(403).json({ 
        success: false, 
        message: bothUsersValid.message,
        code: 'SUBSCRIPTION_REQUIRED'
      });
    }

    // 🔑 Generate petitionId
    const petitionId = "MSG" + uuidv4().slice(0, 5);

    // 1️⃣ Fetch sender's subscription
    let subscription = await Subscription.findOne({ userId: from }).populate("planId").exec();
    if (process.env.BYPASS_SUBSCRIPTION_CHECKS !== 'true') {
      if (!subscription) {
        return res.status(403).json({ success: false, message: "No active subscription" });
      }
      if (new Date() > subscription.endDate) {
        return res.status(403).json({ success: false, message: "Subscription expired" });
      }
    }

    // 2️⃣ Check total subscription message limits (not daily)
    const messagesAllowed = subscription.messagesAllowed; // Total messages for entire subscription
    const messagesUsed = Number(subscription.messagesUsedTotal || 0);
    const remainingMessages = messagesAllowed != null ? Math.max(0, messagesAllowed - messagesUsed) : null;

    // 3️⃣ Check if user has exceeded total message limit
    if (process.env.BYPASS_SUBSCRIPTION_CHECKS !== 'true') {
      if (remainingMessages !== null && remainingMessages <= 0) {
        return res.status(403).json({
          success: false,
          message: "Message limit exceeded for this subscription period",
          debug: { 
            messagesAllowed, 
            messagesUsed, 
            remainingMessages,
            subscriptionEndDate: subscription.endDate 
          },
          code: 'MESSAGE_LIMIT_EXCEEDED'
        });
      }
    }

    // 5️⃣ Save message to database
    let chat = await Chat.findOne({
      $or: [
        { from, to },
        { from: to, to: from }
      ]
    });
    
    if (!chat) {
      chat = await Chat.create({ from, to, messages: [] });
    }

    const newMessage = {
      from,
      to,
      message: message.trim(),
      petitionId,
      createdAt: new Date(),
      status: 'sent'
    };

    chat.messages.push(newMessage);
    await chat.save();

    // 6️⃣ Update subscription usage (total for entire subscription period)
    if (process.env.BYPASS_SUBSCRIPTION_CHECKS !== 'true') {
      subscription.messagesUsedTotal = (subscription.messagesUsedTotal || 0) + 1;
      subscription.totalMessagesUsed = subscription.messagesUsedTotal; // Keep legacy field in sync
      
      console.log(`📊 Updated subscription usage for user ${subscription.userId}:`, {
        messagesUsedTotal: subscription.messagesUsedTotal,
        totalMessagesUsed: subscription.totalMessagesUsed,
        messagesAllowed: subscription.messagesAllowed
      });
      
      await subscription.save();
    } else {
      console.log('🚧 Subscription usage update skipped (bypass enabled)');
    }

    // 7️⃣ Real-time Socket.IO integration
    if (io) {
      const chatNsp = io.of('/chat');
      const messageObj = {
        id: petitionId,
        from,
        to,
        message: message.trim(),
        timestamp: new Date(),
        status: 'sent',
        senderName: `${req.user.Name?.firstName || 'User'} ${req.user.Name?.lastName || ''}`.trim(),
        senderProfilePic: req.user.profilePic
      };

      // Send to receiver if online
      const receiverOnline = onlineUsers.get(to);
      if (receiverOnline) {
        chatNsp.to(`user_${to}`).emit('new_message', messageObj);
        
        // Mark as delivered after a short delay
        setTimeout(() => {
          chatNsp.to(`user_${from}`).emit('message_delivered', { messageId: petitionId });
        }, 100);
      }

      // Generate room ID for potential room-based messaging
      const roomId = generateRoomId(from, to);
      chatNsp.to(roomId).emit('new_message', messageObj);
    }

  const finalRemainingMessages = remainingMessages === null ? "Unlimited" : Math.max(0, remainingMessages - 1);

    return res.json({
      success: true,
      message: "Message sent successfully",
      petitionId,
      sentMessage: message.trim(),
      messagesUsedTotal: subscription.messagesUsedTotal,
      remainingMessages: finalRemainingMessages,
      subscriptionEndDate: subscription.endDate,
      deliveryStatus: onlineUsers.has(to) ? 'delivered' : 'pending'
    });

  } catch (err) {
    console.error("❌ sendMessage error:", err);
    res.status(500).json({ success: false, message: "Failed to send message" });
  }
};

export const getConversations = async (req, res) => {
  try {
    const senderId = req.user.id;  // logged in user
    const { id: receiverId } = req.params; // other user id

    if (!receiverId) {
      return res.status(400).json({ success: false, message: "Receiver ID is required" });
    }

    // ✅ Find chat between sender & receiver only
    const chat = await Chat.findOne({
      $or: [
        { from: senderId, to: receiverId },
        { from: receiverId, to: senderId }
      ]
    })
      .populate("messages.from", "name email profilePic")
      .populate("messages.to", "name email profilePic");

    if (!chat) {
      return res.status(404).json({ success: false, message: "No chat found between these users" });
    }

    // Apply per-user clear filter
    const clearedAt = chat.clearedAt?.get?.(senderId) || null;
    const filtered = clearedAt
      ? chat.messages.filter(m => new Date(m.createdAt) > new Date(clearedAt))
      : chat.messages;

    res.json({
      success: true,
      messages: filtered,
    });
  } catch (err) {
    console.error("❌ getMessages error:", err);
    res.status(500).json({ success: false, message: "Failed to fetch messages" });
  }
};

// Get chat messages between logged-in user and another user
export const getMessages = async (req, res) => {
  try {
    const senderId = req.user.id;  // logged in user
    const { id: receiverId } = req.params; // other user id

    if (!receiverId) {
      return res.status(400).json({ success: false, message: "Receiver ID is required" });
    }

    // ✅ Find chat between sender & receiver only
    const chat = await Chat.findOne({
      $or: [
        { from: senderId, to: receiverId },
        { from: receiverId, to: senderId }
      ]
    })
      .populate("messages.from", "name email profilePic")
      .populate("messages.to", "name email profilePic");

    if (!chat) {
      return res.status(404).json({ success: false, message: "No chat found between these users" });
    }

    // Apply per-user clear filter
    const clearedAt = chat.clearedAt?.get?.(senderId) || null;
    const filtered = clearedAt
      ? chat.messages.filter(m => new Date(m.createdAt) > new Date(clearedAt))
      : chat.messages;

    res.json({
      success: true,
      messages: filtered,
    });
  } catch (err) {
    console.error("❌ getMessages error:", err);
    res.status(500).json({ success: false, message: "Failed to fetch messages" });
  }
};

// ✅ Clear chat history for current user only (per-user view)
export const clearChatHistory = async (req, res) => {
  try {
    const userId = req.user.id;
    const { id: otherUserId } = req.params;

    if (!otherUserId) {
      return res.status(400).json({ success: false, message: 'Other user ID is required' });
    }

    const chat = await Chat.findOne({
      $or: [
        { from: userId, to: otherUserId },
        { from: otherUserId, to: userId }
      ]
    });

    if (!chat) {
      return res.status(404).json({ success: false, message: 'No chat found between these users' });
    }

    if (!chat.clearedAt) chat.clearedAt = new Map();
    chat.clearedAt.set(userId.toString(), new Date());
    await chat.save();

    return res.json({ success: true, message: 'Chat history cleared for current user' });
  } catch (err) {
    console.error('clearChatHistory error:', err);
    return res.status(500).json({ success: false, message: 'Failed to clear chat history' });
  }
};

// Get list of online users
export const getOnlineUsers = async (req, res) => {
  try {
    // Convert the Map to an array of user IDs with their status
    const onlineUsersList = Array.from(onlineUsers.entries()).map(([userId, userData]) => ({
      userId,
      socketId: userData.socketId,
      lastSeen: userData.lastSeen,
      userInfo: userData.userInfo
    }));

    return res.json({
      success: true,
      message: "Online users retrieved successfully",
      onlineUsers: onlineUsersList,
      totalOnline: onlineUsersList.length
    });

  } catch (err) {
    console.error("❌ getOnlineUsers error:", err);
    res.status(500).json({ success: false, message: "Failed to get online users" });
  }
};

// Get all conversations for the logged-in user
export const getAllConversations = async (req, res) => {
  try {
    const userId = req.user.id; // logged in user

    // Find all chats where the user is either sender or receiver
    const chats = await Chat.find({
      $or: [
        { from: userId },
        { to: userId }
      ]
    })
      .populate("from", "name email profilePic Name")
      .populate("to", "name email profilePic Name")
      .populate("messages.from", "name email profilePic Name")
      .populate("messages.to", "name email profilePic Name")
      .sort({ updatedAt: -1 }); // Sort by most recent conversation first

    // Allow empty state as success (avoid frontend 404 spam)
    if (!chats || chats.length === 0) {
      console.log(`ℹ️ getAllConversations: No chats found for user ${userId}`);
      return res.json({
        success: true,
        message: "No conversations yet",
        conversations: [],
        totalConversations: 0,
        debug: process.env.BYPASS_SUBSCRIPTION_CHECKS === 'true' ? 'bypass active' : undefined
      });
    }

    // Transform the data to include conversation partners and last message
    const conversations = chats.map(chat => {
      const otherUser = chat.from._id.toString() === userId ? chat.to : chat.from;
      const lastMessage = chat.messages.length > 0 ? chat.messages[chat.messages.length - 1] : null;
      
      return {
        chatId: chat._id,
        otherUser: {
          id: otherUser._id,
          name: otherUser.name || otherUser.Name?.firstName + " " + otherUser.Name?.lastName,
          email: otherUser.email,
          profilePic: otherUser.profilePic
        },
        lastMessage: lastMessage ? {
          message: lastMessage.message,
          from: lastMessage.from._id,
          createdAt: lastMessage.createdAt,
          senderName: lastMessage.from.name || lastMessage.from.Name?.firstName
        } : null,
        messageCount: chat.messages.length,
        isActive: chat.isActive,
        status: chat.status,
        updatedAt: chat.updatedAt
      };
    });

    res.json({
      success: true,
      message: "Conversations retrieved successfully",
      conversations,
      totalConversations: conversations.length
    });

  } catch (err) {
    console.error("❌ getAllConversations error:", err);
    res.status(500).json({ success: false, message: "Failed to fetch conversations" });
  }
};






// demo
// Start audio call
// export const startAudioCall = async (req, res) => {
//   try {
//     const callerId = req.user.id;
//     const { receiverId } = req.body;
//     if (!receiverId) {
//       return res.status(400).json({ success: false, message: "Receiver ID is required" });
//     }

//     // 1) fetch subscription (try to populate planId)
//     let subscription = await Subscription.findOne({ userId: callerId }).populate("planId").exec();
//     if (!subscription) {
//       return res.status(403).json({ success: false, message: "No active subscription" });
//     }
//     if (new Date() > subscription.endDate) {
//       return res.status(403).json({ success: false, message: "Subscription expired" });
//     }

//     // 2) derive planLimits from multiple possible structures:
//     // - subscription.planId (populated)
//     // - subscription.limits (denormalized)
//     // - plan fetched by id if planId is only an ObjectId
//     let planLimits = {};
//     if (subscription.planId && typeof subscription.planId === "object" && subscription.planId.limits) {
//       planLimits = subscription.planId.limits;
//     } else if (subscription.limits) {
//       planLimits = subscription.limits;
//     } else if (subscription.planId) {
//       const plan = await Plan.findById(subscription.planId).lean();
//       planLimits = plan?.limits || {};
//     }

//     // Normalize numeric values
//     const audioLimitRaw = planLimits?.audioTimeSeconds;
//     const audioLimit = audioLimitRaw == null ? null : Number(audioLimitRaw); // null = unlimited
//     // (optional) you can validate NaN -> treat as null
//     const audioLimitFinal = Number.isFinite(audioLimit) ? audioLimit : null;

//     // 3) daily reset logic (YYYY-MM-DD)
//     const today = new Date().toISOString().split("T")[0];
//     if (subscription.lastCallDate !== today) {
//       subscription.audioTimeUsedToday = 0;
//       subscription.videoTimeUsedToday = 0;
//       subscription.lastCallDate = today;
//       await subscription.save(); // important
//       // re-fetch to ensure fields are up-to-date
//       subscription = await Subscription.findById(subscription._id).populate("planId").exec();
//     }

//     // Ensure numeric used value
//     subscription.audioTimeUsedToday = Number(subscription.audioTimeUsedToday) || 0;

//     // 4) compute remaining
//     const remainingAudioSeconds =
//       audioLimitFinal == null ? null : Math.max(0, audioLimitFinal - subscription.audioTimeUsedToday);

//     // Helpful debug info when user sees "no minutes left"
//     if (remainingAudioSeconds !== null && remainingAudioSeconds <= 0) {
//       return res.status(403).json({
//         success: false,
//         message: "No audio minutes left for today",
//         debug: {
//           audioLimit: audioLimitFinal,
//           audioTimeUsedToday: subscription.audioTimeUsedToday,
//           lastCallDate: subscription.lastCallDate,
//           planSource: !!(subscription.planId && subscription.planId.limits) ? "subscription.planId.limits" :
//                       (subscription.limits ? "subscription.limits" : "fetched Plan by id")
//         }
//       });
//     }

//     // 5) create Call
//     const roomId = uuidv4();
//     const newCall = await Call.create({
//       roomId,
//       participants: [{ userId: callerId }, { userId: receiverId }],
//       status: "ringing",
//       startedAt: new Date(),
//     });

//     // 6) auto end when limit expires
//     if (remainingAudioSeconds !== null) {
//       setTimeout(async () => {
//         try {
//           const call = await Call.findById(newCall._id);
//           if (!call) return;
//           // Only auto-end if still not ended
//           if (call.status !== "ended") {
//             call.status = "ended";
//             call.endedAt = new Date();
//             const durationSec = Math.floor((call.endedAt - call.startedAt) / 1000); // correct division
//             call.duration = durationSec;

//             // update subscription usage (guard against race)
//             const sub = await Subscription.findById(subscription._id);
//             sub.audioTimeUsedToday = Number(sub.audioTimeUsedToday || 0) + durationSec;
//             // clamp to limit (if exists)
//             if (audioLimitFinal != null && sub.audioTimeUsedToday > audioLimitFinal) {
//               sub.audioTimeUsedToday = audioLimitFinal;
//             }
//             await sub.save();
//             await call.save();
//             console.log(`📞 Call ${call._id} auto-ended after ${durationSec}s`);
//           }
//         } catch (e) {
//           console.error("Auto-end error:", e);
//         }
//       }, remainingAudioSeconds * 1000);
//     }

//     return res.json({
//       success: true,
//       message: "Audio call started",
//       roomId,
//       callId: newCall._id,
//       remainingAudioMinutes: remainingAudioSeconds === null ? "Unlimited" : Math.floor(remainingAudioSeconds / 60)
//     });
//   } catch (err) {
//     console.error("startAudioCall error:", err);
//     return res.status(500).json({ success: false, message: "Failed to start audio call" });
//   }
// };




// End audio call
// export const endAudioCall = async (req, res) => {
//   try {
//     const { callId } = req.body;
//     const userId = req.user.id; // jisne call end kiya

//     if (!callId) {
//       return res.status(400).json({ success: false, message: "Call ID is required" });
//     }

//     // 1️⃣ Fetch call
//     const call = await Call.findById(callId).populate("participants.userId");
//     if (!call) {
//       return res.status(404).json({ success: false, message: "Call not found" });
//     }

//     if (call.status === "ended") {
//       return res.status(400).json({ success: false, message: "Call already ended" });
//     }

//     // 2️⃣ End call and calculate duration
//     const endedAt = new Date();
//     const durationSec = call.startedAt
//       ? Math.floor((endedAt - call.startedAt) / 1000)
//       : 0;

//     call.status = "ended";
//     call.endedAt = endedAt;
//     call.duration = durationSec;
//     call.endedBy = userId; // ✅ store who ended the call
//     await call.save();

//     // 3️⃣ Update subscription usage for all participants
//     const today = new Date().toISOString().split("T")[0];
//     const participantIds = call.participants.map(p => p.userId);

//     const updatedSubscriptions = [];

//     for (const pid of participantIds) {
//       const subscription = await Subscription.findOne({ userId: pid }).populate("planId");
//       if (!subscription) continue;

//       if (subscription.lastCallDate !== today) {
//         subscription.audioTimeUsedToday = 0;
//         subscription.videoTimeUsedToday = 0;
//         subscription.lastCallDate = today;
//       }

//       subscription.audioTimeUsedToday += durationSec;
//       subscription.videoTimeUsedToday += durationSec;

//       const audioLimit = subscription.planId?.limits?.audioTimeSeconds ?? Infinity;
//       const videoLimit = subscription.planId?.limits?.videoTimeSeconds ?? Infinity;

//       subscription.audioTimeUsedToday = Math.min(subscription.audioTimeUsedToday, audioLimit);
//       subscription.videoTimeUsedToday = Math.min(subscription.videoTimeUsedToday, videoLimit);

//       subscription.audioTimeRemaining = audioLimit - subscription.audioTimeUsedToday;
//       subscription.videoTimeRemaining = videoLimit - subscription.videoTimeUsedToday;

//       await subscription.save();

//       updatedSubscriptions.push({
//         userId: pid,
//         audioTimeRemaining: subscription.audioTimeRemaining,
//         videoTimeRemaining: subscription.videoTimeRemaining,
//       });
//     }

//     // 4️⃣ Return response
//     return res.json({
//       success: true,
//       message: "Call ended successfully",
//       callId: call._id,
//       endedBy: userId, // ✅ show who ended
//       durationInSeconds: durationSec,
//       durationInMinutes: Math.floor(durationSec / 60),
//       updatedSubscriptions,
//     });

//   } catch (err) {
//     console.error("❌ endAudioCall error:", err);
//     res.status(500).json({ success: false, message: "Failed to end call" });
//   }
// };



// import { checkSubscription } from "../utils/checkSubscription.js";

// export const sendMessage = async (req, res) => {

//   try {
//     const from = req.user.id;
//     const { to, message } = req.body;

//     // 🚫 Validate input
//     if (!to) {
//       return res.status(400).json({ success: false, message: "Recipient (to) is required" });
//     }
//     if (!message?.trim()) {
//       return res.status(400).json({ success: false, message: "Message text is required" });
//     }

//     // 🔑 Generate petitionId
//     const petitionId = "MSG" + uuidv4().slice(0, 5);

//     // 🔎 Validate subscription
//     const subscription = await Subscription.findOne({ userId: from }).populate("planId");
//     if (!subscription) {
//       return res.status(403).json({ success: false, message: "No active subscription" });
//     }
//     if (new Date() > subscription.endDate) {
//       return res.status(403).json({ success: false, message: "Subscription expired" });
//     }

//     // 🔄 Reset daily usage if it's a new day
//     const today = new Date().toISOString().split("T")[0];
//     if (subscription.lastMessageDate !== today) {
//       subscription.messagesUsedToday = 0;
//       subscription.lastMessageDate = today;
//     }

//     // 🚫 Check daily message limit
//     const maxMessages = subscription.planId?.limits?.messagesPerDay;
//     if (maxMessages !== undefined && maxMessages !== null && subscription.messagesUsedToday >= maxMessages) {
//       return res.status(403).json({
//         success: false,
//         message: `Daily message limit reached (${maxMessages})`,
//         planType: subscription.planType,
//         messagesUsedToday: subscription.messagesUsedToday,
//         remainingMessagesToday: 0,
//       });
//     }

//     // ➕ Increment usage count
//     subscription.messagesUsedToday += 1;
//     await subscription.save();

//     // ✅ Save message to existing chat or create new one
//     let chat = await Chat.findOne({ from, to });
//     if (!chat) {
//       chat = await Chat.create({ from, to, messages: [] });
//     }

//     chat.messages.push({ from, to, message, petitionId });
//     await chat.save();

//     // ✅ Remaining messages
//     const remainingMessages =
//       maxMessages === undefined || maxMessages === null
//         ? "Unlimited"
//         : maxMessages - subscription.messagesUsedToday;

//     return res.json({
//       success: true,
//       message: "Message sent successfully",
//       sentMessage: message,
//       petitionId,
//       planType: subscription.planType,
//       messagesUsedToday: subscription.messagesUsedToday,
//       remainingMessagesToday: remainingMessages,
//     });
//   } catch (err) {
//     console.error("❌ sendMessage error:", err);
//     res.status(500).json({ success: false, message: "Failed to send message" });
//   }
// };

// Get all chats for logged-in user