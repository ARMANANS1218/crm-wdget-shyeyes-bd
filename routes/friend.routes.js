import express from "express";
import {
  // sendFriendRequest,
  acceptFriendRequest,
  rejectFriendRequest,
  cancelFriendRequest,
  getPendingRequests,
  getSentRequests,
  getFriends,
  unfriendUser,
  // unblockUser,
  // blockUser,
  toggleFriendRequest,
  toggleBlockUser,
  getBlockedUsers,

} from "../controllers/friend.list.controller.js";
import { protectedToken } from "../middlewares/userAuth/authMiddleware.js";

const router = express.Router();

// Friend Request Actions
router.post("/:id/friend-request", protectedToken, toggleFriendRequest);
// router.post("/request/:id", protectedToken, sendFriendRequest);
router.post("/accept/:id", protectedToken, acceptFriendRequest);
router.post("/reject/:id", protectedToken, rejectFriendRequest);
router.put("/cancel/:id", protectedToken, cancelFriendRequest);
router.delete("/unfriend/:id", protectedToken, unfriendUser);
// router.post("/block/:id", protectedToken, blockUser);
// router.post("/unblock/:id", protectedToken, unblockUser);
//block and unblock user
router.post("/:id/block", protectedToken, toggleBlockUser);

router.get("/block-list", protectedToken, getBlockedUsers);

// Queries
router.get("/requests", protectedToken, getPendingRequests);
router.get("/sent", protectedToken, getSentRequests);
router.get("/list", protectedToken, getFriends);




export default router;
