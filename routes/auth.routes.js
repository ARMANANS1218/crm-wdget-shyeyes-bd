import express from "express";
import {
  registerSuperAdmin,
  createAdminAccount,
  createAgentAccount,
  loginUser,
  getAuthProfile,
  forgotPassword, 
  verifyForgotOtp, 
  resetPassword 
} from "../controllers/admin.auth.controller.js";

import { allowRoles,  protectedAuth } from "../middleware/common/protectedAuth.js";

const router = express.Router();

// ===== SUPER ADMIN ONLY FUNCTIONS =====
// Only Super Admin can create Admin accounts
router.post("/create-admin", protectedAuth, allowRoles("superadmin"), createAdminAccount);

// First Super Admin registration (public route for initial setup)
router.post("/register", registerSuperAdmin);

// ===== ADMIN ONLY FUNCTIONS =====
// Only Admin can create Agent accounts
router.post("/create-agent", protectedAuth, allowRoles("admin"), createAgentAccount);

// ===== LOGIN ROUTE (PUBLIC) =====
router.post("/login", loginUser);

// ===== PROFILE ROUTE (PROTECTED) =====
router.get("/profile", protectedAuth, getAuthProfile);

// Forgot password flow for superadmin, admin, agent
router.post("/forgot-password", forgotPassword);
router.post("/verify-pass-otp", verifyForgotOtp);
router.post("/reset-password", resetPassword);


export default router;
