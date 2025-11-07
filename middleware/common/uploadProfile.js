import multer from "multer";
import path from "path";

// Storage configuration
const storage = multer.diskStorage({
  destination: "./uploads/profile", // folder to save profile pics
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const allowed = [".jpg", ".jpeg", ".png", ".webp", ".avif"];

    if (!allowed.includes(ext)) return cb(new Error("Invalid file type"));

    cb(null, `${Date.now()}${ext}`);
  },
});

// Multer middleware for single profile picture
const uploadProfile = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // max 5MB
}).single("profilePic"); // field name must match frontend

export default uploadProfile;
