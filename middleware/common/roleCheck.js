/**
 * Role Check Middleware
 * 
 * Validates user roles and prevents privilege escalation.
 * 
 * Security features:
 * - Ensures only agents can access agent-specific routes
 * - Prevents agents from impersonating admin/superadmin accounts
 * - Validates user has active session
 * - Works in combination with existing auth middleware
 * 
 * Usage:
 *   router.get('/agent/dashboard', protectAuth, requireRole('agent'), async (req, res) => {
 *     // Only agents can access this route
 *   });
 */

import User from '../../models/User.js';

/**
 * Middleware: Require specific role(s)
 * 
 * @param {String|Array} roles - Required role(s) (e.g., 'agent' or ['agent', 'admin'])
 * @returns {Function} Express middleware
 */
const requireRole = (...roles) => {
  return (req, res, next) => {
    // Ensure user is authenticated (should be set by protectAuth middleware)
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required',
      });
    }

    // Flatten array if roles passed as array
    const allowedRoles = roles.flat();

    // Check if user's role is in allowed roles
    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: `Access denied. Required role: ${allowedRoles.join(' or ')}`,
      });
    }

    next();
  };
};

/**
 * Middleware: Require agent role specifically
 * 
 * Shorthand for requireRole('agent')
 */
export const requireAgentRole = (req, res, next) => {
  console.log("requireAgentRole req.user:", req.user);
  if (req.user && (req.user.role === 'agent' || req.user.role === 'admin')) {
    return next();
  }
  return res.status(403).json({ message: 'Access denied' });
};

/**
 * Middleware: Require admin or superadmin role
 */
const requireAdminRole = requireRole('admin', 'superadmin');

/**
 * Middleware: Prevent impersonation of privileged accounts
 * 
 * Used when creating sub-users or validating impersonation targets.
 * Ensures agents cannot create sub-users that mimic admin/superadmin accounts.
 */
const preventPrivilegeEscalation = async (req, res, next) => {
  try {
    // Check if username conflicts with existing privileged users
    const username = req.body?.username;

    if (username) {
      // Ensure username has 'sub_' prefix for sub-users
      if (!username.startsWith('sub_')) {
        return res.status(400).json({
          success: false,
          message: 'Sub-user usernames must start with "sub_" prefix',
        });
      }

      // Check if any real user has similar username (without prefix)
      const baseUsername = username.replace(/^sub_/, '');
      const existingUser = await User.findOne({
        username: { $in: [username, baseUsername] },
      });

      if (existingUser) {
        return res.status(409).json({
          success: false,
          message: 'Username conflicts with existing user account',
        });
      }

      // Additional check: prevent suspicious usernames
      const suspiciousPatterns = [
        /admin/i,
        /superadmin/i,
        /root/i,
        /moderator/i,
        /staff/i,
      ];

      const isSuspicious = suspiciousPatterns.some((pattern) =>
        pattern.test(baseUsername)
      );

      if (isSuspicious) {
        return res.status(400).json({
          success: false,
          message: 'Username contains restricted keywords',
        });
      }
    }

    next();
  } catch (error) {
    console.error('Privilege escalation check error:', error);
    return res.status(500).json({
      success: false,
      message: 'Security validation failed',
    });
  }
};

/**
 * Middleware: Verify sub-user ownership
 * 
 * Ensures the agent requesting access to a sub-user actually owns it.
 * Used for update/delete/impersonate operations.
 */
const verifySubUserOwnership = async (req, res, next) => {
  try {
    const { default: SubUser } = await import('../../models/SubUser.js');
    const subUserId = req.params.id || req.body.subUserId;

    if (!subUserId) {
      return res.status(400).json({
        success: false,
        message: 'Sub-user ID required',
      });
    }

    const subUser = await SubUser.findById(subUserId);

    if (!subUser) {
      return res.status(404).json({
        success: false,
        message: 'Sub-user not found',
      });
    }

    // Verify ownership
    if (subUser.agentId.toString() !== req.user._id.toString()) {
      return res.status(403).json({
        success: false,
        message: 'You do not have permission to access this sub-user',
      });
    }

    // Attach sub-user to request for controller use
    req.targetSubUser = subUser;

    next();
  } catch (error) {
    console.error('Sub-user ownership verification error:', error);
    return res.status(500).json({
      success: false,
      message: 'Ownership verification failed',
    });
  }
};

/**
 * Middleware: Rate limiting for sensitive operations
 * 
 * Simple in-memory rate limiter for impersonation and sub-user creation.
 * For production, use Redis-based rate limiting (express-rate-limit + Redis).
 */
const rateLimitMap = new Map();

const rateLimitSensitiveOps = (maxRequests = 10, windowMs = 60000) => {
  return (req, res, next) => {
    const userId = req.user?._id?.toString();

    if (!userId) {
      return next();
    }

    const now = Date.now();
    const userKey = `${userId}:${req.route?.path || req.path}`;

    if (!rateLimitMap.has(userKey)) {
      rateLimitMap.set(userKey, { count: 1, resetAt: now + windowMs });
      return next();
    }

    const record = rateLimitMap.get(userKey);

    // Reset if window expired
    if (now > record.resetAt) {
      record.count = 1;
      record.resetAt = now + windowMs;
      return next();
    }

    // Check limit
    if (record.count >= maxRequests) {
      return res.status(429).json({
        success: false,
        message: 'Too many requests. Please try again later.',
        retryAfter: Math.ceil((record.resetAt - now) / 1000),
      });
    }

    record.count++;
    next();
  };
};

// Cleanup rate limit map every 5 minutes
setInterval(() => {
  const now = Date.now();
  for (const [key, record] of rateLimitMap.entries()) {
    if (now > record.resetAt) {
      rateLimitMap.delete(key);
    }
  }
}, 5 * 60 * 1000);

export {
  requireRole,
  // requireAgentRole,
  requireAdminRole,
  preventPrivilegeEscalation,
  verifySubUserOwnership,
  rateLimitSensitiveOps,
};
