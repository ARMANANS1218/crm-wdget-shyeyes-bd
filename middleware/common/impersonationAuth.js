/**
 * Impersonation Authentication Middleware
 * 
 * Validates impersonation JWT tokens and attaches impersonation metadata to req.
 * 
 * Security features:
 * - Verifies token signature using JWT_IMPERSONATION_SECRET (separate from main JWT_SECRET)
 * - Checks token expiration (short TTL: 5-15 minutes)
 * - Validates impersonation-specific claims (sub, impersonated_by, scope)
 * - Ensures impersonation flag is present
 * - Attaches both sub-user and agent info to request
 * 
 * Usage:
 *   router.post('/message', requireImpersonationToken, async (req, res) => {
 *     // req.subUser contains the sub-user being impersonated
 *     // req.impostor contains the agent doing the impersonating
 *   });
 */

import jwt from 'jsonwebtoken';
import SubUser from '../../models/SubUser.js';
import User from '../../models/User.js';

/**
 * Middleware: Require and validate impersonation token
 * 
 * Expects Authorization header: Bearer <impersonation_token>
 * or impersonationToken in cookies/body
 */
const requireImpersonationToken = async (req, res, next) => {
  try {
    // Extract token from multiple sources
    let token = null;

    // 1. Authorization header
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      token = authHeader.substring(7);
    }

    // 2. Cookie (if using cookie-based auth)
    if (!token && req.cookies && req.cookies.impersonationToken) {
      token = req.cookies.impersonationToken;
    }

    // 3. Body (for WebSocket handshake or special cases)
    if (!token && req.body && req.body.impersonationToken) {
      token = req.body.impersonationToken;
    }

    // 4. Query param (for Socket.IO handshake)
    if (!token && req.query && req.query.impersonationToken) {
      token = req.query.impersonationToken;
    }

    if (!token) {
      return res.status(401).json({
        success: false,
        message: 'Impersonation token required',
      });
    }

    // Verify token using impersonation secret
    const secret = process.env.JWT_IMPERSONATION_SECRET || process.env.JWT_SECRET;
    const decoded = jwt.verify(token, secret);

    // Validate impersonation-specific claims
    if (!decoded.impersonation || decoded.impersonation !== true) {
      return res.status(403).json({
        success: false,
        message: 'Invalid impersonation token: missing impersonation flag',
      });
    }

    if (!decoded.sub || !decoded.impersonated_by) {
      return res.status(403).json({
        success: false,
        message: 'Invalid impersonation token: missing required claims',
      });
    }

    // Fetch sub-user from database
    const subUser = await SubUser.findById(decoded.sub);
    if (!subUser || !subUser.active) {
      return res.status(403).json({
        success: false,
        message: 'Sub-user not found or inactive',
      });
    }

    // Fetch agent (impostor) from database
    const agent = await User.findById(decoded.impersonated_by);
    if (!agent || agent.role !== 'agent') {
      return res.status(403).json({
        success: false,
        message: 'Agent not found or invalid role',
      });
    }

    // Verify sub-user belongs to this agent
    if (subUser.agentId.toString() !== agent._id.toString()) {
      return res.status(403).json({
        success: false,
        message: 'Sub-user does not belong to this agent',
      });
    }

    // Update lastUsedAt timestamp for sub-user
    await subUser.markAsUsed();

    // Attach to request object
    req.subUser = subUser;
    req.impostor = {
      agentId: agent._id,
      agentRole: agent.role,
      agentUsername: agent.username,
    };
    req.impersonationToken = decoded;
    req.isImpersonating = true;

    next();
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({
        success: false,
        message: 'Impersonation token expired. Please re-authenticate.',
      });
    }

    if (error.name === 'JsonWebTokenError') {
      return res.status(403).json({
        success: false,
        message: 'Invalid impersonation token',
      });
    }

    console.error('Impersonation auth error:', error);
    return res.status(500).json({
      success: false,
      message: 'Authentication failed',
    });
  }
};

/**
 * Middleware: Optional impersonation token
 * 
 * Similar to requireImpersonationToken but doesn't fail if token is missing.
 * Useful for routes that support both normal and impersonated requests.
 */
const optionalImpersonationToken = async (req, res, next) => {
  try {
    let token = null;

    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      token = authHeader.substring(7);
    }

    if (!token && req.cookies && req.cookies.impersonationToken) {
      token = req.cookies.impersonationToken;
    }

    if (!token) {
      req.isImpersonating = false;
      return next();
    }

    const secret = process.env.JWT_IMPERSONATION_SECRET || process.env.JWT_SECRET;
    const decoded = jwt.verify(token, secret);

    if (decoded.impersonation === true && decoded.sub && decoded.impersonated_by) {
      const subUser = await SubUser.findById(decoded.sub);
      const agent = await User.findById(decoded.impersonated_by);

      if (subUser && agent && subUser.agentId.toString() === agent._id.toString()) {
        req.subUser = subUser;
        req.impostor = {
          agentId: agent._id,
          agentRole: agent.role,
          agentUsername: agent.username,
        };
        req.impersonationToken = decoded;
        req.isImpersonating = true;
      }
    }

    next();
  } catch (error) {
    // Ignore errors for optional middleware
    req.isImpersonating = false;
    next();
  }
};

export {
  requireImpersonationToken,
  optionalImpersonationToken,
};
