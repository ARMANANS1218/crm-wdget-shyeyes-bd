/**
 * Audit Logger Middleware
 * 
 * Automatically logs actions to AuditLog collection for security and compliance.
 * 
 * Usage:
 *   router.post('/impersonate/:id', auditLogger('impersonation_started'), async (req, res) => {
 *     // Action will be logged with IP, user-agent, actor, and metadata
 *   });
 * 
 * Or use manually in controller:
 *   await logAudit({
 *     actorId: req.user._id,
 *     actorRole: req.user.role,
 *     action: 'subuser_created',
 *     subUserId: newSubUser._id,
 *     ip: req.ip,
 *     userAgent: req.headers['user-agent'],
 *     reason: req.body.reason,
 *   });
 */

import AuditLog from '../../models/AuditLog.js';

/**
 * Helper function to extract client IP (handles proxies)
 */
const getClientIp = (req) => {
  return (
    req.headers['x-forwarded-for']?.split(',')[0].trim() ||
    req.headers['x-real-ip'] ||
    req.connection?.remoteAddress ||
    req.socket?.remoteAddress ||
    req.ip ||
    'unknown'
  );
};

/**
 * Manual audit log function (use in controllers)
 * 
 * @param {Object} data - Audit log data
 * @param {String} data.actorId - The user performing the action
 * @param {String} data.actorRole - Role of the actor
 * @param {String} data.action - Action being performed
 * @param {String} data.targetUserId - Optional target user
 * @param {String} data.subUserId - Optional sub-user
 * @param {String} data.ip - Client IP address
 * @param {String} data.userAgent - User agent string
 * @param {String} data.reason - Optional reason for action
 * @param {Object} data.metadata - Optional additional metadata
 */
const logAudit = async (data) => {
  try {
    await AuditLog.log(data);
  } catch (error) {
    // Log error but don't throw - we don't want audit failures to break the app
    console.error('Failed to create audit log:', error);
  }
};

/**
 * Middleware factory: creates middleware that logs a specific action
 * 
 * @param {String} action - The action to log (e.g., 'impersonation_started')
 * @param {Function} getMetadata - Optional function to extract metadata from req
 * @returns {Function} Express middleware
 */
const auditLogger = (action, getMetadata = null) => {
  return async (req, res, next) => {
    // Store original res.json to intercept response
    const originalJson = res.json.bind(res);

    res.json = function (body) {
      // Only log if request was successful (status < 400)
      if (res.statusCode < 400) {
        // Extract actor info (from req.user or req.impostor)
        const actor = req.user || req.impostor;
        
        if (actor) {
          const logData = {
            actorId: actor._id || actor.agentId,
            actorRole: actor.role || actor.agentRole || 'unknown',
            action,
            targetUserId: req.body?.targetUserId || req.params?.userId || null,
            subUserId: req.body?.subUserId || req.params?.id || req.subUser?._id || null,
            ip: getClientIp(req),
            userAgent: req.headers['user-agent'] || '',
            reason: req.body?.reason || '',
            metadata: getMetadata ? getMetadata(req, body) : {},
          };

          // Log asynchronously (don't wait)
          logAudit(logData).catch((err) => {
            console.error('Audit logging failed:', err);
          });
        }
      }

      // Call original res.json
      return originalJson(body);
    };

    next();
  };
};

/**
 * Middleware: Log impersonation message sending
 * 
 * Should be used on routes that send messages while impersonating
 */
const auditImpersonatedMessage = async (req, res, next) => {
  if (req.isImpersonating && req.impostor) {
    await logAudit({
      actorId: req.impostor.agentId,
      actorRole: req.impostor.agentRole,
      action: 'message_sent_impersonated',
      targetUserId: req.body?.to || req.body?.targetUserId,
      subUserId: req.subUser?._id,
      ip: getClientIp(req),
      userAgent: req.headers['user-agent'] || '',
      reason: 'Message sent while impersonating',
      metadata: {
        messagePreview: req.body?.message?.substring(0, 50) || '',
      },
    });
  }
  next();
};

/**
 * Middleware: Log call initiation while impersonating
 */
const auditImpersonatedCall = async (req, res, next) => {
  if (req.isImpersonating && req.impostor) {
    await logAudit({
      actorId: req.impostor.agentId,
      actorRole: req.impostor.agentRole,
      action: 'call_initiated_impersonated',
      targetUserId: req.body?.calleeId || req.params?.userId,
      subUserId: req.subUser?._id,
      ip: getClientIp(req),
      userAgent: req.headers['user-agent'] || '',
      reason: 'Call initiated while impersonating',
      metadata: {
        callType: req.body?.callType || 'unknown',
      },
    });
  }
  next();
};

/**
 * Middleware: Log chat monitoring views
 */
const auditMonitoringAccess = (action) => {
  return async (req, res, next) => {
    if (req.user && req.user.role === 'agent') {
      await logAudit({
        actorId: req.user._id,
        actorRole: req.user.role,
        action: action || 'monitor_chat_viewed',
        targetUserId: req.query?.userId || req.params?.userId || null,
        ip: getClientIp(req),
        userAgent: req.headers['user-agent'] || '',
        reason: 'Agent monitoring chat',
      });
    }
    next();
  };
};

export {
  logAudit,
  auditLogger,
  auditImpersonatedMessage,
  auditImpersonatedCall,
  auditMonitoringAccess,
  getClientIp,
};
