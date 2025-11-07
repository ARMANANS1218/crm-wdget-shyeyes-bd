import mongoose from "mongoose";
import Role from "../../models/Role.js";

// ===== GET ALL AGENTS (Admin Only) =====
export const getAllAgents = async (req, res) => {
  try {
    const { page = 1, limit = 10, status, department, search } = req.query;
    const skip = (page - 1) * limit;

    // Build filter object
    const filter = { role: "agent" };
    
    if (status && status !== "all") {
      filter.status = status;
    }
    
    if (department && department !== "all") {
      filter.department = department;
    }
    
    if (search) {
      filter.$or = [
        { name: { $regex: search, $options: "i" } },
        { email: { $regex: search, $options: "i" } },
        { department: { $regex: search, $options: "i" } }
      ];
    }

    // Get agents with pagination
    const agents = await Role.find(filter)
      .select("-password")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    // Get total count for pagination
    const totalAgents = await Role.countDocuments(filter);
    const totalPages = Math.ceil(totalAgents / limit);

    res.status(200).json({
      success: true,
      message: "Agents retrieved successfully",
      data: {
        agents,
        pagination: {
          currentPage: parseInt(page),
          totalPages,
          totalAgents,
          hasNext: page < totalPages,
          hasPrev: page > 1
        }
      }
    });
  } catch (error) {
    console.error("Get all agents error:", error);
    res.status(500).json({
      success: false,
      message: "Server error. Unable to retrieve agents."
    });
  }
};

// ===== UPDATE AGENT (Admin Only) =====
export const updateAgent = async (req, res) => {
  try {
    const { agentId } = req.params;
    const updateData = req.body;

    // Remove sensitive fields that shouldn't be updated directly
    delete updateData.role;
    delete updateData.password;
    delete updateData._id;

    // Check if agent exists
    const agent = await Role.findOne({ _id: agentId, role: "agent" });
    if (!agent) {
      return res.status(404).json({
        success: false,
        message: "Agent not found"
      });
    }

    // Check if email is being updated and if it's already taken
    if (updateData.email && updateData.email !== agent.email) {
      const existingUser = await Role.findOne({ 
        email: updateData.email.toLowerCase(),
        _id: { $ne: agentId }
      });
      if (existingUser) {
        return res.status(409).json({
          success: false,
          message: "Email already exists"
        });
      }
      updateData.email = updateData.email.toLowerCase();
    }

    // Update agent
    const updatedAgent = await Role.findByIdAndUpdate(
      agentId,
      updateData,
      { new: true, runValidators: true }
    ).select("-password");

    res.status(200).json({
      success: true,
      message: "Agent updated successfully",
      data: updatedAgent
    });
  } catch (error) {
    console.error("Update agent error:", error);
    res.status(500).json({
      success: false,
      message: "Server error. Unable to update agent."
    });
  }
};

// ===== BAN AGENT (Admin Only) =====
export const banAgent = async (req, res) => {
  try {
    const { agentId } = req.params;
    const { reason } = req.body;

    // Check if agent exists
    const agent = await Role.findOne({ _id: agentId, role: "agent" });
    if (!agent) {
      return res.status(404).json({
        success: false,
        message: "Agent not found"
      });
    }

    // Check if agent is already banned
    if (agent.status === "Banned") {
      return res.status(400).json({
        success: false,
        message: "Agent is already banned"
      });
    }

    // Ban the agent
    const bannedAgent = await Role.findByIdAndUpdate(
      agentId,
      { 
        status: "Banned",
        blockReason: reason || "Banned by admin",
        blockedAt: new Date(),
        blockedBy: req.user._id
      },
      { new: true }
    ).select("-password");

    res.status(200).json({
      success: true,
      message: "Agent banned successfully",
      data: bannedAgent
    });
  } catch (error) {
    console.error("Block agent error:", error);
    res.status(500).json({
      success: false,
      message: "Server error. Unable to ban agent."
    });
  }
};

// ===== UNBAN AGENT (Admin Only) =====
export const unbanAgent = async (req, res) => {
  try {
    const { agentId } = req.params;

    // Check if agent exists
    const agent = await Role.findOne({ _id: agentId, role: "agent" });
    if (!agent) {
      return res.status(404).json({
        success: false,
        message: "Agent not found"
      });
    }

    // Check if agent is actually banned
    if (agent.status !== "Banned") {
      return res.status(400).json({
        success: false,
        message: "Agent is not banned"
      });
    }

    // Unban the agent
    const unbannedAgent = await Role.findByIdAndUpdate(
      agentId,
      { 
        status: "Active",
        $unset: { 
          blockReason: 1,
          blockedAt: 1,
          blockedBy: 1
        },
        unblockedAt: new Date(),
        unblockedBy: req.user._id
      },
      { new: true }
    ).select("-password");

    res.status(200).json({
      success: true,
      message: "Agent unbanned successfully",
      data: unbannedAgent
    });
  } catch (error) {
    console.error("Unban agent error:", error);
    res.status(500).json({
      success: false,
      message: "Server error. Unable to unban agent."
    });
  }
};

// ===== DELETE AGENT (Admin Only) =====
export const deleteAgent = async (req, res) => {
  try {
    const { agentId } = req.params;
    const { confirmDelete } = req.body;

    // Require confirmation for deletion
    if (!confirmDelete) {
      return res.status(400).json({
        success: false,
        message: "Please confirm deletion by setting confirmDelete to true"
      });
    }

    // Only admins/superadmins can delete (your middleware already enforces this, but safe to keep)
    if (!req.user || !["admin", "superadmin"].includes(req.user.role)) {
      return res.status(403).json({ success: false, message: "Forbidden" });
    }

    // Hard delete agent
    const deletedAgent = await Role.findByIdAndDelete(agentId);

    if (!deletedAgent) {
      return res.status(404).json({
        success: false,
        message: "Agent not found"
      });
    }

    // Remove password field before returning response
    const agentData = deletedAgent.toObject();
    delete agentData.password;

    return res.status(200).json({
      success: true,
      message: "Agent permanently deleted from database",
      data: agentData
    });
  } catch (error) {
    console.error("Delete agent error:", error);
    return res.status(500).json({
      success: false,
      message: "Server error. Unable to delete agent."
    });
  }
};

// ===== GET SINGLE AGENT (Admin Only) =====
export const getAgentById = async (req, res) => {
  try {
    const { agentId } = req.params;

    // Validate ObjectId format
    if (!mongoose.Types.ObjectId.isValid(agentId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid agent ID format"
      });
    }

    const agent = await Role.findOne({ _id: agentId, role: "agent" })
      .select("-password");

    if (!agent) {
      return res.status(404).json({
        success: false,
        message: "Agent not found"
      });
    }

    res.status(200).json({
      success: true,
      message: "Agent retrieved successfully",
      data: agent
    });
  } catch (error) {
    console.error("Get agent by ID error:", error);
    res.status(500).json({
      success: false,
      message: "Server error. Unable to retrieve agent."
    });
  }
};


// ✏️ Unified Edit Agent Profile
export const editAgentProfile = async (req, res) => {
  try {
    const { name, phoneNo, address, dob, gender } = req.body;
    let updateData = { name, phoneNo, address, dob, gender };

    if (req.file) {
      // req.file.path = "uploads/agents/file.jpg" -> we want "/agents/file.jpg"
      const relativePath = req.file.path.replace(/\\/g, "/").replace("uploads", "");
      const imagePath = relativePath.startsWith("/") ? relativePath : `/${relativePath}`;
      updateData.profileImage = imagePath;
    }

    const updated = await Role.findByIdAndUpdate(
      req.user._id,
      updateData,
      { new: true, runValidators: true }
    ).select("-password");

    if (!updated) return res.status(404).json({ success: false, message: "Profile not found" });

    res.status(200).json({ success: true, message: "Profile updated", data: updated });
  } catch (error) {
    console.error("Agent edit profile error:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
};

// 🖼️ Change Profile Image only
export const changeAgentProfileImage = async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ success: false, message: "No image uploaded" });

    // req.file.path = "uploads/agents/file.jpg" -> we want "/agents/file.jpg"
    const relativePath = req.file.path.replace(/\\/g, "/").replace("uploads", "");
    const imagePath = relativePath.startsWith("/") ? relativePath : `/${relativePath}`;
    const updated = await Role.findByIdAndUpdate(
      req.user._id,
      { profileImage: imagePath },
      { new: true, runValidators: true }
    ).select("-password");

    if (!updated) return res.status(404).json({ success: false, message: "Profile not found" });

    res.status(200).json({ success: true, message: "Profile image updated", data: updated });
  } catch (error) {
    console.error("Agent profile image error:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
};