/**
 * AuditLog Model
 * 
 * Records all impersonation and monitoring actions for security and compliance.
 * Every time an agent creates a sub-user, impersonates, sends a message while
 * impersonating, or switches back, an audit entry is created.
 * 
 * Security considerations:
 * - Immutable once created (no updates/deletes allowed)
 * - Indexed for fast queries by agent, action, and timestamp
 * - Retention policy configurable via AUDIT_LOG_RETENTION_DAYS env var
 * - Includes IP and User-Agent for forensic analysis
 * 
 * GDPR/Privacy compliance:
 * - Ensure users are notified that their chats may be monitored
 * - Consider data retention policies and right to erasure
 * - Audit logs should be stored securely and access-controlled
 */

import mongoose from 'mongoose';

const auditLogSchema = new mongoose.Schema(
  {
    // The agent or admin who performed the action
    actorId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'Actor ID is required'],
      index: true,
    },

    // Role of the actor at the time of action
    actorRole: {
      type: String,
      required: true,
      enum: ['superadmin', 'admin', 'agent'],
      index: true,
    },

    // Action performed
    action: {
      type: String,
      required: [true, 'Action is required'],
      enum: [
        'subuser_created',
        'subuser_updated',
        'subuser_deleted',
        'impersonation_started',
        'impersonation_ended',
        'message_sent_impersonated',
        'call_initiated_impersonated',
        'monitor_chat_viewed',
        'monitor_user_list_viewed',
      ],
      index: true,
    },

    // Target user (real user being monitored or chatted with)
    targetUserId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
      index: true,
    },

    // Sub-user involved in the action (if applicable)
    subUserId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'SubUser',
      default: null,
      index: true,
    },

    // IP address of the actor
    ip: {
      type: String,
      required: true,
    },

    // User-Agent string for device/browser identification
    userAgent: {
      type: String,
      default: '',
    },

    // Optional reason provided by actor (e.g., "Customer support request #1234")
    reason: {
      type: String,
      maxlength: [500, 'Reason must not exceed 500 characters'],
      default: '',
    },

    // Additional metadata (flexible for future use)
    metadata: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },

    // Timestamp (immutable)
    timestamp: {
      type: Date,
      default: Date.now,
      immutable: true,
      index: true,
    },
  },
  {
    timestamps: false, // Using custom timestamp field
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

// Compound indexes for common queries
auditLogSchema.index({ actorId: 1, timestamp: -1 });
auditLogSchema.index({ action: 1, timestamp: -1 });
auditLogSchema.index({ subUserId: 1, timestamp: -1 });
auditLogSchema.index({ targetUserId: 1, timestamp: -1 });

// TTL index for automatic deletion based on retention policy
// Default: keep logs for 90 days (configurable via AUDIT_LOG_RETENTION_DAYS)
const retentionDays = parseInt(process.env.AUDIT_LOG_RETENTION_DAYS) || 90;
auditLogSchema.index({ timestamp: 1 }, { expireAfterSeconds: retentionDays * 24 * 60 * 60 });

// Prevent modifications after creation
auditLogSchema.pre('save', function (next) {
  if (!this.isNew) {
    return next(new Error('Audit logs are immutable and cannot be modified'));
  }
  next();
});

// Static method: create audit log entry
auditLogSchema.statics.log = async function (data) {
  try {
    const entry = new this(data);
    await entry.save();
    return entry;
  } catch (error) {
    console.error('Failed to create audit log:', error);
    // Don't throw - we don't want audit logging failures to break the app
    return null;
  }
};

// Static method: get logs for an agent (paginated)
auditLogSchema.statics.findByActor = function (actorId, options = {}) {
  const query = { actorId };

  if (options.action) {
    query.action = options.action;
  }

  if (options.startDate || options.endDate) {
    query.timestamp = {};
    if (options.startDate) {
      query.timestamp.$gte = new Date(options.startDate);
    }
    if (options.endDate) {
      query.timestamp.$lte = new Date(options.endDate);
    }
  }

  const page = parseInt(options.page) || 1;
  const limit = parseInt(options.limit) || 50;
  const skip = (page - 1) * limit;

  return this.find(query)
    .sort({ timestamp: -1 })
    .skip(skip)
    .limit(limit)
    .populate('targetUserId', 'username displayName')
    .populate('subUserId', 'username displayName');
};

// Static method: get logs for a sub-user
auditLogSchema.statics.findBySubUser = function (subUserId, options = {}) {
  const query = { subUserId };

  const page = parseInt(options.page) || 1;
  const limit = parseInt(options.limit) || 50;
  const skip = (page - 1) * limit;

  return this.find(query)
    .sort({ timestamp: -1 })
    .skip(skip)
    .limit(limit)
    .populate('actorId', 'username role')
    .populate('targetUserId', 'username displayName');
};

// Static method: get statistics for an agent
auditLogSchema.statics.getAgentStats = async function (actorId, days = 30) {
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);

  const stats = await this.aggregate([
    {
      $match: {
        actorId: new mongoose.Types.ObjectId(actorId),
        timestamp: { $gte: startDate },
      },
    },
    {
      $group: {
        _id: '$action',
        count: { $sum: 1 },
      },
    },
  ]);

  return stats.reduce((acc, stat) => {
    acc[stat._id] = stat.count;
    return acc;
  }, {});
};

const AuditLog = mongoose.model('AuditLog', auditLogSchema);

export default AuditLog;
