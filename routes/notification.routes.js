import express from "express";
import { clearNotifications, createNotification, deleteNotification, getNotifications, markAsRead } from "../controllers/notification.controller.js";
import { protectedUser } from "../middleware/common/protectedUser.js";
const router = express.Router();

// REST API Endpoints
router.post("/", protectedUser, createNotification);         // create
router.get("/", protectedUser, getNotifications);           // get all
router.put("/:id/read", protectedUser, markAsRead);         // mark read
router.delete("/:id", protectedUser, deleteNotification);   // delete
router.delete("/clear", protectedUser, clearNotifications); // clear all

export default router;