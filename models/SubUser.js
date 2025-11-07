/**
 * SubUser Model
 * 
 * Represents internal "sub-user" accounts created and managed by agents.
 * These accounts are used by agents to impersonate and chat with real users.
 * 
 * Security considerations:
 * - Username must be unique across SubUsers (namespaced with 'sub_' prefix)
 * - Each SubUser is owned by exactly one agent (agentId)
 * - Cannot have same username as real User accounts
 * - Password is optional (for bot-like sub-users)
 */

import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';

const subUserSchema = new mongoose.Schema(
  {
    // Owner agent reference
    agentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'Agent ID is required'],
      index: true,
    },

    // Unique username for this sub-user (namespaced with 'sub_' prefix to prevent collision)
    username: {
      type: String,
      required: [true, 'Username is required'],
      unique: true,
      lowercase: true,
      trim: true,
      minlength: [3, 'Username must be at least 3 characters'],
      maxlength: [30, 'Username must not exceed 30 characters'],
      match: [
        /^sub_[a-z0-9_]+$/,
        'Username must start with sub_ and contain only lowercase letters, numbers, and underscores',
      ],
    },

    // Display name shown in chat UI
    displayName: {
      type: String,
      required: [true, 'Display name is required'],
      trim: true,
      maxlength: [50, 'Display name must not exceed 50 characters'],
    },

    // Avatar URL (Cloudinary or default)
    avatar: {
      type: String,
      default: 'https://via.placeholder.com/150',
    },

    // Optional password for sub-user (hashed with bcrypt)
    // If not set, this is a bot-like account controlled entirely by agent
    passwordHash: {
      type: String,
      select: false, // Don't return by default
    },

    // Flag indicating if this is a bot or human-controlled sub-account
    isBot: {
      type: Boolean,
      default: true,
    },

    // Active status (soft delete flag)
    active: {
      type: Boolean,
      default: true,
      index: true,
    },

    // Metadata for tracking
    lastUsedAt: {
      type: Date,
      default: null,
    },

    // Creation timestamp
    createdAt: {
      type: Date,
      default: Date.now,
      immutable: true,
    },

    // Update timestamp
    updatedAt: {
      type: Date,
      default: Date.now,
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

// Indexes for performance
subUserSchema.index({ agentId: 1, active: 1 });
subUserSchema.index({ username: 1 });
subUserSchema.index({ createdAt: -1 });

// Pre-save hook: hash password if provided
subUserSchema.pre('save', async function (next) {
  if (!this.isModified('passwordHash') || !this.passwordHash) {
    return next();
  }

  try {
    const salt = await bcrypt.genSalt(10);
    this.passwordHash = await bcrypt.hash(this.passwordHash, salt);
    next();
  } catch (error) {
    next(error);
  }
});

// Method: compare password
subUserSchema.methods.comparePassword = async function (candidatePassword) {
  if (!this.passwordHash) {
    return false;
  }
  return await bcrypt.compare(candidatePassword, this.passwordHash);
};

// Method: update lastUsedAt timestamp
subUserSchema.methods.markAsUsed = async function () {
  this.lastUsedAt = new Date();
  await this.save();
};

// Static method: find active sub-users for an agent
subUserSchema.statics.findByAgent = function (agentId, options = {}) {
  const query = { agentId, active: true };

  if (options.search) {
    query.$or = [
      { username: { $regex: options.search, $options: 'i' } },
      { displayName: { $regex: options.search, $options: 'i' } },
    ];
  }

  const page = parseInt(options.page) || 1;
  const limit = parseInt(options.limit) || 20;
  const skip = (page - 1) * limit;

  return this.find(query)
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(limit)
    .select('-passwordHash');
};

// Static method: check if username already exists
subUserSchema.statics.isUsernameAvailable = async function (username) {
  const existing = await this.findOne({ username: username.toLowerCase() });
  return !existing;
};

const SubUser = mongoose.model('SubUser', subUserSchema);

export default SubUser;
