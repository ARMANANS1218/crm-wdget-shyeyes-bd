import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import Role from '../models/Role.js';
import { sendMail } from "../utils/mailSender.js";
import { generateOtp } from '../utils/gerateOtp.js';
import AllowedLocation from '../models/AllowedLocation.js';

// Helper to generate JWT from a user document (includes profileImage)
const generateToken = (userOrId, role) => {
  // Accept either a full user doc/object or an id + role fallback
  const isObj = typeof userOrId === 'object' && userOrId !== null;
  const id = isObj ? (userOrId._id ? userOrId._id.toString() : userOrId.id) : String(userOrId);
  const payload = {
    id,
    role: isObj ? (userOrId.role || role) : role || null,
    name: isObj ? (userOrId.name || null) : null,
    email: isObj ? (userOrId.email || null) : null,
    profileImage: isObj ? (userOrId.profileImage || null) : null
  };
  return jwt.sign(
    payload,
    process.env.JWT_SECRET || 'defaultsecret',
    { expiresIn: process.env.JWT_EXPIRES_IN || '30d' }
  );
};

//  SUPER ADMIN REGISTRATION 
export const registerSuperAdmin = async (req, res) => {
  try {
    const { name, email, password, ...otherFields } = req.body;

    if (!email || !password || !name) {
      return res.status(400).json({ message: 'Name, email and password are required.' });
    }

    const normalizedEmail = String(email).toLowerCase().trim();

    const superAdminCount = await Role.countDocuments({ role: 'superadmin' });

    if (superAdminCount > 0) {
      if (!req.user || req.user.role !== 'superadmin') {
        return res.status(403).json({ message: 'Only an existing Super Admin can create another Super Admin.' });
      }
    }

    const MAX_SUPERADMINS = Number(process.env.SUPERADMIN_LIMIT) || 5;
    if (superAdminCount >= MAX_SUPERADMINS) {
      return res.status(403).json({ message: `Super Admin limit reached (max ${MAX_SUPERADMINS} allowed).` });
    }

    const existingUser = await Role.findOne({ email: normalizedEmail });
    if (existingUser) {
      return res.status(409).json({ message: 'Email already registered' });
    }

    const passwordHash = await bcrypt.hash(password, 10);

    const newSuperAdmin = new Role({
      name,
      email: normalizedEmail,
      password: passwordHash,
      role: 'superadmin',
      ...otherFields
    });

    await newSuperAdmin.save();

    // fetch saved doc to include profileImage etc.
    const userDoc = await Role.findById(newSuperAdmin._id).select('-password');

    const token = generateToken(userDoc);

    return res.status(201).json({
      message: 'Super Admin registered successfully',
      token,
      user: {
        id: userDoc._id,
        name: userDoc.name,
        email: userDoc.email,
        role: userDoc.role,
        profileImage: userDoc.profileImage || null
      }
    });
  } catch (error) {
    console.error('Super Admin registration error:', error);
    return res.status(500).json({ message: 'Server error. Try again.' });
  }
};


// ===== ADMIN ACCOUNT CREATION (Only Super Admin can do this) =====
export const createAdminAccount = async (req, res) => {
  try {
    const { name, email, password, privileges, ...otherFields } = req.body;

    const normalized = String(email).toLowerCase().trim();
    const existingUser = await Role.findOne({ email: normalized });
    if (existingUser) {
      return res.status(409).json({ message: 'Email already registered' });
    }

    const passwordHash = await bcrypt.hash(password, 10);

    const newAdmin = new Role({
      name,
      email: normalized,
      password: passwordHash,
      role: 'admin',
      privileges,
      ...otherFields
    });

    await newAdmin.save();

    const userDoc = await Role.findById(newAdmin._id).select('-password');

    res.status(201).json({
      message: 'Admin account created successfully',
      adminCredentials: {
        email: newAdmin.email,
        password,
        role: 'admin'
      },
      user: {
        id: userDoc._id,
        name: userDoc.name,
        email: userDoc.email,
        role: userDoc.role,
        privileges: userDoc.privileges || [],
        profileImage: userDoc.profileImage || null
      }
    });
  } catch (error) {
    console.error('Admin account creation error:', error);
    res.status(500).json({ message: 'Server error. Try again.' });
  }
};

// ===== AGENT ACCOUNT CREATION (Only Admin can do this) =====
export const createAgentAccount = async (req, res) => {
  try {
    const { name, email, password, department, ...otherFields } = req.body;

    const normalized = String(email).toLowerCase().trim();
    const existingUser = await Role.findOne({ email: normalized });
    if (existingUser) {
      return res.status(409).json({ message: 'Email already registered' });
    }

    const passwordHash = await bcrypt.hash(password, 10);

    const newAgent = new Role({
      name,
      email: normalized,
      password: passwordHash,
      role: 'agent',
      department,
      ...otherFields
    });

    await newAgent.save();

    const userDoc = await Role.findById(newAgent._id).select('-password');

    res.status(201).json({
      message: 'Agent account created successfully',
      agentCredentials: {
        email: newAgent.email,
        password,
        role: 'agent'
      },
      user: {
        id: userDoc._id,
        name: userDoc.name,
        email: userDoc.email,
        department: userDoc.department || null,
        profileImage: userDoc.profileImage || null
      }
    });
  } catch (error) {
    console.error('Agent account creation error:', error);
    res.status(500).json({ message: 'Server error. Try again.' });
  }
};

// Haversine distance in meters
const distanceMeters = ([lng1, lat1], [lng2, lat2]) => {
  const R = 6371000;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
};

// ===== UNIFIED LOGIN FOR ALL ROLES =====
export const loginUser = async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ message: 'Email and password required' });
    }

    const normalized = String(email).toLowerCase().trim();

    const user = await Role.findOne({ email: normalized }).select('+password');
    if (!user) {
      return res.status(401).json({ message: 'Invalid email or password' });
    }

    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
      return res.status(401).json({ message: 'Invalid email or password' });
    }
    if (user.status !== 'Active') {
      return res.status(401).json({ message: 'Account is inactive' });
    }

    // Location-based login restriction for admin and agent
    if (user.role === 'admin' || user.role === 'agent') {
      const { latitude, longitude } = req.body;
      if (latitude == null || longitude == null) {
        return res.status(400).json({ message: 'Location required for login' });
      }

      const now = new Date();
      const allowed = await AllowedLocation.find({
        role: user._id,
        isActive: true,
        $or: [
          { type: 'permanent' },
          { type: 'temporary', startAt: { $lte: now }, endAt: { $gte: now } },
        ],
      }).lean();

      let withinAny = false;
      for (const loc of allowed) {
        const [lng, lat] = loc.location.coordinates;
        const d = distanceMeters([lng, lat], [Number(longitude), Number(latitude)]);
        if (d <= (loc.radiusMeters || 100)) { withinAny = true; break; }
      }

      if (!withinAny) {
        return res.status(403).json({ message: 'Login not allowed from this location' });
      }
    }

    const userDoc = await Role.findById(user._id).select('-password');
    const token = generateToken(userDoc);

    res.json({
      message: `${userDoc.role.charAt(0).toUpperCase() + userDoc.role.slice(1)} login successful`,
      token,
      user: {
        id: userDoc._id,
        name: userDoc.name,
        email: userDoc.email,
        role: userDoc.role,
        privileges: userDoc.privileges || [],
        department: userDoc.department || null,
        profileImage: userDoc.profileImage || null
      }
    });
  } catch (error) {
    console.error('User login error:', error);
    res.status(500).json({ message: 'Server error. Try again.' });
  }
};

// ===== GET AUTHENTICATED USER PROFILE =====
export const getAuthProfile = async (req, res) => {
  try {
    // support different shapes set by your auth middleware
    const userId = req.user?.id || req.user?.userId || req.user?._id || null;
    if (!userId) {
      return res.status(401).json({ message: 'Unauthorized' });
    }

    const user = await Role.findById(userId).select('-password');

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    res.json({
      message: 'Profile retrieved successfully',
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        privileges: user.privileges || [],
        department: user.department || null,
        status: user.status,
        profileImage: user.profileImage || null
      }
    });
  } catch (error) {
    console.error('Get profile error:', error);
    res.status(500).json({ message: 'Server error. Try again.' });
  }
};

const OTP_TTL_MS = 5 * 60 * 1000;  

// --------------------forgot-password--------------------
export const forgotPassword = async (req, res) => {
  try {
    const { email } = req.body;
    console.log("📧 Forgot password request for:", email);
    
    if (!email) return res.status(400).json({ success: false, message: "Email required" });

    const normalized = String(email).toLowerCase();
    const user = await Role.findOne({ email: normalized });
    if (!user) return res.status(404).json({ success: false, message: "Account not found" });

    // generate numeric 6-digit OTP
    const otp = generateOtp();
    console.log("🔢 Generated OTP:", otp, "for user:", normalized);

    // Save to DB
    user.resetPasswordOtp = otp;
    user.resetPasswordExpires = Date.now() + OTP_TTL_MS;
    user.otpVerifiedForReset = false; 
    await user.save();

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
    
    const mailResult = await sendMail(user.email, "Password Reset OTP - ShyEyes", html);
    
    if (!mailResult.success) {
      console.error("❌ Failed to send email:", mailResult.error);
      return res.status(500).json({ 
        success: false, 
        message: "Failed to send OTP email. Please try again." 
      });
    }

    console.log("✅ OTP email sent successfully to:", user.email);
    return res.status(200).json({ success: true, message: `OTP sent to ${user.email}` });
  } catch (err) {
    console.error("❌ forgotPassword error:", err);
    return res.status(500).json({ success: false, message: "Server error. Please try again." });
  }
};

// -------------------verify-otp--------------------
export const verifyForgotOtp = async (req, res) => {
  try {
    const { email, otp } = req.body;
    if (!email || !otp) return res.status(400).json({ success: false, message: "Email & OTP required" });

    const normalized = String(email).toLowerCase();
    const user = await Role.findOne({ email: normalized });
    if (!user) return res.status(404).json({ success: false, message: "Account not found" });

    if (!user.resetPasswordOtp || !user.resetPasswordExpires) {
      return res.status(400).json({ success: false, message: "No OTP requested for this account" });
    }

    // expired?
    if (Date.now() > new Date(user.resetPasswordExpires).getTime()) {
      user.resetPasswordOtp = undefined;
      user.resetPasswordExpires = undefined;
      user.otpVerifiedForReset = false;
      await user.save();
      return res.status(400).json({ success: false, message: "OTP expired" });
    }

    if (String(user.resetPasswordOtp) !== String(otp)) {
      return res.status(400).json({ success: false, message: "Invalid OTP" });
    }

    // Mark verified for reset; clear OTP fields (or optionally keep them)
    user.resetPasswordOtp = undefined;
    user.resetPasswordExpires = undefined;
    user.otpVerifiedForReset = true;
    await user.save();

    return res.status(200).json({ success: true, message: "OTP verified successfully" });
  } catch (err) {
    console.error("verifyForgotOtp error:", err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
};

// ------------------------reset-password---------------------------
export const resetPassword = async (req, res) => {
  try {
    const { email, newPassword, confirmPassword } = req.body;
    if (!email) return res.status(400).json({ success: false, message: "Email required" });
    if (!newPassword || !confirmPassword) return res.status(400).json({ success: false, message: "Both password fields required" });
    if (newPassword !== confirmPassword) return res.status(400).json({ success: false, message: "Passwords do not match" });

    const normalized = String(email).toLowerCase();
    const user = await Role.findOne({ email: normalized });
    if (!user) return res.status(404).json({ success: false, message: "Account not found" });

    if (!user.otpVerifiedForReset) {
      return res.status(400).json({ success: false, message: "OTP not verified" });
    }

    const hashedPassword = await bcrypt.hash(newPassword, 10);
    user.password = hashedPassword;

    // cleanup flags
    user.otpVerifiedForReset = false;
    user.resetPasswordOtp = undefined;
    user.resetPasswordExpires = undefined;

    await user.save();

    return res.status(200).json({ success: true, message: "Password reset successful. Please login." });
  } catch (err) {
    console.error("resetPassword error:", err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
};
