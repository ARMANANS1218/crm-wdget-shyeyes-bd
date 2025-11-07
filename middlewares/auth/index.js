// Import all authentication-related middleware
const { protect, optionalProtect } = require("./jwtAuth");
const { authorize, checkOwnershipOrAdmin } = require("./roleAuth");
const { checkPermission, checkPermissions, checkAnyPermission } = require("./permissionAuth");
const { generateToken, generateRefreshToken, refreshToken, verifyTokenOptional } = require("./tokenUtils");

module.exports = {
  // JWT Authentication
  protect,
  optionalProtect,
  
  // Role-based Authorization
  authorize,
  checkOwnershipOrAdmin,
  
  // Permission-based Authorization
  checkPermission,
  checkPermissions,
  checkAnyPermission,
  
  // Token Utilities
  generateToken,
  generateRefreshToken,
  refreshToken,
  verifyTokenOptional
};