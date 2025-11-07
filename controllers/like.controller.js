import Like from "../models/Likes.js";
import Notification from "../models/Notification.js";
import User from "../models/User.js";
import Friendship from "../models/Friendship.js";

// Like a profile
// export const likeProfile = async (req, res) => {
//   try {
//     const userId = req.user.id;
//     const likedUserId = req.params.id;

//     if (userId === likedUserId) {
//       return res.status(400).json({ success: false, message: "You cannot like your own profile", data: {} });
//     }

//     // Check if already liked
//     const existingLike = await Like.findOne({ liker: userId, liked: likedUserId });
//     if (existingLike) {
//       return res.status(400).json({ success: false, message: "Profile already liked", data: {} });
//     }

//     // Create the like
//     const like = await Like.create({ liker: userId, liked: likedUserId });

//     // Increment like count in User
//     await User.findByIdAndUpdate(likedUserId, { $inc: { likeCount: 1 } });

//     // Fetch user data for notification
//     const userData = await User.findById(userId);

//     // Check for mutual like
//     const mutual = await Like.findOne({ liker: likedUserId, liked: userId });
//     const isMatch = !!mutual;

//     // Create notification
//     await Notification.create({
//       recipient: likedUserId,
//       sender: userId,
//       type: "like",
//       message: `${userData.Name.firstName} liked your profile`
//     });

//     res.status(201).json({ success: true, message: "Profile liked successfully", data: { like, match: isMatch } });
//   } catch (err) {
//     console.error("likeProfile error:", err);
//     res.status(500).json({ success: false, message: "Server error", data: {} });
//   }
// };



// Unlike a profile
// export const unlikeProfile = async (req, res) => {
//   try {
//     const userId = req.user.id;
//     const likedUserId = req.params.id;

//     const deleted = await Like.findOneAndDelete({ liker: userId, liked: likedUserId });
//     if (!deleted) return res.status(404).json({ message: "Like not found" });

//     // Decrement like count in User
//     await User.findByIdAndUpdate(likedUserId, { $inc: { likeCount: -1 } });

//     res.status(200).json({ message: "Profile unliked successfully" });
//   } catch (err) {
//     console.error("unlikeProfile error:", err);
//     res.status(500).json({ message: "Server error" });
//   }
// };



// Toggle Like / Unlike a profile
export const toggleLikeProfile = async (req, res) => {
  try {
    const userId = req.user.id;
    const likedUserId = req.params.id;
 
    if (userId === likedUserId)
      return res.status(400).json({ message: "You cannot like your own profile" });
 
    // Check if already liked
    const existingLike = await Like.findOne({ liker: userId, liked: likedUserId });
 
    if (existingLike) {
      // ✅ Already liked → unlike
      await Like.findOneAndDelete({ liker: userId, liked: likedUserId });
      await User.findByIdAndUpdate(likedUserId, { $inc: { likeCount: -1 } });
 
      return res.status(200).json({
        message: "Profile unliked successfully",
        liked: false
      });
    } else {
      // ✅ Not liked yet → like
      const like = await Like.create({ liker: userId, liked: likedUserId });
      await User.findByIdAndUpdate(likedUserId, { $inc: { likeCount: 1 } });
 
      // Check for mutual like (match)
      const mutual = await Like.findOne({ liker: likedUserId, liked: userId });
      const isMatch = !!mutual;
 
      return res.status(201).json({
        message: "Profile liked successfully",
        liked: true,
        like,
        match: isMatch
        
      });
    }
  } catch (err) {
    console.error("toggleLikeProfile error:", err);
    res.status(500).json({ message: "Server error" });
  }
};

// Get all likes sent by the user
export const getLikesSent = async (req, res) => {
  try {
    const userId = req.user.id;

    // 1️⃣ Get all likes sent by this user
    const likes = await Like.find({ liker: userId })
      .populate("liked", "Name age location status profilePic")
      .lean();

    // 2️⃣ Map likes to include friendship status
    // const likesWithFriendship = await Promise.all(
    //   likes.map(async (like) => {
    //     const likedUserId = like.liked._id;

    //     // Find friendship where logged-in user is either user1 or user2
    //     const friendship = await Friendship.findOne({
    //       $or: [
    //         { user1: userId, user2: likedUserId },
    //         { user1: likedUserId, user2: userId },
    //       ],
    //     }).lean();

    //     // Add friendshipStatus field (if no friendship found, default to "None")
    //     return {
    //       ...like,
    //       friendshipStatus: friendship ? friendship.status : "None",
    //     };
    //   })
    // );

    res.status(200).json({ likes });
  } catch (err) {
    console.error("getLikesSent error:", err);
    res.status(500).json({ message: "Server error" });
  }
};

// Get all likes received by the user
export const getLikesReceived = async (req, res) => {
  try {
    const userId = req.user.id;

    // 1️⃣ Get all likes received by this user
    const likes = await Like.find({ liked: userId })
      .populate("liker", "Name age location status profilePic")
      .lean();

    // 2️⃣ Map likes to include friendship status
    // const likesWithFriendship = await Promise.all(
    //   likes.map(async (like) => {
    //     const likerId = like.liker._id;

    //     // Find friendship where logged-in user is either user1 or user2
    //     const friendship = await Friendship.findOne({
    //       $or: [
    //         { user1: userId, user2: likerId },
    //         { user1: likerId, user2: userId },
    //       ],
    //     }).lean();

    //     // Add friendshipStatus field (if no friendship found, default to "None")
    //     return {
    //       ...like,
    //       friendshipStatus: friendship ? friendship.status : "None",
    //     };
    //   })
    // );

    res.status(200).json({ likes });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
};

//  Toggle Favourite (add/remove)
export const toggleFavourite = async (req, res) => {
  try {
    const userId = req.user.id;
    const favouriteUserId = req.params.id;
 
    if (userId === favouriteUserId) {
      return res.status(400).json({ message: "You cannot favourite yourself" });
    }


    let like = await Like.findOne({ liker: userId, liked: favouriteUserId });
 
    if (!like) {
   
      like = await Like.create({ liker: userId, liked: favouriteUserId, isFavourite: true });
      return res.status(201).json({ message: "Added to favourites", favourite: true, data: like });
    }
 
    like.isFavourite = !like.isFavourite;
    await like.save();
 
    res.status(200).json({
      message: like.isFavourite ? "Added to favourites" : "Removed from favourites",
      favourite: like.isFavourite
    });
  } catch (err) {
    console.error("toggleFavourite error:", err);
    res.status(500).json({ message: "Server error" });
  }
};


//  Get my favourite list
export const getMyFavourites = async (req, res) => {
  try {
    const userId = req.user.id;
 
    const favourites = await Like.find({ liker: userId, isFavourite: true })
      .populate("liked", "Name profilePic")   // ✅ only Name + profilePic
      .populate("liker", "Name profilePic")   // ✅ also get liker info
      .select("liker liked")                  // ✅ only return liker & liked fields
      .lean();
 
    res.status(200).json({ favourites });
  } catch (err) {
    console.error("getMyFavourites error:", err);
    res.status(500).json({ message: "Server error" });
  }
};