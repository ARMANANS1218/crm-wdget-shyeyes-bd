import jwt from "jsonwebtoken";

import User from "../../models/User.js";
import Role from "../../models/Role.js";

// Protect routes - verify JWT token
const protectedAuth = async (req, res, next) => {
  let token;

  if (req.headers.authorization && req.headers.authorization.startsWith("Bearer")) {
    try {
      token = req.headers.authorization.split(" ")[1];
      const decoded = jwt.verify(token, process.env.JWT_SECRET);

      // Find user in unified Role model
      const user = await Role.findById(decoded.id).select("-password");
      if (!user) {
        return res.status(401).json({
          success: false,
          message: "Not authorized, user not found"
        });
      }
      if (user.status !== "Active") {
        return res.status(401).json({
          success: false,
          message: "Account is inactive or banned"
        });
      }
      req.user = user;
      next();
    } catch (error) {
      console.error("Token verification error:", error);
      return res.status(401).json({
        success: false,
        message: "Not authorized, token failed"
      });
    }
  }

  if (!token) {
    return res.status(401).json({
      success: false,
      message: "Not authorized, no token provided"
    });
  }
};

// Optional protect - doesn't fail if no token, but sets user if valid token
const optionalProtect = async (req, res, next) => {
  let token;

  if (req.headers.authorization && req.headers.authorization.startsWith("Bearer")) {
    try {
      token = req.headers.authorization.split(" ")[1];
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      let user = await AdminSuperAdmin.findById(decoded.id).select("-password");
      if (!user) {
        user = await Agent.findById(decoded.id).select("-password");
      }
      req.user = user;
    } catch (error) {
      req.user = null;
    }
  }
  next();
};

// Generate JWT token
const generateToken = (id) => {
  return jwt.sign({ id }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRE || "30d"
  });
};

// Refresh token validation
const refreshToken = async (req, res, next) => {
  try {
    const { refreshToken } = req.body;

    if (!refreshToken) {
      return res.status(401).json({
        success: false,
        message: "Refresh token required"
      });
    }

    // Verify refresh token
    const decoded = jwt.verify(refreshToken, process.env.JWT_REFRESH_SECRET);
    
    // Get user and check if refresh token is valid
    const user = await User.findById(decoded.id).select("-password");
    
    if (!user || user.refreshToken !== refreshToken) {
      return res.status(401).json({
        success: false,
        message: "Invalid refresh token"
      });
    }

    req.user = user;
    next();
  } catch (error) {
    return res.status(401).json({
      success: false,
      message: "Invalid refresh token"
    });
  }
};
const allowRoles = (...roles) => (req, res, next) => {
  if (!req.user || !roles.includes(req.user.role)) {
    return res.status(403).json({ message: "Access denied" });
  }
  next();
};
export {
  protectedAuth,
  allowRoles,
  optionalProtect,
  generateToken,
  refreshToken
};