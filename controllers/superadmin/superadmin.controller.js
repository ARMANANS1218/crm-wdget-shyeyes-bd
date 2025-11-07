import mongoose from "mongoose";
import Role from "../../models/Role.js";

// ===== GET ALL ADMINS (Super Admin Only) =====
export const getAllAdmins = async (req, res) => {
  try {
    const { page = 1, limit = 10, status, search } = req.query;
    const skip = (page - 1) * limit;

    // Build filter object
    const filter = { 
      role: "admin",
      status: { $ne: "Deleted" } 
    };
    
    if (status && status !== "all") {
      if (status === "Deleted") {
        filter.status = "Deleted"; 
      } else {
        filter.status = status;
      }
    }
    
    if (search) {
      filter.$or = [
        { name: { $regex: search, $options: "i" } },
        { email: { $regex: search, $options: "i" } }
      ];
    }

    // Get admins with pagination
    const admins = await Role.find(filter)
      .select("-password")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    // Get total count for pagination
    const totalAdmins = await Role.countDocuments(filter);
    const totalPages = Math.ceil(totalAdmins / limit);

    res.status(200).json({
      success: true,
      message: "Admins retrieved successfully",
      data: {
        admins,
        pagination: {
          currentPage: parseInt(page),
          totalPages,
          totalAdmins,
          hasNext: page < totalPages,
          hasPrev: page > 1
        }
      }
    });
  } catch (error) {
    console.error("Get all admins error:", error);
    res.status(500).json({
      success: false,
      message: "Server error. Unable to retrieve admins."
    });
  }
};

// ===== GET SINGLE ADMIN (Super Admin Only) =====
export const getAdminById = async (req, res) => {
  try {
    const { adminId } = req.params;

    // Validate ObjectId format
    if (!mongoose.Types.ObjectId.isValid(adminId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid admin ID format"
      });
    }

    const admin = await Role.findOne({ _id: adminId, role: "admin" })
      .select("-password");

    if (!admin) {
      return res.status(404).json({
        success: false,
        message: "Admin not found"
      });
    }

    res.status(200).json({
      success: true,
      message: "Admin retrieved successfully",
      data: admin
    });
  } catch (error) {
    console.error("Get admin by ID error:", error);
    res.status(500).json({
      success: false,
      message: "Server error. Unable to retrieve admin."
    });
  }
};

// ===== UPDATE ADMIN (Super Admin Only) =====
export const updateAdmin = async (req, res) => {
  try {
    const { adminId } = req.params;
    const updateData = req.body;

    // Remove sensitive fields that shouldn't be updated directly
    delete updateData.role;
    delete updateData.password;
    delete updateData._id;

    // Validate ObjectId format
    if (!mongoose.Types.ObjectId.isValid(adminId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid admin ID format"
      });
    }

    // Check if admin exists
    const admin = await Role.findOne({ _id: adminId, role: "admin" });
    if (!admin) {
      return res.status(404).json({
        success: false,
        message: "Admin not found"
      });
    }

    // Check if email is being updated and if it's already taken
    if (updateData.email && updateData.email !== admin.email) {
      const existingUser = await Role.findOne({ 
        email: updateData.email.toLowerCase(),
        _id: { $ne: adminId }
      });
      if (existingUser) {
        return res.status(409).json({
          success: false,
          message: "Email already exists"
        });
      }
      updateData.email = updateData.email.toLowerCase();
    }

    // Update admin
    const updatedAdmin = await Role.findByIdAndUpdate(
      adminId,
      updateData,
      { new: true, runValidators: true }
    ).select("-password");

    res.status(200).json({
      success: true,
      message: "Admin updated successfully",
      data: updatedAdmin
    });
  } catch (error) {
    console.error("Update admin error:", error);
    res.status(500).json({
      success: false,
      message: "Server error. Unable to update admin."
    });
  }
};

// ===== BAN ADMIN (Super Admin Only) =====
export const banAdmin = async (req, res) => {
  try {
    const { adminId } = req.params;
    const { reason } = req.body || {}; // Handle undefined req.body

    console.log("Ban admin request:", { 
      adminId, 
      reason, 
      userRole: req.user?.role,
      bodyReceived: req.body,
      contentType: req.headers['content-type']
    });

    // Validate ObjectId format
    if (!mongoose.Types.ObjectId.isValid(adminId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid admin ID format"
      });
    }

    // Check if admin exists
    const admin = await Role.findOne({ _id: adminId, role: "admin" });
    console.log("Found admin:", admin ? { id: admin._id, name: admin.name, status: admin.status } : "Not found");
    
    if (!admin) {
      return res.status(404).json({
        success: false,
        message: "Admin not found"
      });
    }

    // Check if admin is already banned
    if (admin.status === "Banned") {
      return res.status(400).json({
        success: false,
        message: "Admin is already banned"
      });
    }

    // Prevent super admin from banning themselves
    if (adminId === req.user._id.toString()) {
      return res.status(400).json({
        success: false,
        message: "Cannot ban your own account"
      });
    }

    const updateData = {
      status: "Banned",
      blockReason: reason || "Banned by super admin",
      blockedAt: new Date(),
      blockedBy: req.user._id
    };

    console.log("Attempting to ban admin with data:", updateData);

    // Ban the admin
    const bannedAdmin = await Role.findByIdAndUpdate(
      adminId,
      updateData,
      { new: true, runValidators: true }
    ).select("-password");

    console.log("Ban result:", bannedAdmin ? "Success" : "Failed");

    res.status(200).json({
      success: true,
      message: "Admin banned successfully",
      data: bannedAdmin
    });
  } catch (error) {
    console.error("Ban admin error:", error);
    res.status(500).json({
      success: false,
      message: "Server error. Unable to ban admin.",
      error: process.env.NODE_ENV === "development" ? error.message : undefined
    });
  }
};

// ===== UNBAN ADMIN (Super Admin Only) =====
export const unbanAdmin = async (req, res) => {
  try {
    const { adminId } = req.params;

    // Validate ObjectId format
    if (!mongoose.Types.ObjectId.isValid(adminId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid admin ID format"
      });
    }

    // Check if admin exists
    const admin = await Role.findOne({ _id: adminId, role: "admin" });
    if (!admin) {
      return res.status(404).json({
        success: false,
        message: "Admin not found"
      });
    }

    // Check if admin is actually banned
    if (admin.status !== "Banned") {
      return res.status(400).json({
        success: false,
        message: "Admin is not banned"
      });
    }

    // Unban the admin
    const unbannedAdmin = await Role.findByIdAndUpdate(
      adminId,
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
      message: "Admin unbanned successfully",
      data: unbannedAdmin
    });
  } catch (error) {
    console.error("Unban admin error:", error);
    res.status(500).json({
      success: false,
      message: "Server error. Unable to unban admin."
    });
  }
};

// ===== DELETE ADMIN (Super Admin Only) =====
export const deleteAdmin = async (req, res) => {
  try {
    const { adminId } = req.params;
    const { confirmDelete } = req.body;

    // Require confirmation for deletion
    if (!confirmDelete) {
      return res.status(400).json({
        success: false,
        message: "Please confirm deletion by setting confirmDelete to true"
      });
    }

    // Validate ObjectId format
    if (!mongoose.Types.ObjectId.isValid(adminId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid admin ID format"
      });
    }

    // Check if admin exists
    const admin = await Role.findOne({ _id: adminId, role: "admin" });
    if (!admin) {
      return res.status(404).json({
        success: false,
        message: "Admin not found"
      });
    }

    // Check if admin is already deleted
    if (admin.status === "Deleted") {
      return res.status(400).json({
        success: false,
        message: "Admin is already deleted"
      });
    }

    // Prevent super admin from deleting themselves
    if (adminId === req.user._id.toString()) {
      return res.status(400).json({
        success: false,
        message: "Cannot delete your own account"
      });
    }

    // Soft delete - mark as deleted instead of removing from database
    const deletedAdmin = await Role.findByIdAndUpdate(
      adminId,
      { 
        status: "Deleted",
        deletedAt: new Date(),
        deletedBy: req.user._id,
        email: `deleted_${Date.now()}_${admin.email}` // Prevent email conflicts
      },
      { new: true }
    ).select("-password");

    res.status(200).json({
      success: true,
      message: "Admin deleted successfully",
      data: deletedAdmin
    });
  } catch (error) {
    console.error("Delete admin error:", error);
    res.status(500).json({
      success: false,
      message: "Server error. Unable to delete admin."
    });
  }
};

// Edit SuperAdmin Profile (details + optional image)
export const editSuperAdminProfile = async (req, res) => {
  try {
    const { name, phoneNo, address, dob, gender } = req.body;
    let updateData = { name, phoneNo, address, dob, gender };

    if (req.file) {
      // req.file.path = "uploads/superadmins/file.jpg" -> we want "/superadmins/file.jpg"
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
    console.error("SuperAdmin edit profile error:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
};


// 🖼️ Change Profile Image only
export const changeSuperAdminProfileImage = async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ success: false, message: "No image uploaded" });

    // req.file.path = "uploads/superadmins/file.jpg" -> we want "/superadmins/file.jpg"
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
    console.error("SuperAdmin profile image error:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
};