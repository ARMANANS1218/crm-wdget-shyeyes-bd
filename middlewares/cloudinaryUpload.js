import multer from "multer";
import { CloudinaryStorage } from "multer-storage-cloudinary";
import cloudinary from "../config/cloudinary.js";
 
const storage = new CloudinaryStorage({
  cloudinary,
  params: {
    folder: "shyeyes/photos", // normalized folder for all user photos
    allowed_formats: ["jpg", "jpeg", "png", "webp"],
    transformation: [{ width: 800, height: 800, crop: "limit" }],
    resource_type: "image",
  },
});
 
const upload = multer({ storage });
 
export default upload;