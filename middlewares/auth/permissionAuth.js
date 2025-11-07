const Role = require("../../models/role");

// Check if user has specific permission
const checkPermission = (requiredPermission) => {
  return async (req, res, next) => {
    try {
      if (!req.user) {
        return res.status(401).json({
          success: false,
          message: "Authentication required"
        });
      }

      let userPermissions = [];

      // Get user's permissions from role
      if (req.user.role && req.user.role.permissions) {
        userPermissions = req.user.role.permissions;
      } else if (req.user.role) {
        // If role is not populated, fetch it
        const roleDoc = await Role.findById(req.user.role);
        userPermissions = roleDoc ? roleDoc.permissions : [];
      }

      // Check if user has the required permission
      if (!userPermissions.includes(requiredPermission)) {
        return res.status(403).json({
          success: false,
          message: `Access denied. Required permission: ${requiredPermission}`
        });
      }

      next();
    } catch (error) {
      console.error("Permission check error:", error);
      return res.status(500).json({
        success: false,
        message: "Permission check failed"
      });
    }
  };
};

// Check multiple permissions (user must have ALL)
const checkPermissions = (requiredPermissions) => {
  return async (req, res, next) => {
    try {
      if (!req.user) {
        return res.status(401).json({
          success: false,
          message: "Authentication required"
        });
      }

      let userPermissions = [];

      if (req.user.role && req.user.role.permissions) {
        userPermissions = req.user.role.permissions;
      } else if (req.user.role) {
        const roleDoc = await Role.findById(req.user.role);
        userPermissions = roleDoc ? roleDoc.permissions : [];
      }

      // Check if user has ALL required permissions
      const hasAllPermissions = requiredPermissions.every(permission => 
        userPermissions.includes(permission)
      );

      if (!hasAllPermissions) {
        const missingPermissions = requiredPermissions.filter(permission => 
          !userPermissions.includes(permission)
        );
        
        return res.status(403).json({
          success: false,
          message: `Access denied. Missing permissions: ${missingPermissions.join(', ')}`
        });
      }

      next();
    } catch (error) {
      console.error("Permissions check error:", error);
      return res.status(500).json({
        success: false,
        message: "Permissions check failed"
      });
    }
  };
};

// Check if user has ANY of the required permissions
const checkAnyPermission = (requiredPermissions) => {
  return async (req, res, next) => {
    try {
      if (!req.user) {
        return res.status(401).json({
          success: false,
          message: "Authentication required"
        });
      }

      let userPermissions = [];

      if (req.user.role && req.user.role.permissions) {
        userPermissions = req.user.role.permissions;
      } else if (req.user.role) {
        const roleDoc = await Role.findById(req.user.role);
        userPermissions = roleDoc ? roleDoc.permissions : [];
      }

      // Check if user has ANY of the required permissions
      const hasAnyPermission = requiredPermissions.some(permission => 
        userPermissions.includes(permission)
      );

      if (!hasAnyPermission) {
        return res.status(403).json({
          success: false,
          message: `Access denied. Required any of: ${requiredPermissions.join(', ')}`
        });
      }

      next();
    } catch (error) {
      console.error("Any permission check error:", error);
      return res.status(500).json({
        success: false,
        message: "Permission check failed"
      });
    }
  };
};

module.exports = {
  checkPermission,
  checkPermissions,
  checkAnyPermission
};