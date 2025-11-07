import User from '../../models/User.js';
import Role from '../../models/Role.js';

// Update user 
export const updateUser = async (req, res) => {
  try {
    const { userId } = req.params;
    const updateData = req.body;


    delete updateData.password;
    delete updateData.email;

    const updatedUser = await User.findByIdAndUpdate(
      userId,
      updateData,
      { new: true, runValidators: true }
    ).select('-password');

    if (!updatedUser) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    res.status(200).json({
      success: true,
      message: 'User updated successfully',
      data: updatedUser
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message
    });
  }
};

// Block user
export const blockUser = async (req, res) => {
  try {
    const { userId } = req.params;
    const { reason } = req.body; 

    const user = await User.findByIdAndUpdate(
      userId,
      { status: 'Banned' },
      { new: true }
    ).select('-password');

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    res.status(200).json({
      success: true,
      message: 'User blocked successfully',
      data: user
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message
    });
  }
};

// Unblock user
export const unblockUser = async (req, res) => {
  try {
    const { userId } = req.params;

    const user = await User.findByIdAndUpdate(
      userId,
      { status: 'Active' },
      { new: true }
    ).select('-password');

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    res.status(200).json({
      success: true,
      message: 'User unblocked successfully',
      data: user
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message
    });
  }
};

// Delete user
export const deleteUser = async (req, res) => {
  try {
    const { userId } = req.params;

    const user = await User.findByIdAndDelete(userId);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    res.status(200).json({
      success: true,
      message: 'User deleted successfully'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message
    });
  }
};

// Get all users with filters
export const getAllUsers = async (req, res) => {
  try {
    const { status, page = 1, limit = 10 } = req.query;

    const filter = {};
    if (status) filter.status = status;

    const users = await User.find(filter)
      .select('-password')
      .limit(limit * 1)
      .skip((page - 1) * limit)
      .sort({ createdAt: -1 });

    const total = await User.countDocuments(filter);

    res.status(200).json({
      success: true,
      data: users,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message
    });
  }
};

// ✏️ Unified Edit Admin Profile
export const editAdminProfile = async (req, res) => {
  try {
    console.log("Edit profile request:", { body: req.body, file: req.file, userId: req.user._id });
    
    const { name, phoneNo, address, dob, gender } = req.body;
    let updateData = { name, phoneNo, address, dob, gender };

    if (req.file) {
      // req.file.path = "uploads/superadmins/file.jpg" -> we want "/superadmins/file.jpg"
      const relativePath = req.file.path.replace(/\\/g, "/").replace("uploads", "");
      const imagePath = relativePath.startsWith("/") ? relativePath : `/${relativePath}`;
      updateData.profileImage = imagePath;
      console.log("Adding image to update data:", imagePath);
      console.log("File details:", req.file);
    }

    console.log("Update data:", updateData);

    const updated = await Role.findByIdAndUpdate(
      req.user._id,
      updateData,
      { new: true, runValidators: true }
    ).select("-password");

    if (!updated) return res.status(404).json({ success: false, message: "Profile not found" });

    console.log("Profile updated successfully:", { id: updated._id, profileImage: updated.profileImage });
    res.status(200).json({ 
      success: true, 
      message: "Profile updated successfully", 
      data: updated 
    });
  } catch (error) {
    console.error("Admin edit profile error:", error);
    res.status(500).json({ success: false, message: "Server error", error: error.message });
  }
};

// 🖼️ Change Profile Image only
export const changeAdminProfileImage = async (req, res) => {
  try {
    console.log("Change profile image request:", { file: req.file, userId: req.user._id });
    
    if (!req.file) return res.status(400).json({ success: false, message: "No image uploaded" });

    // Fix path to be relative to uploads folder for static serving
    // req.file.path = "uploads/superadmins/file.jpg" -> we want "/superadmins/file.jpg"
    const relativePath = req.file.path.replace(/\\/g, "/").replace("uploads", "");
    const imagePath = relativePath.startsWith("/") ? relativePath : `/${relativePath}`;
    console.log("Saving image path:", imagePath);
    console.log("File details:", req.file);
    
    const updated = await Role.findByIdAndUpdate(
      req.user._id,
      { profileImage: imagePath },
      { new: true, runValidators: true }
    ).select("-password");

    if (!updated) return res.status(404).json({ success: false, message: "Profile not found" });

    console.log("Profile updated successfully:", { id: updated._id, profileImage: updated.profileImage });
    res.status(200).json({ 
      success: true, 
      message: "Profile image updated successfully", 
      data: updated 
    });
  } catch (error) {
    console.error("Admin profile image error:", error);
    res.status(500).json({ success: false, message: "Server error", error: error.message });
  }
};