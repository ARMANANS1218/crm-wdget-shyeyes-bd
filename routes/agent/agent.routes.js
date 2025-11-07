import express from "express";
import { body } from "express-validator";
import {
  getAllAgents,
  getAgentById,
  updateAgent,
  banAgent,
  unbanAgent,
  deleteAgent,
  editAgentProfile,
  changeAgentProfileImage,
} from "../../controllers/agent/agent.controller.js";

import { protectedAuth, allowRoles } from "../../middleware/common/protectedAuth.js";
import uploadRoleProfile from "../../middleware/common/uploadRoleProfile.js";

// Import chat monitoring controller and middleware
import {
  createSubUser,
  getSubUsers,
  updateSubUser,
  deleteSubUser,
  impersonateSubUser,
  switchBack,
  getMonitoringChats,
  getMonitoringChatDetail,
  getAuditLog,
} from "../../controllers/agent/agentController.js";

import {
  requireAgentRole,
  preventPrivilegeEscalation,
  verifySubUserOwnership,
  rateLimitSensitiveOps,
} from "../../middleware/common/roleCheck.js";

import {
  requireImpersonationToken,
} from "../../middleware/common/impersonationAuth.js";

import {
  auditLogger,
  auditMonitoringAccess,
} from "../../middleware/common/auditLogger.js";

const router = express.Router();

// ===== ADMIN ONLY ROUTES FOR AGENT MANAGEMENT =====

// Get all agents with pagination and filtering
router.get("/", protectedAuth, allowRoles("admin", "superadmin"), getAllAgents);

// Get single agent by ID
router.get("/:agentId", protectedAuth, allowRoles("admin", "superadmin"), getAgentById);

// Update agent information
router.put("/:agentId", protectedAuth, allowRoles("admin", "superadmin"), updateAgent);

// Ban an agent
router.patch("/:agentId/ban", protectedAuth, allowRoles("admin", "superadmin"), banAgent);

// Unban an agent
router.patch("/:agentId/unban", protectedAuth, allowRoles("admin", "superadmin"), unbanAgent);

// Delete an agent (soft delete)
router.delete("/:agentId", protectedAuth, allowRoles("admin", "superadmin"), deleteAgent);

// ✅ New profile routes
router.put(
  "/profile/edit",
  protectedAuth,
  allowRoles("agent"),
  uploadRoleProfile,
  editAgentProfile
);

router.patch(
  "/profile/change-image",
  protectedAuth,
  allowRoles("agent"),
  uploadRoleProfile,
  changeAgentProfileImage
);

// ========================================
// CHAT MONITORING ROUTES (New Feature)
// ========================================

/**
 * @route   POST /api/agent/subusers
 * @desc    Create a new sub-user account
 * @access  Private (Agent only)
 */
router.post(
  "/subusers",
  protectedAuth,
  requireAgentRole,
  rateLimitSensitiveOps(10, 60000),
  preventPrivilegeEscalation,
  [
    body('username')
      .trim()
      .isLength({ min: 3, max: 30 })
      .matches(/^[a-z0-9_]+$/)
      .withMessage('Username must be 3-30 characters, lowercase alphanumeric and underscores only'),
    body('displayName')
      .trim()
      .isLength({ min: 1, max: 50 })
      .withMessage('Display name required (max 50 characters)'),
    body('avatar').optional().isURL().withMessage('Avatar must be a valid URL'),
    body('password').optional().isLength({ min: 6 }).withMessage('Password must be at least 6 characters'),
    body('isBot').optional().isBoolean().withMessage('isBot must be boolean'),
  ],
  auditLogger('subuser_created'),
  createSubUser
);

/**
 * @route   GET /api/agent/subusers
 * @desc    Get all sub-users for current agent
 * @access  Private (Agent only)
 */
router.get(
  "/subusers",
  protectedAuth,
  requireAgentRole,
  (req, res, next) => {
    console.log("GET /subusers final req.user:", req.user); // Debug log
    next();
  },
  getSubUsers
);

/**
 * @route   PATCH /api/agent/subusers/:id
 * @desc    Update sub-user details
 * @access  Private (Agent only, must own sub-user)
 */
router.patch(
  "/subusers/:id",
  protectedAuth,
  requireAgentRole,
  verifySubUserOwnership,
  [
    body('displayName').optional().trim().isLength({ min: 1, max: 50 }),
    body('avatar').optional().isURL(),
    body('active').optional().isBoolean(),
  ],
  auditLogger('subuser_updated'),
  updateSubUser
);

/**
 * @route   DELETE /api/agent/subusers/:id
 * @desc    Soft-delete sub-user
 * @access  Private (Agent only, must own sub-user)
 */
router.delete(
  "/subusers/:id",
  protectedAuth,
  requireAgentRole,
  verifySubUserOwnership,
  auditLogger('subuser_deleted'),
  deleteSubUser
);

/**
 * @route   POST /api/agent/impersonate/:id
 * @desc    Generate impersonation token for a sub-user
 * @access  Private (Agent only, must own sub-user)
 */
router.post(
  "/impersonate/:id",
  protectedAuth,
  requireAgentRole,
  rateLimitSensitiveOps(5, 60000),
  verifySubUserOwnership,
  [
    body('agentPassword')
      .notEmpty()
      .withMessage('Agent password required for impersonation'),
    body('reason')
      .trim()
      .isLength({ min: 10, max: 500 })
      .withMessage('Reason required (10-500 characters) for compliance'),
  ],
  auditLogger('impersonation_started'),
  impersonateSubUser
);

/**
 * @route   POST /api/agent/switch-back
 * @desc    End impersonation session
 * @access  Private (Requires active impersonation token)
 */
router.post(
  "/switch-back",
  requireImpersonationToken,
  auditLogger('impersonation_ended'),
  switchBack
);

/**
 * @route   GET /api/agent/monitor/chats
 * @desc    Get list of users and their chat metadata
 * @access  Private (Agent only)
 */
router.get(
  "/monitor/chats",
  protectedAuth,
  requireAgentRole,
  auditMonitoringAccess('monitor_user_list_viewed'),
  getMonitoringChats
);

/**
 * @route   GET /api/agent/monitor/chat/:userId
 * @desc    Get full chat history for a specific user
 * @access  Private (Agent only)
 */
router.get(
  "/monitor/chat/:userId",
  protectedAuth,
  requireAgentRole,
  auditMonitoringAccess('monitor_chat_viewed'),
  getMonitoringChatDetail
);

/**
 * @route   GET /api/agent/audit-log
 * @desc    Get audit log entries for current agent
 * @access  Private (Agent only)
 */
router.get(
  "/audit-log",
  protectedAuth,
  requireAgentRole,
  getAuditLog
);

/**
 * @route   GET /api/agent/dashboard-stats
 * @desc    Get dashboard statistics for the agent
 * @access  Private (Agent only)
 */
router.get(
  "/dashboard-stats",
  protectedAuth,
  requireAgentRole,
  (req, res) => {
    res.status(200).json({
      success: true,
      totalUsers: 0,
      activeUsers: 0,
      bannedUsers: 0,
      totalPayments: 0,
      todayLogin: 0,
      genderRatio: { male: 0, female: 0, others: 0 }
    });
  }
);

export default router;
