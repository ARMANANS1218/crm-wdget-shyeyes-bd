import express from 'express';
import { 
  updateUser, 
  blockUser, 
  unblockUser, 
  deleteUser, 
  getAllUsers,
  editAdminProfile,
  changeAdminProfileImage
} from '../../controllers/admin/admin.controller.js';
import uploadRoleProfile from "../../middleware/common/uploadRoleProfile.js";
import { protectedAuth, allowRoles } from "../../middleware/common/protectedAuth.js";




const router = express.Router();


router.get('/users', getAllUsers);
router.put('/users/:userId', updateUser);
router.patch('/users/:userId/block', blockUser);
router.patch('/users/:userId/unblock', unblockUser);
router.delete('/users/:userId', deleteUser);

// ✅ New profile routes
router.put(
  "/profile/edit",
  protectedAuth,
  allowRoles("admin"),
  uploadRoleProfile,
  editAdminProfile
);

router.patch(
  "/profile/change-image",
  protectedAuth,
  allowRoles("admin"),
  uploadRoleProfile,
  changeAdminProfileImage
);


export default router;