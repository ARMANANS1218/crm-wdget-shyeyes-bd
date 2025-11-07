/**
 * Socket.IO Impersonation Extension
 * 
 * Extends existing Socket.IO authentication to support impersonation tokens.
 * 
 * Integration steps:
 * 1. Import this module in socketio.js
 * 2. Replace or extend the existing auth middleware
 * 3. Handle impersonated message events with metadata
 * 
 * Features:
 * - Validates both regular JWT and impersonation JWT tokens
 * - Attaches impersonation metadata to socket (socket.impostor)
 * - Logs all impersonated actions
 * - Supports audio/video calls with impersonation tracking
 */

import jwt from "jsonwebtoken";
import User from "../models/User.js";
import SubUser from "../models/SubUser.js";
import { logAudit } from "../middleware/common/auditLogger.js";

/**
 * Enhanced Socket.IO authentication middleware
 * 
 * Supports both regular user tokens and impersonation tokens.
 * Attaches user/sub-user info and impersonation metadata to socket.
 * 
 * Socket properties set:
 * - socket.user: The authenticated user (or sub-user if impersonating)
 * - socket.isImpersonating: Boolean flag
 * - socket.impostor: { agentId, agentRole, agentUsername } (if impersonating)
 * - socket.subUser: SubUser document (if impersonating)
 */
export const enhancedSocketAuth = async (socket, next) => {
  try {
    const token = socket.handshake.auth?.token;
    
    if (!token) {
      return next(new Error("No token provided"));
    }

    // Try to decode with main JWT secret first
    let decoded;
    let isImpersonationToken = false;

    try {
      decoded = jwt.verify(token, process.env.JWT_SECRET);
    } catch (mainError) {
      // If main JWT fails, try impersonation JWT secret
      try {
        const impSecret = process.env.JWT_IMPERSONATION_SECRET || process.env.JWT_SECRET;
        decoded = jwt.verify(token, impSecret);
        
        if (decoded.impersonation === true) {
          isImpersonationToken = true;
        } else {
          return next(new Error("Invalid token"));
        }
      } catch (impError) {
        return next(new Error("Invalid token"));
      }
    }

    // Handle impersonation token
    if (isImpersonationToken) {
      const { sub: subUserId, impersonated_by: agentId } = decoded;

      // Fetch sub-user
      const subUser = await SubUser.findById(subUserId);
      if (!subUser || !subUser.active) {
        return next(new Error("Sub-user not found or inactive"));
      }

      // Fetch agent
      const agent = await User.findById(agentId);
      if (!agent || agent.role !== 'agent') {
        return next(new Error("Agent not found"));
      }

      // Verify ownership
      if (subUser.agentId.toString() !== agent._id.toString()) {
        return next(new Error("Sub-user does not belong to agent"));
      }

      // Attach to socket
      socket.user = {
        _id: subUser._id,
        username: subUser.username,
        displayName: subUser.displayName,
        avatar: subUser.avatar,
        role: 'sub-user', // Virtual role
      };
      
      socket.isImpersonating = true;
      socket.impostor = {
        agentId: agent._id,
        agentRole: agent.role,
        agentUsername: agent.username,
      };
      socket.subUser = subUser;

      // Update lastUsedAt
      await subUser.markAsUsed();

      console.log(`✅ Agent ${agent.username} impersonating ${subUser.username}`);
    } else {
      // Handle regular user token
      const user = await User.findById(decoded.id);
      if (!user) {
        return next(new Error("User not found"));
      }

      socket.user = user;
      socket.isImpersonating = false;

      console.log(`✅ User connected: ${user.username}`);
    }

    next();
  } catch (err) {
    console.error("Socket auth failed:", err.message);
    next(new Error("Authentication failed"));
  }
};

/**
 * Helper: Log impersonated socket actions
 * 
 * Call this whenever an impersonated user performs an action.
 */
export const logImpersonatedAction = async (socket, action, metadata = {}) => {
  if (!socket.isImpersonating || !socket.impostor) {
    return;
  }

  await logAudit({
    actorId: socket.impostor.agentId,
    actorRole: socket.impostor.agentRole,
    action,
    subUserId: socket.subUser?._id,
    targetUserId: metadata.targetUserId || null,
    ip: socket.handshake.address || 'unknown',
    userAgent: socket.handshake.headers['user-agent'] || '',
    reason: 'Action performed while impersonating',
    metadata,
  });
};

/**
 * Enhanced private message handler with impersonation support
 * 
 * Replace existing private_message handler with this version.
 * Stores impersonation metadata with messages.
 */
export const handlePrivateMessageWithImpersonation = async (socket, io, { to, content }, ack) => {
  try {
    // Your existing subscription checks...
    const sub = socket.subscription;
    if (!sub || !sub.active) {
      return ack({ ok: false, message: "No active subscription" });
    }

    // Message sending logic...
    // (Your existing code here)

    // Prepare message data with impersonation info
    const messageData = {
      from: socket.user._id,
      content,
      impersonation: {
        isImpersonated: socket.isImpersonating || false,
        agentId: socket.impostor?.agentId || null,
        subUserId: socket.subUser?._id || null,
        impersonatedAt: socket.isImpersonating ? new Date() : null,
      },
    };

    // Emit to recipient
    io.to(to).emit("private_message", messageData);

    // Log if impersonating
    if (socket.isImpersonating) {
      await logImpersonatedAction(socket, 'message_sent_impersonated', {
        targetUserId: to,
        messagePreview: content.substring(0, 50),
      });
    }

    ack({ ok: true });
  } catch (err) {
    console.error("Private message error:", err);
    ack({ ok: false, message: "Error sending message" });
  }
};

/**
 * Enhanced call request handler with impersonation support
 */
export const handleCallRequestWithImpersonation = async (socket, io, { to, type }, ack) => {
  try {
    // Your existing subscription and feature checks...
    const sub = socket.subscription;
    if (!sub || !sub.active) {
      return ack({ ok: false, message: "No active subscription" });
    }

    // Call logic...
    // (Your existing code here)

    // Prepare call data with impersonation info
    const callData = {
      from: socket.user._id,
      type,
      impersonation: {
        isImpersonated: socket.isImpersonating || false,
        agentId: socket.impostor?.agentId || null,
      },
    };

    // Emit to recipient
    io.to(to).emit("call:incoming", callData);

    // Log if impersonating
    if (socket.isImpersonating) {
      await logImpersonatedAction(socket, 'call_initiated_impersonated', {
        targetUserId: to,
        callType: type,
      });
    }

    ack({ ok: true });
  } catch (err) {
    console.error("Call request error:", err);
    ack({ ok: false, message: "Error initiating call" });
  }
};

/**
 * Integration instructions:
 * 
 * In your socketio.js file:
 * 
 * 1. Import this module:
 *    import { enhancedSocketAuth, handlePrivateMessageWithImpersonation, handleCallRequestWithImpersonation } from './impersonation.socket.js';
 * 
 * 2. Replace the auth middleware:
 *    io.use(enhancedSocketAuth);
 * 
 * 3. Update message handler:
 *    socket.on("private_message", (data, ack) => handlePrivateMessageWithImpersonation(socket, io, data, ack));
 * 
 * 4. Update call handler:
 *    socket.on("call:request", (data, ack) => handleCallRequestWithImpersonation(socket, io, data, ack));
 */

export default {
  enhancedSocketAuth,
  logImpersonatedAction,
  handlePrivateMessageWithImpersonation,
  handleCallRequestWithImpersonation,
};
