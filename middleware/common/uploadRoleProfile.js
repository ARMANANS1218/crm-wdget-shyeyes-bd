import multer from "multer";
import path from "path";
import fs from "fs";

const allowedMimes = [
  "image/jpeg",
  "image/png",
  "image/jpg",
  "image/gif",
  "image/webp",
  "image/avif"
];

// Dynamic destination based on role (if present)
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    // fallback folder
    let folder = "uploads/roles";
    const role = req.user?.role;
    if (role === "superadmin") folder = "uploads/superadmins";
    else if (role === "admin") folder = "uploads/admins";
    else if (role === "agent") folder = "uploads/agents";

    if (!fs.existsSync(folder)) fs.mkdirSync(folder, { recursive: true });
    cb(null, folder);
  },
  filename: (req, file, cb) => {
    // DO NOT validate type here (already done in fileFilter)
    const ext = path.extname(file.originalname) || ".jpg";
    const safeExt = ext.toLowerCase();
    const name = `${req.user?._id}_${Date.now()}${safeExt}`;
    cb(null, name);
  }
});

const fileFilter = (req, file, cb) => {
  if (!allowedMimes.includes(file.mimetype)) {
    return cb(null, false); // reject silently; we’ll handle below
  }
  cb(null, true);
};

const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: 5 * 1024 * 1024 } // 5MB
}).single("profileImage"); // Use single instead of fields

export default function uploadRoleProfile(req, res, next) {
  upload(req, res, (err) => {
    if (err) {
      console.error("Upload error:", err);
      return res.status(400).json({
        success: false,
        message: err.message || "Upload error"
      });
    }
    
    // With single upload, the file is directly in req.file
    if (req.file) {
      console.log("File uploaded successfully:", req.file.filename);
    }
    
    next();
  });
}