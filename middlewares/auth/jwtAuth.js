const jwt = require("jsonwebtoken");
const User = require("../../models/userModel");

// Protect routes - verify JWT token
const protect = async (req, res, next) => {
  let token;

  // Check for token in Authorization header
  if (req.headers.authorization && req.headers.authorization.startsWith("Bearer")) {
    try {
      // Get token from header
      token = req.headers.authorization.split(" ")[1];

      // Verify token
      const decoded = jwt.verify(token, process.env.JWT_SECRET);

      // Get user from the token (exclude password)
      req.user = await User.findById(decoded.id)
        .select("-password")
        .populate("role", "name permissions");

      if (!req.user) {
        return res.status(401).json({
          success: false,
          message: "Not authorized, user not found"
        });
      }

      // Check if user is active
      if (req.user.status !== "Active") {
        return res.status(401).json({
          success: false,
          message: "Account is inactive or banned"
        });
      }

      next();
    } catch (error) {
      console.error("Token verification error:", error);
      return res.status(401).json({
        success: false,
        message: "Not authorized, token failed"
      });
    }
  }

  // If no token provided
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
      req.user = await User.findById(decoded.id)
        .select("-password")
        .populate("role", "name permissions");
    } catch (error) {
      // Silently fail for optional protection
      req.user = null;
    }
  }

  next();
};

module.exports = {
  protect,
  optionalProtect
};