import express from "express";
import {
  getAllAdmins,
  getAdminById,
  updateAdmin,
  banAdmin,
  unbanAdmin,
  deleteAdmin,
  editSuperAdminProfile,
  changeSuperAdminProfileImage
} from "../../controllers/superadmin/superadmin.controller.js";

import { protectedAuth, allowRoles } from "../../middleware/common/protectedAuth.js";
import uploadRoleProfile from "../../middleware/common/uploadRoleProfile.js";
// 



const router = express.Router();



// Get all admins with pagination and filtering
router.get("/alladmins", protectedAuth, allowRoles("superadmin"), getAllAdmins);


router.get("/admins/:adminId", protectedAuth, allowRoles("superadmin"), getAdminById);


router.put("/admins/:adminId", protectedAuth, allowRoles("superadmin"), updateAdmin);


router.patch("/admins/:adminId/ban", protectedAuth, allowRoles("superadmin"), banAdmin);


router.patch("/admins/:adminId/unban", protectedAuth, allowRoles("superadmin"), unbanAdmin);


router.delete("/admins/:adminId", protectedAuth, allowRoles("superadmin"), deleteAdmin);


// ✅ New profile routes
router.put("/profile/edit", protectedAuth, allowRoles("superadmin"),uploadRoleProfile,editSuperAdminProfile);

router.patch("/profile/change-image",protectedAuth,allowRoles("superadmin"),
uploadRoleProfile,changeSuperAdminProfileImage);


export default router;