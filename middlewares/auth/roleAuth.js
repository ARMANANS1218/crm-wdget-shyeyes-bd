const Role = require("../../models/role");

// Check if user has required role(s)
const authorize = (requiredRoles) => {
  return async (req, res, next) => {
    try {
      // Check if user is authenticated
      if (!req.user) {
        return res.status(401).json({
          success: false,
          message: "Authentication required"
        });
      }

      // Get user's role
      let userRole;
      
      // Handle both ObjectId reference and string role
      if (typeof req.user.role === 'object' && req.user.role.name) {
        userRole = req.user.role.name;
      } else if (typeof req.user.role === 'string') {
        userRole = req.user.role;
      } else {
        // If role is ObjectId but not populated, fetch it
        const roleDoc = await Role.findById(req.user.role);
        userRole = roleDoc ? roleDoc.name : null;
      }

      // Check if user has required role
      if (!userRole || !requiredRoles.includes(userRole)) {
        return res.status(403).json({
          success: false,
          message: `Access denied. Required role(s): ${requiredRoles.join(', ')}. Your role: ${userRole || 'None'}`
        });
      }

      // Store user role in request for later use
      req.userRole = userRole;
      next();
    } catch (error) {
      console.error("Authorization error:", error);
      return res.status(500).json({
        success: false,
        message: "Authorization check failed"
      });
    }
  };
};

// Check if user owns the resource or has admin privileges
const checkOwnershipOrAdmin = (resourceUserIdField = 'userId') => {
  return async (req, res, next) => {
    try {
      if (!req.user) {
        return res.status(401).json({
          success: false,
          message: "Authentication required"
        });
      }

      const userRole = req.user.role?.name || req.user.role;
      const resourceUserId = req.params[resourceUserIdField] || req.body[resourceUserIdField];

      // Allow if user is admin or superadmin
      if (['admin', 'superadmin'].includes(userRole)) {
        return next();
      }

      // Allow if user owns the resource
      if (req.user._id.toString() === resourceUserId) {
        return next();
      }

      return res.status(403).json({
        success: false,
        message: "Access denied. You can only access your own resources."
      });
    } catch (error) {
      console.error("Ownership check error:", error);
      return res.status(500).json({
        success: false,
        message: "Ownership check failed"
      });
    }
  };
};

module.exports = {
  authorize,
  checkOwnershipOrAdmin
};