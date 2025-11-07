import jwt from "jsonwebtoken";
import User from "../../models/User.js";

export const protectedUser = async (req, res, next) => {
  try {
    // Header se token lena
    const hdr = req.headers.authorization || "";
    const token = hdr.startsWith("Bearer ") ? hdr.slice(7) : null;
 
    if (!token) {
      return res
        .status(401)
        .json({ success: false, message: "No token, authorization denied" });
    }
 
    // Token verify karna
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    
    // Full user details fetch karna for chat functionality
    const user = await User.findById(decoded.id).select('-password');
    if (!user || user.status !== 'Active') {
      return res
        .status(401)
        .json({ success: false, message: "User not found or inactive" });
    }

    req.user = user;
    next();
  } catch (err) {
    return res
      .status(401)
      .json({ success: false, message: "Invalid or expired token" });
  }
};