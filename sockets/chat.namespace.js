// src/sockets/chat.namespace.js
import jwt from "jsonwebtoken";
import User from "../models/User.js";
import Chat from "../models/Chat.js";
import Subscription from "../models/Subscription.js";
import Plan from "../models/Plan.js";
import { v4 as uuidv4 } from "uuid";

// Store online users: { userId: { socketId, userInfo, lastSeen } }
const onlineUsers = new Map();

// Store user rooms: { userId: Set of roomIds }
const userRooms = new Map();

export default function (nsp) {
  // Middleware for socket authentication
  nsp.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth.token || socket.handshake.headers.authorization?.split(' ')[1];
      
      if (!token) {
        return next(new Error('Authentication token required'));
      }

      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      const user = await User.findById(decoded.id).select('-password');
      
      if (!user || user.status !== 'Active') {
        return next(new Error('Invalid user or inactive account'));
      }

      socket.userId = user._id.toString();
      socket.user = user;
      next();
    } catch (error) {
      console.error('Socket authentication error:', error);
      next(new Error('Authentication failed'));
    }
  });

  nsp.on("connection", async (socket) => {
    try {
      const userId = socket.userId;
      console.log(`✅ Chat connected: ${socket.user.Name.firstName} (${userId}) - Socket: ${socket.id}`);

      // Add user to online users
      onlineUsers.set(userId, {
        socketId: socket.id,
        userInfo: {
          id: userId,
          name: `${socket.user.Name.firstName} ${socket.user.Name.lastName}`,
          profilePic: socket.user.profilePic
        },
        lastSeen: new Date(),
        isOnline: true
      });

      // Initialize user rooms
      if (!userRooms.has(userId)) {
        userRooms.set(userId, new Set());
      }

      // Send current online users list to the newly connected user
      const currentOnlineUsers = Array.from(onlineUsers.entries())
        .filter(([id]) => id !== userId) // Exclude the current user
        .map(([id, userData]) => ({
          userId: id,
          name: userData.userInfo.name,
          lastSeen: userData.lastSeen
        }));

      if (currentOnlineUsers.length > 0) {
        socket.emit('current_online_users', currentOnlineUsers);
        console.log(`📋 Sent ${currentOnlineUsers.length} online users to ${socket.user.Name.firstName}`);
      }

      // Emit online status to other users (notify them this user is now online)
      socket.broadcast.emit('user_online', {
        userId,
        name: `${socket.user.Name.firstName} ${socket.user.Name.lastName}`,
        lastSeen: new Date()
      });

      // Join user to their personal room
      socket.join(`user_${userId}`);

      // Handle joining specific chat room
      socket.on("join_chat", async ({ receiverId }) => {
        try {
          // Validate payload
          if (!receiverId) {
            throw new Error('receiverId is required');
          }

          const roomId = generateRoomId(userId, receiverId);
          
          // Check if both users have valid subscriptions
          const validationResult = await validateBothUsersSubscription(userId, receiverId);
          if (!validationResult.valid) {
            socket.emit('error', {
              type: 'subscription_error',
              message: validationResult.message
            });
            return;
          }

          // Avoid duplicate joins
          if (!socket.rooms.has(roomId)) {
            socket.join(roomId);
          }

          // Ensure room set exists before adding
          let roomsSet = userRooms.get(userId);
          if (!roomsSet) {
            roomsSet = new Set();
            userRooms.set(userId, roomsSet);
          }
          roomsSet.add(roomId);

          // Notify the other user if they're online
          const receiverOnline = onlineUsers.get(receiverId);
          if (receiverOnline) {
            nsp.to(`user_${receiverId}`).emit('user_joined_chat', {
              userId,
              roomId,
              userName: `${socket.user.Name.firstName} ${socket.user.Name.lastName}`
            });
          }

          console.log(`📱 User ${userId} joined chat room: ${roomId}`);
          
          socket.emit('chat_joined', { 
            roomId, 
            receiverId,
            canChat: validationResult.canChat,
            remainingMessages: validationResult.remainingMessages
          });

        } catch (error) {
          console.error('Join chat error:', error);
          socket.emit('error', { type: 'join_error', message: 'Failed to join chat' });
        }
      });

      // Handle sending messages
      socket.on("send_message", async ({ receiverId, message, tempId }) => {
        try {
          if (!receiverId || !message?.trim()) {
            socket.emit('error', { type: 'validation_error', message: 'Receiver ID and message are required' });
            return;
          }

          // Check subscription limits before sending
          const validationResult = await validateBothUsersSubscription(userId, receiverId);
          if (!validationResult.valid || !validationResult.canChat) {
            socket.emit('error', {
              type: 'subscription_error',
              message: validationResult.message
            });
            return;
          }

          // Check sender's message limit
          const senderSubscription = await checkMessageLimit(userId);
          if (!senderSubscription.canSend) {
            socket.emit('error', {
              type: 'limit_exceeded',
              message: senderSubscription.message
            });
            return;
          }

          // Generate unique message ID
          const messageId = uuidv4();
          const roomId = generateRoomId(userId, receiverId);

          // Save message to database
          const savedMessage = await saveMessageToDB(userId, receiverId, message, messageId, tempId);
          
          if (!savedMessage.success) {
            socket.emit('error', { type: 'db_error', message: 'Failed to save message' });
            return;
          }

          // Prepare message object for real-time delivery
          const messageObj = {
            id: messageId,
            petitionId: messageId,
            from: userId,
            to: receiverId,
            message: message.trim(),
            timestamp: new Date().toISOString(), // Use ISO string for consistency
            status: 'sent',
            senderName: `${socket.user.Name.firstName} ${socket.user.Name.lastName}`,
            senderProfilePic: socket.user.profilePic,
            tempId: savedMessage.tempId // Include tempId for client matching
          };

          // Send to sender (confirmation)
          socket.emit('message_sent', {
            ...messageObj,
            remainingMessages: savedMessage.remainingMessages
          });

          // Send to receiver if online
          const receiverOnline = onlineUsers.get(receiverId);
          if (receiverOnline) {
            nsp.to(`user_${receiverId}`).emit('new_message', messageObj);
            
            // Mark as delivered
            setTimeout(() => {
              socket.emit('message_delivered', { messageId });
            }, 100);
          }

          // Emit to room for any other connected instances
          socket.to(roomId).emit('new_message', messageObj);

          console.log(`💬 Message sent: ${userId} → ${receiverId}`);

        } catch (error) {
          console.error('Send message error:', error);
          socket.emit('error', { type: 'send_error', message: 'Failed to send message' });
        }
      });

      // Handle typing indicators
      socket.on("typing_start", ({ receiverId }) => {
        if (receiverId) {
          const receiverOnline = onlineUsers.get(receiverId);
          if (receiverOnline) {
            nsp.to(`user_${receiverId}`).emit('user_typing', {
              userId,
              userName: `${socket.user.Name.firstName} ${socket.user.Name.lastName}`,
              isTyping: true
            });
          }
        }
      });

      socket.on("typing_stop", ({ receiverId }) => {
        if (receiverId) {
          const receiverOnline = onlineUsers.get(receiverId);
          if (receiverOnline) {
            nsp.to(`user_${receiverId}`).emit('user_typing', {
              userId,
              userName: `${socket.user.Name.firstName} ${socket.user.Name.lastName}`,
              isTyping: false
            });
          }
        }
      });

      // Handle message read status
      socket.on("mark_messages_read", async ({ senderId, messageIds }) => {
        try {
          // Update message status in database
          await markMessagesAsRead(userId, senderId, messageIds);
          
          // Notify sender that messages were read
          const senderOnline = onlineUsers.get(senderId);
          if (senderOnline) {
            nsp.to(`user_${senderId}`).emit('messages_read', {
              readBy: userId,
              messageIds,
              readAt: new Date()
            });
          }
        } catch (error) {
          console.error('Mark messages read error:', error);
        }
      });

      // ===== CALL INVITATION EVENTS =====
      
      // Handle call invitation
      socket.on("call:invite", ({ receiverId, callType, roomId }) => {
        try {
          console.log(`📞 Call invitation: ${userId} -> ${receiverId} (${callType})`);
          
          const receiverOnline = onlineUsers.get(receiverId);
          if (receiverOnline) {
            // Send call invitation to receiver
            nsp.to(`user_${receiverId}`).emit('call:incoming', {
              callerId: userId,
              callerInfo: socket.user,
              callType, // 'audio' or 'video'
              roomId,
              timestamp: new Date()
            });
            
            // Confirm to caller that invitation was sent
            socket.emit('call:invitation_sent', {
              receiverId,
              roomId,
              status: 'sent'
            });
          } else {
            // Receiver is offline
            socket.emit('call:invitation_failed', {
              receiverId,
              reason: 'User is offline'
            });
          }
        } catch (error) {
          console.error('Call invitation error:', error);
          socket.emit('call:invitation_failed', {
            receiverId,
            reason: 'Server error'
          });
        }
      });

      // Handle call acceptance
      socket.on("call:accept", ({ callerId, roomId }) => {
        try {
          console.log(`✅ Call accepted: ${userId} accepted call from ${callerId}`);
          
          const callerOnline = onlineUsers.get(callerId);
          if (callerOnline) {
            // Notify caller that call was accepted
            nsp.to(`user_${callerId}`).emit('call:accepted', {
              receiverId: userId,
              roomId,
              timestamp: new Date()
            });
            
            // Confirm to receiver
            socket.emit('call:join_room', {
              roomId,
              callerId,
              status: 'accepted'
            });
          }
        } catch (error) {
          console.error('Call acceptance error:', error);
        }
      });

      // Handle call rejection
      socket.on("call:reject", ({ callerId, roomId }) => {
        try {
          console.log(`❌ Call rejected: ${userId} rejected call from ${callerId}`);
          
          const callerOnline = onlineUsers.get(callerId);
          if (callerOnline) {
            // Notify caller that call was rejected
            nsp.to(`user_${callerId}`).emit('call:rejected', {
              receiverId: userId,
              roomId,
              timestamp: new Date()
            });
          }
        } catch (error) {
          console.error('Call rejection error:', error);
        }
      });

      // Handle call end
      socket.on("call:end", ({ roomId, receiverId }) => {
        try {
          console.log(`🔚 Call ended: ${userId} ended call in room ${roomId}`);
          
          if (receiverId) {
            const receiverOnline = onlineUsers.get(receiverId);
            if (receiverOnline) {
              // Notify receiver that call ended
              nsp.to(`user_${receiverId}`).emit('call:ended', {
                roomId,
                endedBy: userId,
                timestamp: new Date()
              });
            }
          }
        } catch (error) {
          console.error('Call end error:', error);
        }
      });

      // Handle disconnection
      socket.on("disconnect", () => {
        console.log(`❌ Chat disconnected: ${socket.user.Name.firstName} (${userId}) - Socket: ${socket.id}`);
        
        // Update user status
        if (onlineUsers.has(userId)) {
          onlineUsers.set(userId, {
            ...onlineUsers.get(userId),
            isOnline: false,
            lastSeen: new Date()
          });

          // Notify friends about offline status
          socket.broadcast.emit('user_offline', {
            userId,
            lastSeen: new Date()
          });

          // Remove from online users after 30 seconds (grace period)
          setTimeout(() => {
            onlineUsers.delete(userId);
            userRooms.delete(userId);
          }, 30000);
        }
      });

    } catch (error) {
      console.error('Socket connection error:', error);
      socket.emit('error', { type: 'connection_error', message: 'Connection failed' });
    }
  });
}

// Helper Functions

function generateRoomId(userId1, userId2) {
  // Ensure consistent room ID regardless of user order
  const sortedIds = [userId1, userId2].sort();
  return `chat_${sortedIds[0]}_${sortedIds[1]}`;
}

async function validateBothUsersSubscription(userId1, userId2) {
  try {
    if (process.env.BYPASS_SUBSCRIPTION_CHECKS === 'true') {
      return {
        valid: true,
        canChat: true,
        remainingMessages: 'Unlimited',
        message: 'Bypassed (dev mode)'
      };
    }
    const [user1Sub, user2Sub] = await Promise.all([
      Subscription.findOne({ userId: userId1 }).populate('planId'),
      Subscription.findOne({ userId: userId2 }).populate('planId')
    ]);

    // Check if both users have subscriptions
    if (!user1Sub || !user2Sub) {
      return {
        valid: false,
        canChat: false,
        message: 'Both users must have active subscriptions to chat'
      };
    }

    // Check if subscriptions are active
    const now = new Date();
    if (now > user1Sub.endDate || now > user2Sub.endDate) {
      return {
        valid: false,
        canChat: false,
        message: 'One or both subscriptions have expired'
      };
    }

    // Get the most restrictive message limit
    const user1Limit = user1Sub.planId?.limits?.messagesPerDay;
    const user2Limit = user2Sub.planId?.limits?.messagesPerDay;
    
    const remainingMessages1 = user1Limit ? Math.max(0, user1Limit - (user1Sub.messagesUsedToday || 0)) : null;
    const remainingMessages2 = user2Limit ? Math.max(0, user2Limit - (user2Sub.messagesUsedToday || 0)) : null;

    return {
      valid: true,
      canChat: true,
      remainingMessages: Math.min(
        remainingMessages1 || Infinity,
        remainingMessages2 || Infinity
      ),
      user1Subscription: user1Sub,
      user2Subscription: user2Sub
    };

  } catch (error) {
    console.error('Subscription validation error:', error);
    return {
      valid: false,
      canChat: false,
      message: 'Failed to validate subscriptions'
    };
  }
}

async function checkMessageLimit(userId) {
  try {
    if (process.env.BYPASS_SUBSCRIPTION_CHECKS === 'true') {
      return { canSend: true, message: 'Bypassed (dev mode)' };
    }
    const subscription = await Subscription.findOne({ userId }).populate('planId');
    
    if (!subscription) {
      return { canSend: false, message: 'No active subscription' };
    }

    if (new Date() > subscription.endDate) {
      return { canSend: false, message: 'Subscription expired' };
    }

    const maxMessages = subscription.planId?.limits?.messagesPerDay;
    if (maxMessages === null || maxMessages === undefined) {
      return { canSend: true, message: 'Unlimited messages' };
    }

    const today = new Date().toISOString().split('T')[0];
    if (subscription.lastMessageDate !== today) {
      // Reset daily count
      subscription.messagesUsedToday = 0;
      subscription.lastMessageDate = today;
      await subscription.save();
    }

    const usedToday = subscription.messagesUsedToday || 0;
    const remaining = Math.max(0, maxMessages - usedToday);

    if (remaining <= 0) {
      return {
        canSend: false,
        message: `Daily message limit (${maxMessages}) reached. Upgrade your plan for more messages.`
      };
    }

    return { canSend: true, remaining };

  } catch (error) {
    console.error('Check message limit error:', error);
    return { canSend: false, message: 'Failed to check message limit' };
  }
}

async function saveMessageToDB(fromId, toId, message, messageId, tempId = null) {
  try {
    // Update subscription usage (skip when bypass enabled)
    const subscription = await Subscription.findOne({ userId: fromId });
    if (subscription && process.env.BYPASS_SUBSCRIPTION_CHECKS !== 'true') {
      subscription.messagesUsedToday = (subscription.messagesUsedToday || 0) + 1;
      subscription.messagesUsedTotal = (subscription.messagesUsedTotal || 0) + 1; // Update primary field
      subscription.totalMessagesUsed = subscription.messagesUsedTotal; // Keep legacy field in sync
      await subscription.save();
      
      console.log(`📊 Socket updated subscription usage for user ${fromId}:`, {
        messagesUsedTotal: subscription.messagesUsedTotal,
        totalMessagesUsed: subscription.totalMessagesUsed
      });
    } else if (process.env.BYPASS_SUBSCRIPTION_CHECKS === 'true') {
      console.log('🚧 Socket subscription usage update skipped (bypass enabled)');
    }

    // Find or create chat
    let chat = await Chat.findOne({
      $or: [
        { from: fromId, to: toId },
        { from: toId, to: fromId }
      ]
    });

    if (!chat) {
      chat = await Chat.create({
        from: fromId,
        to: toId,
        messages: []
      });
    }

    // Add message with consistent timestamp
    const messageTimestamp = new Date();
    chat.messages.push({
      from: fromId,
      to: toId,
      message,
      petitionId: messageId,
      createdAt: messageTimestamp
    });

    await chat.save();

    const maxMessages = subscription?.planId?.limits?.messagesPerDay;
    const remainingMessages = process.env.BYPASS_SUBSCRIPTION_CHECKS === 'true'
      ? 'Unlimited'
      : (maxMessages ? Math.max(0, maxMessages - (subscription?.messagesUsedToday || 0)) : null);

    return {
      success: true,
      remainingMessages: remainingMessages === null ? 'Unlimited' : remainingMessages,
      tempId: tempId, // Return tempId for client matching
      timestamp: messageTimestamp.toISOString() // Return consistent timestamp
    };

  } catch (error) {
    console.error('Save message to DB error:', error);
    return { success: false, tempId: tempId };
  }
}

async function markMessagesAsRead(readerId, senderId, messageIds) {
  try {
    await Chat.updateMany(
      {
        $or: [
          { from: senderId, to: readerId },
          { from: readerId, to: senderId }
        ],
        'messages.petitionId': { $in: messageIds }
      },
      {
        $set: { 'messages.$.status': 'read' }
      }
    );
  } catch (error) {
    console.error('Mark messages as read error:', error);
  }
}

// Export helper functions for use in other modules
export { onlineUsers, generateRoomId };