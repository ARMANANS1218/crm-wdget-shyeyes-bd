/**
 * Agent Controller
 * 
 * Handles all agent-related operations:
 * - Sub-user CRUD (create, read, update, delete)
 * - Impersonation token generation and termination
 * - Chat monitoring (view user chats, message metadata)
 * - Audit log retrieval
 * 
 * Security notes:
 * - All impersonation actions are logged to AuditLog
 * - Impersonation tokens use separate JWT secret and short TTL
 * - Agents can only access their own sub-users
 * - Rate limiting applied to sensitive operations
 */

import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { body, validationResult } from 'express-validator';
import SubUser from '../../models/SubUser.js';
import AuditLog from '../../models/AuditLog.js';
import User from '../../models/User.js';
import Chat from '../../models/Chat.js';
import { logAudit, getClientIp } from '../../middleware/common/auditLogger.js';

/**
 * Sign an impersonation JWT token
 * 
 * @param {String} agentId - Agent performing impersonation
 * @param {String} subUserId - Sub-user being impersonated
 * @param {Number} ttlSec - Time to live in seconds (default from env or 900 = 15 min)
 * @returns {String} Signed JWT token
 * 
 * Token claims:
 * - sub: subUserId (subject = the sub-user being impersonated)
 * - impersonated_by: agentId
 * - impersonation: true (flag to identify impersonation tokens)
 * - scope: ['chat:send', 'chat:read'] (limited permissions)
 * - iat: issued at timestamp
 * - exp: expiration timestamp
 */
const signImpersonationToken = (agentId, subUserId, ttlSec = null) => {
  const secret = process.env.JWT_IMPERSONATION_SECRET || process.env.JWT_SECRET;
  const ttl = ttlSec || parseInt(process.env.IMP_TOKEN_TTL_SEC) || 900; // Default 15 min

  const payload = {
    sub: subUserId,
    impersonated_by: agentId,
    impersonation: true,
    scope: ['chat:send', 'chat:read', 'call:initiate'],
  };

  return jwt.sign(payload, secret, { expiresIn: ttl });
};

/**
 * @route   POST /api/agent/subusers
 * @desc    Create a new sub-user account
 * @access  Private (Agent only)
 */
const createSubUser = async (req, res) => {
  try {
    // Attach agentId from authenticated agent
    const agentId = req.user.id || req.user._id;
    const subUserData = {
      ...req.body,
      agentId, // Ensure agentId is set
    };

    // Validation
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        errors: errors.array(),
      });
    }

    const { username, displayName, avatar, password, isBot } = req.body;

    // Ensure username has 'sub_' prefix
    const finalUsername = username.startsWith('sub_') ? username : `sub_${username}`;

    // Check username availability
    const isAvailable = await SubUser.isUsernameAvailable(finalUsername);
    if (!isAvailable) {
      return res.status(409).json({
        success: false,
        message: 'Username already exists',
      });
    }

    // Create sub-user
    const subUser = new SubUser({
      agentId: req.user._id,
      username: finalUsername,
      displayName: displayName || finalUsername,
      avatar: avatar || 'https://via.placeholder.com/150',
      isBot: isBot !== undefined ? isBot : true,
    });

    // Add password if provided
    if (password && password.trim()) {
      subUser.passwordHash = password; // Will be hashed by pre-save hook
    }

    await subUser.save();

    // Log audit entry
    await logAudit({
      actorId: req.user._id,
      actorRole: req.user.role,
      action: 'subuser_created',
      subUserId: subUser._id,
      ip: getClientIp(req),
      userAgent: req.headers['user-agent'] || '',
      reason: req.body.reason || 'Sub-user created',
      metadata: { username: finalUsername, displayName },
    });

    res.status(201).json({
      success: true,
      message: 'Sub-user created successfully',
      data: {
        subUser: {
          _id: subUser._id,
          username: subUser.username,
          displayName: subUser.displayName,
          avatar: subUser.avatar,
          isBot: subUser.isBot,
          active: subUser.active,
          createdAt: subUser.createdAt,
        },
      },
    });
  } catch (error) {
    console.error('Create sub-user error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create sub-user',
      error: error.message,
    });
  }
};

/**
 * @route   GET /api/agent/subusers
 * @desc    Get all sub-users for current agent (paginated)
 * @access  Private (Agent only)
 */
const getSubUsers = async (req, res) => {
  try {
    console.log("getSubUsers controller req.user:", req.user); // Debug log
    const agentId = req.user.id || req.user._id;
    const subUsers = await SubUser.find({ agentId });

    res.status(200).json({
      success: true,
      data: {
        subUsers,
        pagination: { pages: 1 }, // Add pagination if needed
      },
    });
  } catch (error) {
    console.error("Error fetching sub-users:", error); // Debug log
    res.status(500).json({ message: "Failed to fetch sub-users" });
  }
};

/**
 * @route   PATCH /api/agent/subusers/:id
 * @desc    Update sub-user (display name, avatar, active status)
 * @access  Private (Agent only, must own sub-user)
 */
const updateSubUser = async (req, res) => {
  try {
    const subUser = req.targetSubUser; // Set by verifySubUserOwnership middleware
    const { displayName, avatar, active } = req.body;

    if (displayName !== undefined) {
      subUser.displayName = displayName;
    }

    if (avatar !== undefined) {
      subUser.avatar = avatar;
    }

    if (active !== undefined) {
      subUser.active = active;
    }

    await subUser.save();

    // Log audit entry
    await logAudit({
      actorId: req.user._id,
      actorRole: req.user.role,
      action: 'subuser_updated',
      subUserId: subUser._id,
      ip: getClientIp(req),
      userAgent: req.headers['user-agent'] || '',
      reason: req.body.reason || 'Sub-user updated',
      metadata: { displayName, avatar, active },
    });

    res.status(200).json({
      success: true,
      message: 'Sub-user updated successfully',
      data: { subUser },
    });
  } catch (error) {
    console.error('Update sub-user error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update sub-user',
      error: error.message,
    });
  }
};

/**
 * @route   DELETE /api/agent/subusers/:id
 * @desc    Soft-delete sub-user (set active = false)
 * @access  Private (Agent only, must own sub-user)
 */
const deleteSubUser = async (req, res) => {
  try {
    const subUser = req.targetSubUser; // Set by verifySubUserOwnership middleware

    subUser.active = false;
    await subUser.save();

    // Log audit entry
    await logAudit({
      actorId: req.user._id,
      actorRole: req.user.role,
      action: 'subuser_deleted',
      subUserId: subUser._id,
      ip: getClientIp(req),
      userAgent: req.headers['user-agent'] || '',
      reason: req.body.reason || 'Sub-user deleted',
    });

    res.status(200).json({
      success: true,
      message: 'Sub-user deleted successfully',
    });
  } catch (error) {
    console.error('Delete sub-user error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete sub-user',
      error: error.message,
    });
  }
};

/**
 * @route   POST /api/agent/impersonate/:id
 * @desc    Generate impersonation token for a sub-user
 * @access  Private (Agent only, must own sub-user)
 * 
 * Security:
 * - Requires agent's password confirmation (or could add 2FA)
 * - Logs audit entry with reason
 * - Token expires in 5-15 minutes (configurable)
 */
const impersonateSubUser = async (req, res) => {
  try {
    const subUser = req.targetSubUser; // Set by verifySubUserOwnership middleware
    const { agentPassword, reason } = req.body;

    // SECURITY: Require agent password confirmation
    if (!agentPassword) {
      return res.status(400).json({
        success: false,
        message: 'Agent password confirmation required for impersonation',
      });
    }

    // Verify agent password
    const agent = await User.findById(req.user._id).select('+password');
    const isPasswordValid = await bcrypt.compare(agentPassword, agent.password);

    if (!isPasswordValid) {
      return res.status(401).json({
        success: false,
        message: 'Invalid agent password',
      });
    }

    // Require reason for impersonation (compliance)
    if (!reason || reason.trim().length < 10) {
      return res.status(400).json({
        success: false,
        message: 'Reason for impersonation required (minimum 10 characters)',
      });
    }

    // Generate impersonation token
    const token = signImpersonationToken(agent._id.toString(), subUser._id.toString());

    // Log audit entry
    await logAudit({
      actorId: agent._id,
      actorRole: agent.role,
      action: 'impersonation_started',
      subUserId: subUser._id,
      ip: getClientIp(req),
      userAgent: req.headers['user-agent'] || '',
      reason: reason.trim(),
      metadata: {
        subUsername: subUser.username,
        subDisplayName: subUser.displayName,
      },
    });

    res.status(200).json({
      success: true,
      message: 'Impersonation token generated successfully',
      data: {
        impersonationToken: token,
        expiresIn: parseInt(process.env.IMP_TOKEN_TTL_SEC) || 900,
        subUser: {
          _id: subUser._id,
          username: subUser.username,
          displayName: subUser.displayName,
          avatar: subUser.avatar,
        },
        warning: 'All actions while impersonating will be logged and audited.',
      },
    });
  } catch (error) {
    console.error('Impersonate sub-user error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to generate impersonation token',
      error: error.message,
    });
  }
};

/**
 * @route   POST /api/agent/switch-back
 * @desc    End impersonation session (invalidate token, log audit)
 * @access  Private (Requires impersonation token)
 * 
 * Note: Since JWT tokens are stateless, we can't truly "invalidate" them server-side
 * without a token blacklist (Redis). For now, we just log the audit entry and rely
 * on the client to delete the token. For production, implement Redis-based blacklist.
 */
const switchBack = async (req, res) => {
  try {
    // Token info attached by requireImpersonationToken middleware
    if (!req.isImpersonating || !req.impostor || !req.subUser) {
      return res.status(400).json({
        success: false,
        message: 'Not currently impersonating',
      });
    }

    // Log audit entry
    await logAudit({
      actorId: req.impostor.agentId,
      actorRole: req.impostor.agentRole,
      action: 'impersonation_ended',
      subUserId: req.subUser._id,
      ip: getClientIp(req),
      userAgent: req.headers['user-agent'] || '',
      reason: 'Agent ended impersonation session',
    });

    // TODO: For production, add token to Redis blacklist
    // await redisClient.set(`blacklist:${token}`, '1', 'EX', ttl);

    res.status(200).json({
      success: true,
      message: 'Impersonation ended successfully',
    });
  } catch (error) {
    console.error('Switch back error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to end impersonation',
      error: error.message,
    });
  }
};

/**
 * @route   GET /api/agent/monitor/chats
 * @desc    Get list of users and their recent chat metadata (for monitoring)
 * @access  Private (Agent only)
 * 
 * Returns: List of users with last message preview (metadata only, not full content)
 */
const getMonitoringChats = async (req, res) => {
  try {
    const { page = 1, limit = 20, search = '', userId } = req.query;

    // If specific userId provided, get that user's chats
    if (userId) {
      const chats = await Chat.find({
        $or: [{ from: userId }, { to: userId }],
      })
        .populate('from', 'username displayName avatar')
        .populate('to', 'username displayName avatar')
        .sort({ updatedAt: -1 })
        .limit(20);

      return res.status(200).json({
        success: true,
        data: { chats },
      });
    }

    // Otherwise, get list of all users with recent activity
    const query = search
      ? {
          $or: [
            { username: { $regex: search, $options: 'i' } },
            { displayName: { $regex: search, $options: 'i' } },
          ],
        }
      : {};

    const users = await User.find(query)
      .select('username displayName avatar lastActive createdAt')
      .sort({ lastActive: -1 })
      .skip((parseInt(page) - 1) * parseInt(limit))
      .limit(parseInt(limit));

    const total = await User.countDocuments(query);

    res.status(200).json({
      success: true,
      data: {
        users,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total,
          pages: Math.ceil(total / parseInt(limit)),
        },
      },
    });
  } catch (error) {
    console.error('Get monitoring chats error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to retrieve monitoring data',
      error: error.message,
    });
  }
};

/**
 * @route   GET /api/agent/monitor/chat/:userId
 * @desc    Get full chat history for a specific user (read-only unless impersonating)
 * @access  Private (Agent only)
 */
const getMonitoringChatDetail = async (req, res) => {
  try {
    const { userId } = req.params;

    // Verify user exists
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found',
      });
    }

    // Get all chats involving this user
    const chats = await Chat.find({
      $or: [{ from: userId }, { to: userId }],
    })
      .populate('from', 'username displayName avatar')
      .populate('to', 'username displayName avatar')
      .sort({ updatedAt: -1 });

    res.status(200).json({
      success: true,
      data: {
        user: {
          _id: user._id,
          username: user.username,
          displayName: user.displayName,
          avatar: user.avatar,
        },
        chats,
        readOnly: !req.isImpersonating, // Can only send messages if impersonating
      },
    });
  } catch (error) {
    console.error('Get monitoring chat detail error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to retrieve chat details',
      error: error.message,
    });
  }
};

/**
 * @route   GET /api/agent/audit-log
 * @desc    Get audit log entries for current agent
 * @access  Private (Agent only, can also be accessed by admin/superadmin)
 */
const getAuditLog = async (req, res) => {
  try {
    const { page = 1, limit = 50, action, startDate, endDate } = req.query;

    const options = {
      page: parseInt(page),
      limit: parseInt(limit),
      action: action || undefined,
      startDate: startDate || undefined,
      endDate: endDate || undefined,
    };

    // Agents can only see their own logs; admins can see all
    const actorId = req.user.role === 'agent' ? req.user._id : undefined;

    const logs = actorId
      ? await AuditLog.findByActor(actorId, options)
      : await AuditLog.find()
          .sort({ timestamp: -1 })
          .skip((options.page - 1) * options.limit)
          .limit(options.limit)
          .populate('actorId', 'username role')
          .populate('targetUserId', 'username displayName')
          .populate('subUserId', 'username displayName');

    const total = actorId
      ? await AuditLog.countDocuments({ actorId })
      : await AuditLog.countDocuments();

    res.status(200).json({
      success: true,
      data: {
        logs,
        pagination: {
          page: options.page,
          limit: options.limit,
          total,
          pages: Math.ceil(total / options.limit),
        },
      },
    });
  } catch (error) {
    console.error('Get audit log error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to retrieve audit log',
      error: error.message,
    });
  }
};

export {
  createSubUser,
  getSubUsers,
  updateSubUser,
  deleteSubUser,
  impersonateSubUser,
  switchBack,
  getMonitoringChats,
  getMonitoringChatDetail,
  getAuditLog,
  signImpersonationToken, // Export for testing
};
