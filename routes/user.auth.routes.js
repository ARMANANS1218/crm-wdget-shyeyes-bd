import express from "express";
import multer from "multer";
import path from "path";
import {
  registerStep1,
  verifyOtp,
  loginUser,
  registerStep2,
  getUserProfile,
  updateUserProfile,
  forgotPassword,
  resetPassword,
  verifyForgotOtp,
  getAllActiveUsers,
  getMatches,
  getPhotos,
  setProfilePic,
  uploadPhotos,
  deletePhoto,
  removeProfilePic,
  removeProfilePicAndGallery,
  searchUsersByName,
  getUserById,
  getNewActiveMembers,
  getNotifications,
  setCoverPic,
  searchUsersByLocation,
  searchUsersByAge,
  searchUsersByGender,
} from "../controllers/user.auth.controller.js";



import { protectedUser } from "../middleware/common/protectedUser.js";
//import upload from "../middlewares/uploadProfile.js";

//cloudinary
 import upload from "../middlewares/cloudinaryUpload.js"; 


const router = express.Router();

router.get("/notifications", protectedUser, getNotifications);
 
// --- routes ---
router.post("/register/step1", registerStep1);
router.post("/register/verify-otp", verifyOtp);
router.post("/register/step2", upload.single("profilePic"), registerStep2);
 
router.get("/active-users", protectedUser, getAllActiveUsers); // New route to get all active users
router.get("/matches", protectedUser, getMatches); // New route to get user matches
// ===== Forgot / Reset Password =====
router.post("/forgot-password", forgotPassword);
router.post("/verify-pass-otp", verifyForgotOtp);
router.post("/reset-password", resetPassword);


// Login user
router.post("/login", loginUser);
 
router.get("/search",protectedUser, searchUsersByName);
 
//membership upgrade


//profile
router.get("/profile", protectedUser, getUserProfile);
//router.put("/profile", protectedUser, upload.single("photos"), updateUserProfile);
 
// ✅ For profile update (single file named "profilePic")
router.put("/profile", protectedUser, upload.single("profilePic"), updateUserProfile);
 
//photos
router.get("/photos", protectedUser, getPhotos);
router.post("/photos", protectedUser, upload.array("photos", 5), uploadPhotos); // Limit to 5 photos
router.delete("/photo", protectedUser, deletePhoto);
router.post("/photos/profile-pic", protectedUser, upload.single("profilePic"), setProfilePic);
router.get("/:id", protectedUser, getUserById);

router.delete("/photos/profile-pic", protectedUser, removeProfilePic);
router.delete("/photos/profile-pic/gallery", protectedUser,removeProfilePicAndGallery)


//============== New Members =================without token
router.get("/new-members", getNewActiveMembers);

router.put("/set-cover-pic", protectedUser, setCoverPic);
 
 
router.get("/search-by-location/new", protectedUser,searchUsersByLocation);
router.get("/search/by-age", protectedUser,searchUsersByAge);
router.get("/search/by-gender", protectedUser,searchUsersByGender);

export default router;