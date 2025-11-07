import mongoose from "mongoose";

// Unified schema for Agent, Admin, and SuperAdmin
const roleSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    email: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    role: {
      type: String,
      enum: ["agent", "admin", "superadmin"],
      required: true,
      default: "agent",
    },
    // Agent fields
    department: { type: String },
    dob: { type: Date },
    gender: { type: String },
    assignedTasks: [{ type: mongoose.Schema.Types.ObjectId, ref: "Task" }],
    // Admin fields
    privileges: [{ type: String }],
    // SuperAdmin fields
    systemAccessLevel: { type: Number, default: 10 },
    // Common fields
    phoneNo: { type: String },
    status: {
      type: String,
      enum: ["Active", "Inactive", "Banned"],
      default: "Active",
    },
    profileImage: { type: String },
    lastLogin: { type: Date },
    address: { type: String },

    // Security fields
    resetPasswordOtp: { type: String },
    resetPasswordExpires: { type: Date },
    otpVerifiedForReset: { type: Boolean, default: false },
    emailVerified: { type: Boolean, default: false },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: "Role" },

    // Block/Unblock fields
    blockReason: { type: String },
    blockedAt: { type: Date },
    blockedBy: { type: mongoose.Schema.Types.ObjectId, ref: "Role" },
    unblockedAt: { type: Date },
    unblockedBy: { type: mongoose.Schema.Types.ObjectId, ref: "Role" },
    // Soft delete fields
    deletedAt: { type: Date },
    deletedBy: { type: mongoose.Schema.Types.ObjectId, ref: "Role" },
  },
  { timestamps: true }
);

export default mongoose.model("Role", roleSchema);
//maaz
