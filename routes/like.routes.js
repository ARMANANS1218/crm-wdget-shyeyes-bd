import express from "express";
import { toggleLikeProfile, getLikesSent, getLikesReceived,getMyFavourites,toggleFavourite } from "../controllers/like.controller.js";
import { protectedToken } from "../middlewares/userAuth/authMiddleware.js";

const router = express.Router();

// Like / Unlike
// router.post("/:id/like", protectedToken, likeProfile);     // like a profile
// router.delete("/:id/unlike", protectedToken, unlikeProfile); // unlike a profile

// Get all likes sent by the user
router.get("/sent", protectedToken, getLikesSent);

//get like/unlike
router.post("/:id/like", protectedToken, toggleLikeProfile); 

// Get all likes received by the user
router.get("/received", protectedToken, getLikesReceived);

router.post("/favourite/:id", protectedToken, toggleFavourite);   // add/remove favourite
router.get("/favourites", protectedToken, getMyFavourites);       //  fav list

export default router;
