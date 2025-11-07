import crypto from "crypto";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import User from "../models/User.js";

import { pendingUsers } from "../utils/pendingStore.js";
import { generateOtp } from "../utils/gerateOtp.js";
import multer from "multer";
import { getFriendshipAggregationStages } from "../utils/friendshipAggregation.js";
import mongoose from "mongoose";
import Notification from "../models/Notification.js";
import fs from "fs/promises";
import { sendMail } from "../utils/mailSender.js";
import cloudinary from "../config/cloudinary.js";
import { resolveMediaUrl } from "../utils/imageUrl.js";

// Normalize gender inputs to match schema enum
const normalizeGender = (g) => {
  const s = (g || "").toString().trim().toLowerCase();
  if (s === "male") return "Male";
  if (s === "female") return "Female";
  if (s === "others" || s === "other" || s === "transgender") return "Others";
  return undefined;
};

// Public API: Get new active members
export const getNewActiveMembers = async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 10; 
    const sortOrder = req.query.sort === "asc" ? 1 : -1;

    let users;
    try {
      users = await User.aggregate([
        { $match: { status: "Active" } },
        { $sort: { createdAt: sortOrder } },
        { $limit: limit },
        {
          $project: {
            _id: 1,
            name: { $concat: ["$Name.firstName", " ", "$Name.lastName"] },
            age: 1,
            profilePic: {
              $cond: [
                { $ifNull: ["$profilePic", false] },
                { $concat: [process.env.BASE_URL, "/uploads/", "$profilePic"] },
                null
              ]
            },
            location: {
              city: { $ifNull: ["$location.city", ""] },
              country: { $ifNull: ["$location.country", ""] }
            }
          }
        }
      ]);
    } catch (dbError) {
      console.error("DB error in getNewActiveMembers:", dbError);
      return res.status(500).json({
        success: false,
        message: "Failed to fetch new members",
        data: {}
      });
    }

    return res.status(200).json({
      success: true,
      message: "New active members fetched successfully",
      data: { users, count: users.length }
    });
  } catch (error) {
    console.error("Unexpected error in getNewActiveMembers:", error);
    return res.status(500).json({
      success: false,
      message: "Server error",
      data: {}
    });
  }
};

// Protected API: Get all active users
export const getAllActiveUsers = async (req, res) => {
  try {
    const loginUserId = req.user.id;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 50;

    let loginUser, users;

    try {
      loginUser = await User.findById(loginUserId).select("friends");
    } catch (err) {
      console.error("DB error fetching login user:", err);
      return res.status(500).json({
        success: false,
        message: "Failed to fetch user data",
        data: {}
      });
    }

    const loginUserFriends = loginUser?.friends || [];

    try {
      users = await User.aggregate([
        { $match: { status: "Active", _id: { $ne: new mongoose.Types.ObjectId(loginUserId) } } },
        ...getFriendshipAggregationStages(loginUserId, page, limit).map(stage => {
          if (stage.$addFields && stage.$addFields.mutualFriendsCount) {
            stage.$addFields.mutualFriendsCount = {
              $size: {
                $setIntersection: [
                  { $ifNull: ["$friends", []] },
                  loginUserFriends
                ]
              }
            };
          }
          return stage;
        })
      ]);
    } catch (err) {
      console.error("DB error fetching active users:", err);
      return res.status(500).json({
        success: false,
        message: "Failed to fetch active users",
        data: {}
      });
    }

    // Normalize media URLs for Flutter/Web
    const normalized = (users || []).map(u => ({
      ...u,
      profilePic: resolveMediaUrl(u.profilePic),
      photos: Array.isArray(u.photos) ? u.photos.map(p => resolveMediaUrl(p)) : u.photos,
      friendsList: Array.isArray(u.friendsList)
        ? u.friendsList.map(f => ({ ...f, profilePic: resolveMediaUrl(f.profilePic) }))
        : u.friendsList,
    }));

    return res.status(200).json({
      success: true,
      message: "Active users fetched successfully",
      data: { users: normalized, page, limit, count: normalized.length }
    });
  } catch (error) {
    console.error("Unexpected error in getAllActiveUsers:", error);
    return res.status(500).json({
      success: false,
      message: "Server error",
      data: {}
    });
  }
};




export const verifyOtp = async (req, res) => {
  try {
    const { email, otp } = req.body;
    if (!email || !otp)
      return res.status(400).json({ message: "Email & OTP required" });

    const pending = pendingUsers[email];
    if (!pending)
      return res.status(400).json({ message: "No pending registration" });

    if (Date.now() > pending.otpExpires) {
      delete pendingUsers[email];
      return res.status(400).json({ message: "OTP expired" });
    }

    // ✅ String-safe OTP comparison
    if (pending.otp.toString() !== otp.toString()) {
      return res.status(400).json({ message: "Invalid OTP" });
    }

    pending.emailVerified = true;
    delete pending.otp;
    delete pending.otpExpires;

    const tempToken = jwt.sign(
      { pendingEmail: email },
      process.env.JWT_SECRET,
      { expiresIn: "15m" }
    );

    res.status(200).json({ message: "OTP verified", tempToken });
  } catch (err) {
    console.error("verifyOtp error:", err);
    res.status(500).json({ message: "Server error" });
  }
};






export const registerStep1 = async (req, res) => {
  try {
    console.log('🚀 registerStep1 called with:', { 
      body: req.body, 
      env: process.env.NODE_ENV,
      emailUser: process.env.EMAIL_USER,
      hasEmailPass: !!process.env.EMAIL_PASS
    });

    const { firstName, lastName, email, password, phoneNo } = req.body;

    // ✅ 1. Validate fields
    if (!firstName || !email || !password) {
      console.log('❌ Validation failed:', { firstName: !!firstName, email: !!email, password: !!password });
      return res.status(400).json({ success: false, message: "Missing required fields" });
    }

    // ✅ 2. Check if user already exists
    let existingUser;
    try {
      existingUser = await User.findOne({ email });
      console.log('✅ User existence check completed:', { email, exists: !!existingUser });
    } catch (dbError) {
      console.error('❌ Database error checking user:', dbError);
      return res.status(500).json({ success: false, message: "Database connection error" });
    }

    if (existingUser) {
      console.log('❌ User already exists:', email);
      return res.status(409).json({ success: false, message: "Email already registered" });
    }

    // ✅ 3. Generate OTP and expiry
    const otp = generateOtp();
    const otpExpires = Date.now() + 5 * 60 * 1000; // 5 mins expiry
    console.log('✅ OTP generated:', { email, otp, otpExpires });

    // ✅ 4. Store user temporarily before verification
    try {
      const hashedPassword = await bcrypt.hash(password, 10);
      pendingUsers[email] = {
        firstName,
        lastName,
        email,
        password: hashedPassword,
        phoneNo,
        otp,
        otpExpires,
        emailVerified: false,
      };
      console.log('✅ User stored in pending:', email);
    } catch (hashError) {
      console.error('❌ Password hashing error:', hashError);
      return res.status(500).json({ success: false, message: "Password processing error" });
    }

    // ✅ 5. Send OTP Email
    console.log('📧 Attempting to send OTP email to:', email);
    
    try {
      const mailResult = await sendMail(
        email,
        "Your OTP for ShyEyes",
        `
        <div style="font-family: Arial; color: #333;">
          <h2>Welcome to ShyEyes 👁️</h2>
          <p>Your OTP is <strong style="font-size:18px;">${otp}</strong>.</p>
          <p>This OTP will expire in <b>5 minutes</b>.</p>
          <br/>
          <small>Do not share this OTP with anyone.</small>
        </div>
        `
      );

      console.log('📧 Email send result:', mailResult);

      // Handle mock/development mode
      if (mailResult.service === 'mock') {
        console.log('🔧 DEVELOPMENT MODE - OTP for testing:', otp);
      }

      if (!mailResult.success) {
        console.error('❌ Email sending failed:', mailResult.error);
        
        // Special handling for SendGrid verification issues
        if (mailResult.needsVerification) {
          console.log('🚨 SendGrid verification required. Enabling development mode bypass...');
          console.log('🔧 Use this OTP for testing:', otp);
          
          return res.status(201).json({
            success: true,
            message: "Registration successful. SendGrid email verification required - using fallback mode.",
            email,
            note: "Please verify your sender email in SendGrid dashboard for production use.",
            developmentOTP: process.env.NODE_ENV === 'development' ? otp : undefined
          });
        }
        
        // In development or when all email services fail, still allow registration to continue for testing
        if (process.env.NODE_ENV === 'development') {
          console.log('🔧 Development mode: Allowing registration despite email failure');
          console.log('🔧 Use this OTP for testing:', otp);
          
          return res.status(201).json({
            success: true,
            message: "Registration successful. Check console for OTP (development mode).",
            email,
            developmentOTP: otp // Only in development
          });
        }
        
        return res.status(500).json({ 
          success: false, 
          message: "Failed to send OTP email. Please check your email address and try again.",
          details: process.env.NODE_ENV === 'development' ? mailResult.error : undefined
        });
      }

      console.log('✅ Email sent successfully to:', email);
    } catch (emailError) {
      console.error('❌ Email sending exception:', emailError);
      
      // In development, still allow registration to continue for testing
      if (process.env.NODE_ENV === 'development') {
        console.log('🔧 Development mode: Allowing registration despite email failure');
        console.log('🔧 Use this OTP for testing:', otp);
        
        return res.status(201).json({
          success: true,
          message: "Registration successful. Check console for OTP (development mode).",
          email,
          developmentOTP: otp // Only in development
        });
      }
      
      return res.status(500).json({ 
        success: false, 
        message: "Email service temporarily unavailable. Please try again later.",
        details: process.env.NODE_ENV === 'development' ? emailError.message : undefined
      });
    }

    // ✅ 6. Success Response
    console.log('✅ registerStep1 completed successfully for:', email);
    res.status(201).json({
      success: true,
      message: "OTP sent successfully to your email.",
      email, // optionally send for reference
    });

  } catch (error) {
    console.error("❌ registerStep1 error:", error.message);
    console.error("❌ Full error:", error);
    res.status(500).json({ 
      success: false, 
      message: "Internal Server Error",
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};



export const registerStep2 = async (req, res) => {
  try {
    // Determine profile picture from Cloudinary upload or direct URL
    let profilePic = null;
    if (req.file) {
      // With CloudinaryStorage, `path` is the full CDN URL, `filename` is public_id
      profilePic = req.file.path || req.file.filename;
    } else if (req.body.profilePic) {
      // If a URL was provided in body, store it as-is (supports future direct-upload flows)
      profilePic = req.body.profilePic;
    }

    const { email, dob, age, gender, bio, hobbies, location } = req.body;
  const normalizedGender = normalizeGender(gender);
    
    if (!email) return res.status(400).json({ message: "Email is required" });
    
    // Enforce profile picture requirement at registration
    if (!profilePic) {
      return res.status(400).json({ success: false, message: "Profile picture is required" });
    }

    const pending = pendingUsers[email];
    if (!pending) return res.status(400).json({ message: "No saved basic info found" });
    
    const newUser = new User({
      Name: { firstName: pending.firstName, lastName: pending.lastName },
      email: pending.email,
      phoneNo: pending.phoneNo,
      password: pending.password, // already hashed
      dob: dob || null,
      age: age || null,
      gender: normalizedGender || null,
      bio: bio || null,
      hobbies: hobbies ? hobbies.split(",").map(h => h.trim()) : [],
      location: location ? (typeof location === "string" ? JSON.parse(location) : location) : {},
      photos: [profilePic],
      profilePic,
      emailVerified: true,
    });
    
    await newUser.save();
    delete pendingUsers[email];
    
    // Issue JWT token
    const token = jwt.sign({ id: newUser._id }, process.env.JWT_SECRET, { expiresIn: "7d" });
    
    res.status(201).json({ success: true, message: "Registration complete", user: newUser, token });
    
  } catch (err) {
    console.error("registerStep2 error:", err.message);
    res.status(500).json({ success: false, message: "Server error", error: err.message });
  }
};

export const loginUser = async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password)
      return res.status(400).json({ success: false, message: "Email and password are required", data: {} });

    let user;
    try {
      user = await User.findOne({ email }).select("+password");
    } catch (err) {
      console.error("DB error loginUser:", err);
      return res.status(500).json({ success: false, message: "Failed to fetch user", data: {} });
    }

    // Check if user account exists (deleted accounts won't be found)
    if (!user) {
      return res.status(403).json({ 
        success: false, 
        message: "Your account has been deleted or does not exist", 
        data: {},
        accountStatus: "deleted"
      });
    }

    // Check if user account is banned/suspended
    if (user.status === "Banned") {
      return res.status(403).json({ 
        success: false, 
        message: "Your account is suspended", 
        data: {},
        accountStatus: "banned"
      });
    }

    // Check if user account is inactive
    if (user.status === "Inactive") {
      return res.status(403).json({ 
        success: false, 
        message: "Your account is inactive. Please contact support", 
        data: {},
        accountStatus: "inactive"
      });
    }

    if (!user.emailVerified)
      return res.status(401).json({ success: false, message: "Please verify your email first", data: {} });

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) return res.status(401).json({ success: false, message: "Incorrect password", data: {} });

    const token = jwt.sign({ id: user._id, email: user.email }, process.env.JWT_SECRET, { expiresIn: "7d" });
    const profilePicFilename = user.profilePic || user.photos?.[0] || null;
    const profilePicUrl = resolveMediaUrl(profilePicFilename);
    return res.status(200).json({
      success: true,
      message: "Login successful",
       token,
      data: { user: { id: user._id, name: `${user.Name.firstName} ${user.Name.lastName}`, profilePic: profilePicUrl } }
    });
  } catch (error) {
    console.error("Unexpected loginUser error:", error);
    return res.status(500).json({ success: false, message: "Server error", data: {} });
  }
};
// ================== Forgot Password ==================
let otpStore = {};

// ================== Forgot Password - Send OTP ==================
export const forgotPassword = async (req, res) => {
  try {
    const { email } = req.body;
    console.log("📧 User forgot password request for:", email);
    
    if (!email) return res.status(400).json({ success: false, message: "Email required" });

    const user = await User.findOne({ email });
    if (!user) return res.status(404).json({ success: false, message: "User not found" });

    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    console.log("🔢 Generated OTP:", otp, "for user:", email);

    // store OTP in memory
    otpStore[email] = { otp, expires: Date.now() + 5 * 60 * 1000, verified: false };

    // send OTP via email with better formatting
    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #333;">Password Reset OTP</h2>
        <p>Your OTP for password reset is:</p>
        <div style="background: #f0f0f0; padding: 20px; text-align: center; font-size: 24px; font-weight: bold; margin: 20px 0;">
          ${otp}
        </div>
        <p style="color: #666;">This OTP expires in 5 minutes.</p>
        <p style="color: #666;">If you didn't request this, please ignore this email.</p>
      </div>
    `;
    
    const mailResult = await sendMail(email, "Password Reset OTP - ShyEyes", html);
    
    if (!mailResult.success) {
      console.error("❌ Failed to send email:", mailResult.error);
      return res.status(500).json({ 
        success: false, 
        message: "Failed to send OTP email. Please try again." 
      });
    }

    console.log("✅ OTP email sent successfully to:", email);
    res.status(200).json({ success: true, message: "OTP sent to your email successfully" });
  } catch (err) {
    console.error("❌ forgotPassword error:", err);
    res.status(500).json({ success: false, message: "Server error. Please try again." });
  }
};

// ================== Verify OTP ==================

export const verifyForgotOtp = (req, res) => {
  try {
    const { email, otp } = req.body;
    if (!email || !otp) return res.status(400).json({ success: false, message: "Email and OTP required" });

    const record = otpStore[email];
    if (!record) return res.status(400).json({ success: false, message: "No OTP request found for this email" });
    if (Date.now() > record.expires) {
      delete otpStore[email];
      return res.status(400).json({ success: false, message: "OTP expired" });
    }

    // ✅ String-safe OTP comparison
    if (record.otp.toString() !== otp.toString()) {
      return res.status(400).json({ success: false, message: "Invalid OTP" });
    }

    // mark verified
    otpStore[email].verified = true;

    res.status(200).json({ success: true, message: "OTP verified successfully" });
  } catch (err) {
    console.error("verifyForgotOtp error:", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
};

// ================== Reset Password ==================
export const resetPassword = async (req, res) => {
  try {
    const { email, newPassword, confirmPassword } = req.body;
    
    if (!email || !newPassword || !confirmPassword) {
      return res.status(400).json({ success: false, message: "Email, new password and confirm password required" });
    }

    if (newPassword !== confirmPassword) {
      return res.status(400).json({ success: false, message: "Passwords do not match" });
    }

    // Check if OTP was verified for this email
    const record = otpStore[email];
    if (!record || !record.verified) {
      return res.status(400).json({ success: false, message: "OTP verification required before reset" });
    }

    // Check if user exists
    const user = await User.findOne({ email });
    if (!user) {
      return res.status(404).json({ success: false, message: "User not found" });
    }

    const hashedPassword = await bcrypt.hash(newPassword, 10);
    await User.findOneAndUpdate({ email }, { password: hashedPassword });

    // clear OTP store
    delete otpStore[email];

    res.status(200).json({ success: true, message: "Password reset successful. Please login with your new password." });
  } catch (err) {
    console.error("resetPassword error:", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
};

// ------------------------ Get User Profile ------------------------
export const getUserProfile = async (req, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ success: false, message: "Unauthorized: No user ID", data: {} });

    let user;
    try {
      user = await User.findById(userId).select("-password");
    } catch (dbErr) {
      console.error("DB error in getUserProfile:", dbErr);
      return res.status(500).json({ success: false, message: "Failed to fetch user", data: {} });
    }

    if (!user) return res.status(404).json({ success: false, message: "User not found", data: {} });

    const u = user.toObject();
    u.profilePic = resolveMediaUrl(u.profilePic);
    if (Array.isArray(u.photos)) {
      u.photos = u.photos.map(p => resolveMediaUrl(p));
    }

    return res.status(200).json({ success: true, message: "User profile fetched successfully", data: { user: u } });
  } catch (err) {
    console.error("Unexpected getUserProfile error:", err);
    return res.status(500).json({ success: false, message: "Server error", data: {} });
  }
};


// ------------------------ Update User Profile ------------------------
export const updateUserProfile = async (req, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ success: false, message: "Unauthorized: No user ID", data: {} });

    // Handle Cloudinary file upload properly
    let profilePic = null;
    if (req.file) {
      // For Cloudinary uploads, use the full path
      profilePic = req.file.path || req.file.filename;
    }

  const { firstName, lastName, dob, age, gender, street, city, state, country, postalCode, bio, hobbies, status } = req.body;
  const normalizedUpdateGender = normalizeGender(gender);

    const updatedData = {
      ...(firstName || lastName ? { Name: { firstName, lastName } } : {}),
      ...(dob && { dob }),
      ...(age && { age }),
  ...(normalizedUpdateGender ? { gender: normalizedUpdateGender } : {}),
      ...(street || city || state || country || postalCode ? { location: { street, city, state, country, postalCode } } : {}),
      ...(bio && { bio }),
      ...(status && { status }),
      ...(hobbies ? { hobbies: Array.isArray(hobbies) ? hobbies : hobbies.split(",").map(h => h.trim()) } : {}),
      ...(profilePic && { profilePic }),
      updatedAt: Date.now(),
    };

    const updateQuery = profilePic ? { $set: updatedData, $push: { photos: profilePic } } : { $set: updatedData };

    let user;
    try {
      user = await User.findByIdAndUpdate(userId, updateQuery, { new: true }).select("-password -__v");
    } catch (dbErr) {
      console.error("DB error in updateUserProfile:", dbErr);
      return res.status(500).json({ success: false, message: "Failed to update profile", data: {} });
    }

    if (!user) return res.status(404).json({ success: false, message: "User not found", data: {} });

    return res.status(200).json({ success: true, message: "Profile updated successfully", data: { user } });
  } catch (err) {
    console.error("Unexpected updateUserProfile error:", err);
    return res.status(500).json({ success: false, message: "Server error", data: {} });
  }
};



// get all active users (excluding logged-in user)
// export const getAllActiveUsers = async (req, res) => {
//   try {
//     const loginUserId = req.user.id;
//     const page = parseInt(req.query.page) || 1;
//     const limit = parseInt(req.query.limit) || 50;

//     // Fetch login user's friends for mutual friends calculation
//     const loginUser = await User.findById(loginUserId).select("friends");
//     const loginUserFriends = loginUser?.friends || [];

//     // Run aggregation
//     const users = await User.aggregate([
//       { $match: { status: "Active", _id: { $ne: new mongoose.Types.ObjectId(loginUserId) } } },

//       // Friendship and mutual friends aggregation
//       ...getFriendshipAggregationStages(loginUserId, page, limit).map(stage => {
//         // Replace mutualFriendsCount placeholder with actual loginUserFriends
//         if (stage.$addFields && stage.$addFields.mutualFriendsCount) {
//           stage.$addFields.mutualFriendsCount = {
//             $size: {
//               $setIntersection: [
//                 { $ifNull: ["$friends", []] },
//                 loginUserFriends
//               ]
//             }
//           };
//         }
//         return stage;
//       })
//     ]);

//     res.status(200).json({
//       message: "Active users fetched successfully",
//       users,
//       page,
//       limit,
//       count: users.length
//     });
//   } catch (error) {
//     console.error("❌ getAllActiveUsers error:", error);
//     res.status(500).json({ message: "Server error", error: error.message });
//   }
// };

// get matches for a user (male ko female and vice versa)
// export const getMatches = async (req, res) => {
//   try {
//     const userId = req.user.id;
//     const page = parseInt(req.query.page) || 1;
//     const limit = parseInt(req.query.limit) || 20;

//     const user = await User.findById(userId);
//     if (!user) return res.status(404).json({ message: "User not found" });

//     const targetGender = user.gender === "Male" ? "Female" : "Male";

//     const matches = await User.aggregate([
//       {
//         $match: {
//           gender: targetGender,
//           status: "Active",
//           _id: { $ne: user._id },
//         },
//       },
//       {
//         $project: {
//           _id: 1,
//           name: { $concat: ["$Name.firstName", " ", "$Name.lastName"] },
//           age: 1,
//           profilePic: 1,
//           location: 1,
//           bio: 1,
//           hobbies: 1,
//         },
//       },
//       { $skip: (page - 1) * limit },
//       { $limit: limit },
//     ]);

//     res.status(200).json({
//       message: "Matches fetched successfully",
//       matches,
//       page,
//       limit,
//       count: matches.length,
//     });
//   } catch (error) {
//     console.error("❌ getMatches error:", error);
//     res.status(500).json({ message: "Server error", error: error.message });
//   }
// };


// export const getMatches = async (req, res) => {
//   try {
//     const userId = new mongoose.Types.ObjectId(req.user.id);
//     const page = parseInt(req.query.page) || 1;
//     const limit = parseInt(req.query.limit) || 20;
 
//     const user = await User.findById(userId);
//     if (!user) return res.status(404).json({ message: "User not found" });
 
//     const targetGender = user.gender === "Male" ? "Female" : "Male";
 
//     const matches = await User.aggregate([
//       {
//         $match: {
//           gender: targetGender,
//           status: "Active",
//           _id: { $ne: userId },
//         },
//       },
//       // 🔹 Lookup friendship status
//       {
//         $lookup: {
//           from: "friendships",
//           let: { targetUserId: "$_id" },
//           pipeline: [
//             {
//               $match: {
//                 $expr: {
//                   $or: [
//                     { $and: [{ $eq: ["$user1", userId] }, { $eq: ["$user2", "$$targetUserId"] }] },
//                     { $and: [{ $eq: ["$user2", userId] }, { $eq: ["$user1", "$$targetUserId"] }] }
//                   ]
//                 }
//               }
//             },
//             { $project: { status: 1 } }
//           ],
//           as: "friendship"
//         }
//       },
//       {
//         $addFields: {
//           relationshipStatus: {
//             $cond: [
//               { $gt: [{ $size: "$friendship" }, 0] },
//               { $arrayElemAt: ["$friendship.status", 0] },
//               "None" // No relationship
//             ]
//           }
//         }
//       },
//       {
//         $project: {
//           _id: 1,
//           name: { $concat: ["$Name.firstName", " ", "$Name.lastName"] },
//           age: 1,
//           profilePic: 1,
//           location: 1,
//           bio: 1,
//           hobbies: 1,
//           relationshipStatus: 1
//         }
//       },
//       { $skip: (page - 1) * limit },
//       { $limit: limit }
//     ]);
 
//     res.status(200).json({
//       message: "Matches fetched successfully",
//       matches,
//       page,
//       limit,
//       count: matches.length,
//     });
//   } catch (error) {
//     console.error("❌ getMatches error:", error);
//     res.status(500).json({ message: "Server error", error: error.message });
//   }
// };



export const getMatches = async (req, res) => {
  try {
    const userId = new mongoose.Types.ObjectId(req.user.id);
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;

    // Fetch login user friends (for mutual friends)
    // Also select gender to determine target matches
    const loginUser = await User.findById(userId).select("friends gender");
    if (!loginUser) return res.status(404).json({ message: "User not found" });
    const loginUserFriends = loginUser.friends || [];

    // Determine target gender logic
    // - If user is Male -> show Female
    // - If user is Female -> show Male
    // - If user is Others/other/unknown -> show all (no gender filter)
    const userGender = (loginUser.gender || "").toLowerCase();
    const matchStage = {
      $match: {
        _id: { $ne: userId },
        status: "Active"
      }
    };
    if (userGender === "male") {
      matchStage.$match.gender = "Female";
    } else if (userGender === "female") {
      matchStage.$match.gender = "Male";
    } // else Others/unknown => no gender filter

    // Aggregate matches
    const matches = await User.aggregate([
      matchStage,
      ...getFriendshipAggregationStages(userId, page, limit).map(stage => {
        // Inject login user's friends for mutualFriendsCount
        if (stage.$addFields && stage.$addFields.mutualFriendsCount) {
          stage.$addFields.mutualFriendsCount = {
            $size: {
              $setIntersection: ["$friendsList._id", loginUserFriends]
            }
          };
        }
        // Limit friendsList to 10 for optimization
        if (stage.$addFields && stage.$addFields.friendsList) {
          stage.$addFields.friendsList = { $slice: ["$friendsList", 10] };
        }
        return stage;
      })
    ]);

    const normalized = (matches || []).map(m => ({
      ...m,
      profilePic: resolveMediaUrl(m.profilePic),
      photos: Array.isArray(m.photos) ? m.photos.map(p => resolveMediaUrl(p)) : m.photos,
      friendsList: Array.isArray(m.friendsList)
        ? m.friendsList.map(f => ({ ...f, profilePic: resolveMediaUrl(f.profilePic) }))
        : m.friendsList,
    }));

    res.status(200).json({
      success: true,
      message: "Matches fetched successfully",
      data: {
        matches: normalized,
        page,
        limit,
        count: normalized.length
      }
    });

  } catch (error) {
    console.error("❌ getMatches error:", error);
    res.status(500).json({ success: false, message: "Server error", error: error.message });
  }
};


// ✅ Get all photos of logged-in user
export const getPhotos = async (req, res) => {
  try {
    const userId = req.user.id;

    const user = await User.findById(userId).select("photos profilePic");
    if (!user) return res.status(404).json({ message: "User not found" });

    res.status(200).json({
      photos: user.photos,
    });
  } catch (err) {
    res.status(500).json({ message: "Server error", error: err.message });
  }
};

// configure multer (store files in uploads/ folder)
// const storage = multer.diskStorage({
//   destination: (req, file, cb) => {
//     cb(null, "uploads/photos");
//   },
//   filename: (req, file, cb) => {
//     cb(null, Date.now() + "-" + file.originalname);
//   },
// });
// const upload = multer({ storage });

// // 📌 API to upload photo(s)
// export const uploadPhotos = async (req, res) => {
//   try {
//     const userId = req.user.id;
//     const photoPaths = req.files?.map((file) => file.filename); // file names only

//     const user = await User.findByIdAndUpdate(
//       userId,
//       { $push: { photos: { $each: photoPaths } } }, // append multiple
//       { new: true }
//     );

//     res.status(200).json({
//       message: "Photos uploaded successfully",
//       photos: user.photos,
//     });
//   } catch (err) {
//     res.status(500).json({ message: "Upload failed", error: err.message });
//   }
// };


export const uploadPhotos = async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ message: "User not found" });
 
    let uploadedPhotos = [];
 
    if (req.files && req.files.length > 0) {
      for (const file of req.files) {
        // Store full secure URL for consistency across clients
        const url = file.path || file.secure_url || file.url;
        if (url) uploadedPhotos.push(url);
      }
 
      // Append new photos to existing array
      user.photos = [...user.photos, ...uploadedPhotos];
      await user.save();
    }
 
    res.status(200).json({
      message: "Photos uploaded successfully",
      photos: user.photos,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Something went wrong", error: error.message });
  }
};



// 📌 API to set profile picture from uploaded photos

export const setProfilePic = async (req, res) => {
  try {
    const userId = req.user.id;
    const { photo } = req.body; // photo filename from photos array

    const user = await User.findById(userId);

    if (!user) return res.status(404).json({ message: "User not found" });

    // check if photo exists in user's photos array
    if (!user.photos.includes(photo)) {
      return res.status(400).json({ message: "Photo not found in user's gallery" });
    }

    user.profilePic = photo;
    await user.save();

    res.status(200).json({
      message: "Profile picture updated",
      profilePic: user.profilePic,
    });
  } catch (err) {
    res.status(500).json({ message: "Server error", error: err.message });
  }
};




// 📌 API to set cover picture from uploaded photos
export const setCoverPic = async (req, res) => {
  try {
    const userId = req.user.id;
    const { photo } = req.body; // photo filename from photos array
 
    const user = await User.findById(userId);
 
    if (!user) return res.status(404).json({ message: "User not found" });
 
    // check if photo exists in user's photos array
    if (!user.photos.includes(photo)) {
      return res.status(400).json({ message: "Photo not found in user's gallery" });
    }
 
    user.coverPic = photo;
    await user.save();
 
    res.status(200).json({
      message: "Cover picture updated",
      coverPic: user.coverPic,
    });
  } catch (err) {
    res.status(500).json({ message: "Server error", error: err.message });
  }
};


// delete photo
// export const deletePhoto = async (req, res) => {
//   try {
//     const userId = req.user.id;
//     const { photo } = req.body;
 
//     if (!photo) return res.status(400).json({ message: "Photo filename is required" });
 
//     const user = await User.findById(userId);
//     if (!user) return res.status(404).json({ message: "User not found" });
 
//     if (!user.photos.includes(photo)) {
//       return res.status(400).json({ message: "Photo not found in user's gallery" });
//     }
 
//     // Remove photo from array
//     user.photos = user.photos.filter((p) => p !== photo);
//     await user.save();
 
//     // Delete file from server
//     try {
//       await fs.unlink(`uploads/photos/${photo}`);
//     } catch (err) {
//       console.error("❌ Failed to delete file from server:", err.message);
//       // Don't fail the whole request if file doesn't exist
//     }
 
//     res.status(200).json({
//       message: "Photo deleted successfully",
//       photos: user.photos, // return updated array
//     });
//   } catch (err) {
//     res.status(500).json({ message: "Server error", error: err.message });
//   }
// };



export const deletePhoto = async (req, res) => {
  try {
    const userId = req.user.id;
    const { photo } = req.body; // Cloudinary URL
 
    if (!photo) return res.status(400).json({ message: "Photo URL required" });
 
    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ message: "User not found" });
 
    if (!user.photos.includes(photo)) {
      return res.status(400).json({ message: "Photo not found in user's gallery" });
    }
 
    // Remove from DB
    user.photos = user.photos.filter((p) => p !== photo);
    await user.save();
 
    // Extract public_id from Cloudinary URL
    const publicId = photo.split("/").slice(-1)[0].split(".")[0];
    await cloudinary.uploader.destroy(`shyeyes/photos/${publicId}`);
 
    res.status(200).json({
      message: "Photo deleted successfully",
      photos: user.photos,
    });
  } catch (err) {
    res.status(500).json({ message: "Server error", error: err.message });
  }
};


// Search users by name
// export const searchUsersByName = async (req, res) => {
//   try {
//     const query = req.query.q; // e.g., /users/search?q=John
//     if (!query) return res.status(400).json({ message: "Query is required" });

//     // Case-insensitive regex search on firstName or lastName
//     const users = await User.find({
//       $or: [
//         { "Name.firstName": { $regex: query, $options: "i" } },
//         { "Name.lastName": { $regex: query, $options: "i" } }
//       ]
//     })
//       .select("Name profilePic email") // only fetch necessary fields
//       .limit(20); // limit for performance

//     res.status(200).json({ users });
//   } catch (err) {
//     console.error("searchUsersByName error:", err);
//     res.status(500).json({ message: "Server error" });
//   }
// };


export const searchUsersByName = async (req, res) => {
  try {
    const query = req.query.q; // e.g., /users/search?q=John
    const page = parseInt(req.query.page, 10) || 1;
    const limit = Math.min(parseInt(req.query.limit, 10) || 15, 50);
    const skip = (page - 1) * limit;
    if (!query) {
      return res.status(400).json({ message: "Query is required" });
    }
 
    // 🔹 Case-insensitive regex search on firstName or lastName
    const users = await User.find({
      $or: [
        { "Name.firstName": { $regex: query, $options: "i" } },
        { "Name.lastName": { $regex: query, $options: "i" } }
      ]
    })
      .select("Name email age location profilePic") // fetch location field
      .skip(skip)
      .limit(limit);
 
    // 🔹 Format response
    const formattedUsers = users.map(u => ({
      id: u._id,
      firstName: u?.Name?.firstName || "",
      lastName: u?.Name?.lastName || "",
      fullName: `${u?.Name?.firstName || ""} ${u?.Name?.lastName || ""}`.trim(),
      email: u.email,
      age: u.age || null,
      location: u.location
        ? typeof u.location === "object"
          ? {
              city: u.location.city || null,
              state: u.location.state || null,
              country: u.location.country || null
            }
          : u.location
        : null,
      profilePic: resolveMediaUrl(u.profilePic)
    }));
 
    const hasMore = users.length === limit;
    return res.status(200).json({ users: formattedUsers, page, limit, hasMore });
  } catch (err) {
    console.error("searchUsersByName error:", err);
    return res.status(500).json({ message: "Server error" });
  }
};

//  Remove only profilePic 
export const removeProfilePic = async (req, res) => {
  try {
    const userId = req.user.id;

    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ message: "User not found" });

    // Sirf profilePic ko null karo
    user.profilePic = null;
    await user.save();

    res.status(200).json({
      message: "Profile picture removed successfully",
      profilePic: null,
      photos: user.photos, // gallery photos safe rahenge
    });
  } catch (err) {
    console.error("❌ removeProfilePic error:", err);
    res.status(500).json({ message: "Server error", error: err.message });
  }
};

//  Remove profilePic AND also delete from gallery
export const removeProfilePicAndGallery = async (req, res) => {
  try {
    const userId = req.user.id;

    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ message: "User not found" });

    const oldProfilePic = user.profilePic;

    if (!oldProfilePic) {
      return res.status(400).json({ message: "No profile picture to remove" });
    }

    // 🔹 Remove profilePic from gallery also
    user.photos = user.photos.filter(photo => photo !== oldProfilePic);

    // 🔹 Reset profilePic to null
    user.profilePic = null;

    await user.save();

    res.status(200).json({
      message: "Profile picture removed from profile and gallery",
      profilePic: null,
      photos: user.photos,
    });
  } catch (err) {
    console.error("❌ removeProfilePicAndGallery error:", err);
    res.status(500).json({ message: "Server error", error: err.message });
  }
};

//get notifications for a user
export const getNotifications = async (req, res) => {
  try {
    const userId = req.user._id;
    const notifications = await Notification.find({recipient:userId})
      .populate("sender", "Name profilePic")
      .sort({ createdAt: -1 })
      .lean();

    res.status(200).json({ success: true, message: "Notifications fetched", data: { notifications } });
  } catch (err) {
    console.error("getNotifications error:", err);
    res.status(500).json({ success: false, message: "Server error", data: {} });
  }
};


//user by id
export const getUserById = async (req, res) => {
  try {
    const { id } = req.params;
    const loginUserId = req.user.id; // currently logged-in user

    // fetch login user's friends for mutualFriendsCount
    const loginUser = await User.findById(loginUserId).select("friends");
    const loginUserFriends = loginUser?.friends || [];

    // aggregate user with friendship info
    const userDataArr = await User.aggregate([
      { $match: { _id: new mongoose.Types.ObjectId(id) } },
      ...getFriendshipAggregationStages(loginUserId, 1, 1).map(stage => {
        // adjust mutual friends for single user
        if (stage.$addFields && stage.$addFields.mutualFriendsCount) {
          stage.$addFields.mutualFriendsCount = {
            $size: {
              $setIntersection: ["$friendsList._id", loginUserFriends]
            }
          };
        }

        // limit friends list for efficiency
        if (stage.$addFields && stage.$addFields.friendsList) {
          stage.$addFields.friendsList = { $slice: ["$friendsList", 10] };
        }

        return stage;
      })
    ]);

    if (!userDataArr || userDataArr.length === 0)
      return res.status(404).json({ success: false, message: "User not found" });

    const user = userDataArr[0];

    const photos = (user.photos || []).map(p => resolveMediaUrl(p));
    const profilePic = resolveMediaUrl(user.profilePic);

    res.status(200).json({
      success: true,
      message: "User fetched successfully",
      user: {
        ...user,
        photos,
        profilePic,
      }
    });
  } catch (error) {
    console.error("❌ getUserById error:", error);
    res.status(500).json({ success: false, message: "Server error", error: error.message });
  }
};



export const searchUsersByLocation = async (req, res) => {
    try {
        // Get location parameters from query string
    const { city, state, country } = req.query;
    const page = parseInt(req.query.page, 10) || 1;
    const limit = Math.min(parseInt(req.query.limit, 10) || 15, 50);
    const skip = (page - 1) * limit;
 
        // Build dynamic filter object
        const filter = { status: "Active" }; // optional: only active users
 
        if (city) filter["location.city"] = { $regex: new RegExp(city, "i") };
        if (state) filter["location.state"] = { $regex: new RegExp(state, "i") };
        if (country) filter["location.country"] = { $regex: new RegExp(country, "i") };
 
        // If no filter provided, return empty array
        if (!city && !state && !country) {
      return res.status(200).json({ success: true, count: 0, users: [], page, limit, hasMore: false });
        }
 
    const users = await User.find(filter)
      .select("Name.firstName Name.lastName email profilePic location")
      .skip(skip)
      .limit(limit);
 
        res.status(200).json({
            success: true,
      count: users.length,
      users: users.map(u => ({
        ...u.toObject(),
        profilePic: resolveMediaUrl(u.profilePic)
      })),
      page,
      limit,
      hasMore: users.length === limit
        });
 
    } catch (error) {
        console.error("Location Search Error:", error);
        res.status(500).json({ success: false, message: "Server Error" });
    }
};


export const searchUsersByAge = async (req, res) => {
  try {
    let { minAge, maxAge } = req.query;
 
    // Convert to numbers
    minAge = minAge ? parseInt(minAge) : 18; // minimum age default
    maxAge = maxAge ? parseInt(maxAge) : 100; // maximum age default
 
    // Build query
    const query = {
      age: { $gte: minAge, $lte: maxAge },
      status: "Active", // only active users
    };
 
    const users = await User.find(query).select(
      "-password -otp -otpExpires"
    ); // exclude sensitive fields
 
    res.status(200).json({
      success: true,
      count: users.length,
      data: users,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: "Server Error" });
  }
};


export const searchUsersByGender = async (req, res) => {
  try {
    const { gender } = req.query;
    const page = parseInt(req.query.page, 10) || 1;
    const limit = Math.min(parseInt(req.query.limit, 10) || 15, 50);
    const skip = (page - 1) * limit;
 
    if (!gender) {
      return res.status(400).json({
        success: false,
        message: "Please provide a gender to search",
      });
    }
 
    // Build query
    const query = {
      gender: gender, // exact match
      status: "Active", // only active users
    };
 
    const users = await User.find(query)
      .select("-password -otp -otpExpires")
      .skip(skip)
      .limit(limit); // exclude sensitive info
 
    res.status(200).json({
      success: true,
      count: users.length,
      data: users.map(u => ({
        ...u.toObject(),
        profilePic: resolveMediaUrl(u.profilePic),
        photos: Array.isArray(u.photos) ? u.photos.map(p => resolveMediaUrl(p)) : u.photos
      })),
      page,
      limit,
      hasMore: users.length === limit
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: "Server Error" });
  }
};