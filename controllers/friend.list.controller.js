// import User from "../models/User.js";
// import Friendship from "../models/Friendship.js";
// import mongoose from "mongoose";
// Send Friend Request
// export const sendFriendRequest = async (req, res) => {
//   try {
//     const fromUserId = req.user.id;
//     const toUserId = req.params.id;

//     if (fromUserId === toUserId)
//       return res.status(400).json({ message: "Cannot send request to yourself" });

//     // Check if relationship exists
//     const existing = await Friendship.findOne({
//       $or: [
//         { user1: fromUserId, user2: toUserId },
//         { user1: toUserId, user2: fromUserId }
//       ]
//     });

//     if (existing) return res.status(400).json({ message: "Friend request already exists" });

//     const request = await Friendship.create({
//       user1: fromUserId,
//       user2: toUserId,
//       actionBy: fromUserId,
//       status: "Pending"
//     });

//     // Increment usage
//     await User.findByIdAndUpdate(fromUserId, { $inc: { "usage.requestsSent": 1 } });

//     res.status(200).json({ message: "Friend request sent", request });
//   } catch (err) {
//     res.status(500).json({ message: "Server error", error: err.message });
//   }
// };

// Toggle Friend Request (Send / Cancel)
// export const toggleFriendRequest = async (req, res) => {
//   try {
//     const fromUserId = req.user.id;
//     const toUserId = req.params.id;
 
//     if (fromUserId === toUserId)
//       return res.status(400).json({ message: "Cannot send request to yourself" });
 
//     // Check if a pending request already exists
//     const existing = await Friendship.findOne({
//       $or: [
//         { user1: fromUserId, user2: toUserId },
//         { user1: toUserId, user2: fromUserId }
//       ]
//     });
 
//     if (existing) {
//       // If pending and sent by current user → cancel it
//       if (existing.status === "Pending" && existing.actionBy.toString() === fromUserId) {
//         await existing.deleteOne();
//         return res.status(200).json({ message: "Friend request cancelled", sent: false });
//       } else {
//         return res.status(400).json({ message: "Friend request already exists or accepted" });
//       }
//     }
 
//     // If no existing request → send new friend request
//     const request = await Friendship.create({
//       user1: fromUserId,
//       user2: toUserId,
//       actionBy: fromUserId,
//       status: "Pending"
//     });
 
//     // Optional: Increment usage counter
//     await User.findByIdAndUpdate(fromUserId, { $inc: { "usage.requestsSent": 1 } });
 
//     res.status(201).json({ message: "Friend request sent", sent: true, request });
//   } catch (err) {
//     console.error("toggleFriendRequest error:", err);
//     res.status(500).json({ message: "Server error", error: err.message });
//   }
// };

// export const toggleFriendRequest = async (req, res) => {
//   try {
//     const fromUserId = req.user.id;
//     const toUserId = req.params.id;
 
//     if (fromUserId === toUserId)
//       return res.status(400).json({ message: "Cannot send request to yourself" });
 
//     // Check if a friendship already exists
//     const existing = await Friendship.findOne({
//       $or: [
//         { user1: fromUserId, user2: toUserId },
//         { user1: toUserId, user2: fromUserId }
//       ]
//     });
 
//     if (existing) {
//       // ✅ Case 1: Cancel request
//       if (existing.status === "Pending" && existing.actionBy.toString() === fromUserId) {
//         existing.status = "Cancelled";
//         existing.cancelledAt = new Date();
//         await existing.save();
 
//         return res.status(200).json({
//           message: "Friend request cancelled",
//           sent: false,
//           status: existing.status
//         });
//       }
 
//       // ✅ Case 2: Allow sending again after cancellation
//       if (existing.status === "Cancelled") {
//         existing.status = "Pending";
//         existing.actionBy = fromUserId;
//         existing.sentAt = new Date();
//         await existing.save();
 
//         return res.status(200).json({
//           message: "Friend request re-sent",
//           sent: true,
//           status: existing.status
//         });
//       }
 
//       // ✅ Case 3: Already accepted/rejected
//       return res.status(400).json({ message: "Friend request already exists or accepted" });
//     }
 
//     // ✅ Case 4: No record, create fresh request
//     const request = await Friendship.create({
//       user1: fromUserId,
//       user2: toUserId,
//       actionBy: fromUserId,
//       status: "Pending",
//       sentAt: new Date()
//     });
 
//     await User.findByIdAndUpdate(fromUserId, { $inc: { "usage.requestsSent": 1 } });
 
//     res.status(201).json({ message: "Friend request sent", sent: true, request });
//   } catch (err) {
//     console.error("toggleFriendRequest error:", err);
//     res.status(500).json({ message: "Server error", error: err.message });
//   }
// };

// Accept Friend Request
// export const acceptFriendRequest = async (req, res) => {
//   try {
//     const userId = req.user.id;
//     const requestId = req.params.id;

//     const request = await Friendship.findById(requestId);
//     if (!request || request.user2.toString() !== userId || request.status !== "Pending")
//       return res.status(400).json({ message: "Invalid request" });

//     request.status = "Accepted";
//     request.actionBy = userId;
//     await request.save();

//     res.status(200).json({ message: "Friend request accepted" });
//   } catch (err) {
//     res.status(500).json({ message: "Server error", error: err.message });
//   }
// };

// export const acceptFriendRequest = async (req, res) => {
//   try {
//     const userId = req.user.id;        // Current logged-in user (receiver)
//     const fromUserId = req.params.id;  // The user who originally sent the request
 
//     // Find a pending request where current user is the receiver
//     const request = await Friendship.findOne({
//       user1: fromUserId,
//       user2: userId,
//       status: "Pending"
//     });
 
//     if (!request) {
//       return res.status(400).json({ message: "No pending request from this user" });
//     }
 
//     // Accept request
//     request.status = "Accepted";
//     request.actionBy = userId;
//     await request.save();
 
//     res.status(200).json({ message: "Friend request accepted", accepted: true });
//   } catch (err) {
//     console.error("acceptFriendRequest error:", err);
//     res.status(500).json({ message: "Server error", error: err.message });
//   }
// };

// Reject Friend Request
// export const rejectFriendRequest = async (req, res) => {
//   try {
//     const userId = req.user.id;
//     const requestId = req.params.id;

//     const request = await Friendship.findById(requestId);
//     if (!request || request.user2.toString() !== userId || request.status !== "Pending")
//       return res.status(400).json({ message: "Invalid request" });

//     request.status = "Rejected";
//     request.actionBy = userId;
//     await request.save();

//     res.status(200).json({ message: "Friend request rejected" });
//   } catch (err) {
//     res.status(500).json({ message: "Server error", error: err.message });
//   }
// };

// Cancel Friend Request (sender cancels)
// export const cancelFriendRequest = async (req, res) => {
//   try {
//     const userId = req.user.id;
//     const requestId = req.params.id;

//     const request = await Friendship.findById(requestId);
//     if (!request || request.user1.toString() !== userId || request.status !== "Pending")
//       return res.status(400).json({ message: "Cannot cancel request" });

//     await request.deleteOne();
//     res.status(200).json({ message: "Friend request cancelled" });
//   } catch (err) {
//     res.status(500).json({ message: "Server error", error: err.message });
//   }
// };

// Get Pending Requests (received)
// export const getPendingRequests = async (req, res) => {
//   try {
//     const userId = req.user.id;
//     const requests = await Friendship.find({ user2: userId, status: "Pending" })
//       .populate("user1", "Name email age profilePic")
//       .lean();

//     res.status(200).json({ requests });
//   } catch (err) {
//     res.status(500).json({ message: "Server error", error: err.message });
//   }
// };

// Get Sent Requests (sent)
// export const getSentRequests = async (req, res) => {
//   try {
//     const userId = req.user.id;
//     const requests = await Friendship.find({ user1: userId, status: "Pending" })
//       .populate("user2", "Name email age profilePic")
//       .lean();

//     res.status(200).json({ requests });
//   } catch (err) {
//     res.status(500).json({ message: "Server error", error: err.message });
//   }
// };

// Get Friends List


// export const getFriends = async (req, res) => {
//   try {
//     const userId = new mongoose.Types.ObjectId(req.user.id);

//     const friendships = await Friendship.find({
//       status: "Accepted",
//       $or: [{ user1: userId }, { user2: userId }]
//     })
//       .populate("user1 user2", "Name age profilePic")
//       .lean();

//     if (!friendships.length) {
//       return res.status(200).json({ success: true, message: "No friends found", data: { friends: [] } });
//     }

//     const friendList = friendships.map(f => {
//       const friend = f.user1._id.toString() === userId.toString() ? f.user2 : f.user1;

//       return {
//         userId: friend?._id,
//         name: `${friend?.Name?.firstName || "No"} ${friend?.Name?.lastName || "Name"}`,
//         age: friend?.age || null,
//         profilePic: friend?.profilePic || null
//       };
//     });

//     res.status(200).json({ success: true, message: "Friends fetched successfully", data: { friends: friendList } });
//   } catch (err) {
//     console.error("Error fetching friends:", err);
//     res.status(500).json({ success: false, message: "Server error", data: {} });
//   }
// };



// Unfriend a user
// export const unfriendUser = async (req, res) => {
//   try {
//     const userId = req.user.id;
//     const friendId = req.params.id;

//     // Find the accepted friendship
//     const friendship = await Friendship.findOne({
//       status: "Accepted",
//       $or: [
//         { user1: userId, user2: friendId },
//         { user1: friendId, user2: userId }
//       ]
//     });

//     if (!friendship) {
//       return res.status(400).json({ message: "Friendship does not exist" });
//     }

//     await friendship.deleteOne();

//     res.status(200).json({ message: "User unfriended successfully" });
//   } catch (err) {
//     res.status(500).json({ message: "Server error", error: err.message });
//   }
// };

// // Block a user
// export const blockUser = async (req, res) => {
//   try {
//     const userId = req.user.id;
//     const targetId = req.params.id;

//     if (userId === targetId)
//       return res.status(400).json({ message: "Cannot block yourself" });

//     // Check if a relationship exists
//     let relationship = await Friendship.findOne({
//       $or: [
//         { user1: userId, user2: targetId },
//         { user1: targetId, user2: userId }
//       ]
//     });

//     if (relationship) {
//       // Update existing relationship to Blocked
//       relationship.status = "Blocked";
//       relationship.actionBy = userId;
//       await relationship.save();
//     } else {
//       // Create a new Blocked relationship
//       relationship = await Friendship.create({
//         user1: userId,
//         user2: targetId,
//         status: "Blocked",
//         actionBy: userId
//       });
//     }

//     res.status(200).json({ message: "User blocked successfully", relationship });
//   } catch (err) {
//     res.status(500).json({ message: "Server error", error: err.message });
//   }
// };

// // Unblock a user
// export const unblockUser = async (req, res) => {
//   try {
//     const userId = req.user.id;
//     const targetId = req.params.id;

//     const relationship = await Friendship.findOne({
//       $or: [
//         { user1: userId, user2: targetId, status: "Blocked" },
//         { user1: targetId, user2: userId, status: "Blocked" }
//       ],
//       actionBy: userId // Only blocker can unblock
//     });

//     if (!relationship) {
//       return res.status(400).json({ message: "No blocked relationship found" });
//     }

//     await relationship.deleteOne();
//     res.status(200).json({ message: "User unblocked successfully" });
//   } catch (err) {
//     res.status(500).json({ message: "Server error", error: err.message });
//   }
// };
// Toggle Block / Unblock User
// export const toggleBlockUser = async (req, res) => {
//   try {
//     const userId = req.user.id;
//     const targetId = req.params.id;
 
//     if (userId === targetId)
//       return res.status(400).json({ message: "Cannot block yourself" });
 
//     // Find existing relationship
//     let relationship = await Friendship.findOne({
//       $or: [
//         { user1: userId, user2: targetId },
//         { user1: targetId, user2: userId }
//       ]
//     });
 
//     // ✅ Case 1: Already blocked by this user → Unblock
//     if (
//       relationship &&
//       relationship.status === "Blocked" &&
//       relationship.actionBy.toString() === userId
//     ) {
//       await relationship.deleteOne();
//       return res.status(200).json({
//         message: "User unblocked successfully",
//         blocked: false
//       });
//     }
 
//     // ✅ Case 2: Not blocked yet → Block
//     if (relationship) {
//       relationship.status = "Blocked";
//       relationship.actionBy = userId;
//       await relationship.save();
//     } else {
//       relationship = await Friendship.create({
//         user1: userId,
//         user2: targetId,
//         status: "Blocked",
//         actionBy: userId
//       });
//     }
 
//     return res.status(200).json({
//       message: "User blocked successfully",
//       blocked: true,
//       relationship
//     });
//   } catch (err) {
//     console.error("toggleBlockUser error:", err);
//     res.status(500).json({ message: "Server error", error: err.message });
//   }
// };

// export const toggleBlockUser = async (req, res) => {
//   try {
//     const userId = req.user.id;
//     const targetId = req.params.id;
 
//     if (userId === targetId)
//       return res.status(400).json({ message: "Cannot block yourself" });
 
//     // Find existing relationship
//     let relationship = await Friendship.findOne({
//       $or: [
//         { user1: userId, user2: targetId },
//         { user1: targetId, user2: userId }
//       ]
//     });
 
//     // ✅ Case 1: Already blocked by this user → Unblock
//     if (
//       relationship &&
//       relationship.status === "Blocked" &&
//       relationship.actionBy.toString() === userId
//     ) {
//       await relationship.deleteOne();
//       return res.status(200).json({
//         message: "User unblocked successfully",
//            status: "Unblocked",
//         blocked: false
//       });
//     }
 
//     // ✅ Case 2: Not blocked yet → Block
//     if (relationship) {
//       relationship.status = "Blocked";
//       relationship.actionBy = userId;
//       await relationship.save();
//     } else {
//       relationship = await Friendship.create({
//         user1: userId,
//         user2: targetId,
//         status: "Blocked",
//         actionBy: userId
//       });
//     }
 
//     return res.status(200).json({
//       message: "User blocked successfully",
//       blocked: true,
//       relationship
//     });
//   } catch (err) {
//     console.error("toggleBlockUser error:", err);
//     res.status(500).json({ message: "Server error", error: err.message });
//   }
// };


import User from "../models/User.js";
import Friendship from "../models/Friendship.js";
import mongoose from "mongoose";
import Like from "../models/Likes.js";

export const toggleFriendRequest = async (req, res) => {
  try {
    const fromUserId = req.user.id;
    const toUserId = req.params.id;
 
    if (fromUserId === toUserId)
      return res.status(400).json({ message: "Cannot send request to yourself" });
 
    const existing = await Friendship.findOne({
      $or: [
        { user1: fromUserId, user2: toUserId },
        { user1: toUserId, user2: fromUserId }
      ]
    });
 
    if (existing) {
      // Case 1: Cancel pending request (only sender can cancel)
      if (existing.status === "Pending" && existing.actionBy.toString() === fromUserId) {
        existing.status = "Cancelled";
        existing.cancelledAt = new Date();
        await existing.save();
        return res.status(200).json({
          message: "Friend request cancelled",
          sent: false,
          status: existing.status
        });
      }
 
      // Case 2: Re-send after cancellation
      if (existing.status === "Cancelled") {
        existing.status = "Pending";
        existing.actionBy = fromUserId;
        existing.sentAt = new Date();
        await existing.save();
        return res.status(200).json({
          message: "Friend request re-sent",
          sent: true,
          status: existing.status
        });
      }
 
      // Case 3: Re-send after rejection
      if (existing.status === "Rejected") {
        existing.status = "Pending";
        existing.actionBy = fromUserId;
        existing.sentAt = new Date();
        await existing.save();
        return res.status(200).json({
          message: "Friend request sent again after rejection",
          sent: true,
          status: existing.status
        });
      }
 
      // Case 4: Already friends
      if (existing.status === "Accepted") {
        return res.status(400).json({
          message: "You are already friends",
          status: existing.status
        });
      }
 
      // Case 5: Pending request by other user (cannot send again)
      if (existing.status === "Pending" && existing.actionBy.toString() !== fromUserId) {
        return res.status(400).json({
          message: "Friend request already sent by the other user",
          status: existing.status
        });
      }
    }
 
    // Case 6: No record, create fresh request
    const request = await Friendship.create({
      user1: fromUserId,
      user2: toUserId,
      actionBy: fromUserId,
      status: "Pending",
      sentAt: new Date()
    });
 
    await User.findByIdAndUpdate(fromUserId, { $inc: { "usage.requestsSent": 1 } });
 
    res.status(201).json({
      message: "Friend request sent",
      sent: true,
      status: request.status,
      request
    });
  } catch (err) {
    console.error("toggleFriendRequest error:", err);
    res.status(500).json({ message: "Server error", error: err.message });
  }
};

export const cancelFriendRequest = async (req, res) => {
  try {
    const userId = req.user.id;
    const requestId = req.params.id;

    const request = await Friendship.findById(requestId);

    if (!request) {
      return res.status(404).json({ message: "Request not found" });
    }

    // Only sender can cancel
    if (request.user1.toString() !== userId) {
      return res.status(403).json({ message: "You are not allowed to cancel this request" });
    }

    if (request.status !== "Pending") {
      return res.status(400).json({ message: "Only pending requests can be cancelled" });
    }

    request.status = "Cancelled";
    request.cancelledAt = new Date();
    await request.save();

    res.status(200).json({ message: "Friend request cancelled successfully", status: request.status });
  } catch (err) {
    console.error("cancelSentRequest error:", err);
    res.status(500).json({ message: "Server error", error: err.message });
  }
};



export const acceptFriendRequest = async (req, res) => {
  try {
    const userId = req.user.id;        // Current logged-in user (receiver)
    const fromUserId = req.params.id;  // The user who originally sent the request
 
    // Find a pending request where current user is the receiver
    const request = await Friendship.findOne({
      status: "Pending",
      $or: [
        { user1: fromUserId, user2: userId },
        { user1: userId, user2: fromUserId }
      ]
    });
 
    if (!request) {
      return res.status(400).json({ message: "No pending request from this user" });
    }
 
    // Extra check: already friends
    const alreadyFriend = await Friendship.findOne({
      status: "Accepted",
      $or: [
        { user1: fromUserId, user2: userId },
        { user1: userId, user2: fromUserId }
      ]
    });
 
    if (alreadyFriend) {
      return res.status(400).json({ message: "You are already friends" });
    }
 
    // Accept request
    request.status = "Accepted";
    request.actionBy = userId;
    await request.save();
 
    res.status(200).json({ message: "Friend request accepted", accepted: true });
  } catch (err) {
    console.error("acceptFriendRequest error:", err);
    res.status(500).json({ message: "Server error", error: err.message });
  }
};


export const rejectFriendRequest = async (req, res) => {
  try {
    const userId = req.user.id;          // Current logged-in user (receiver)
    const fromUserId = req.params.id;    // User who sent the request
 
    // Find a pending request where current user is the receiver
    const request = await Friendship.findOne({
      status: "Pending",
      user1: fromUserId,    // sender
      user2: userId         // receiver
    });
 
    if (!request) {
      return res.status(400).json({ message: "No pending request to reject" });
    }
 
    // Reject the request
    request.status = "Rejected";
    request.actionBy = userId;
    request.rejectedAt = new Date();
    await request.save();
 
    res.status(200).json({ message: "Friend request rejected" });
  } catch (err) {
    console.error("rejectFriendRequest error:", err);
    res.status(500).json({ message: "Server error", error: err.message });
  }
};

export const getPendingRequests = async (req, res) => {
  try {
    const userId = req.user.id;
    const requests = await Friendship.find({ user2: userId, status: "Pending" })
      .populate("user1", "Name email age profilePic")
      .lean();

    res.status(200).json({ requests });
  } catch (err) {
    res.status(500).json({ message: "Server error", error: err.message });
  }
};

// Get pending requests received by the current user
export const getSentRequests = async (req, res) => {
  try {
    const userId = req.user.id;

    // ✅ Find all pending requests where current user is the sender
    const requests = await Friendship.find({ user1: userId, status: "Pending" })
      .populate("user2", "Name email age profilePic") // receiver info
      .lean();

    const formattedRequests = requests.map((request) => ({
      id: request._id,
      name: `${request.user2?.Name?.firstName || ""} ${request.user2?.Name?.lastName || ""}`.trim() || "No Name",
      to: request.user2,             // receiver info
      status: request.status,        // Should always be "Pending" here
      actionBy: request.actionBy,
      sentAt: request.createdAt || null,
    }));

    res.status(200).json({ requests: formattedRequests });
  } catch (err) {
    console.error("getSentRequests error:", err);
    res.status(500).json({ message: "Server error", error: err.message });
  }
};


export const getFriends = async (req, res) => {
  try {
    const userId = new mongoose.Types.ObjectId(req.user.id);

    // Fetch all accepted friendships where the current user is either user1 or user2
    const friendships = await Friendship.find({
      status: "Accepted",
      $or: [{ user1: userId }, { user2: userId }]
    })
      .populate("user1", "Name age profilePic bio location hobbies")
      .populate("user2", "Name age profilePic bio location hobbies")
      .lean();

    if (!friendships.length) {
      return res.status(200).json({ success: true, message: "No friends found", data: { friends: [] } });
    }

    // Prepare friend list
    const friendList = await Promise.all(
      friendships.map(async f => {
        const friend = f.user1._id.toString() === userId.toString() ? f.user2 : f.user1;

        if (!friend) return null;

        // Check if the login user liked this friend
        const liked = await Like.exists({ liker: userId, liked: friend._id });

        return {
          _id: friend._id,
          name: `${friend?.Name?.firstName || ""} ${friend?.Name?.lastName || ""}`.trim() || "No Name",
          age: friend?.age || null,
          profilePic: friend?.profilePic || null,
          bio: friend?.bio || "",
          location: {
            city: friend?.location?.city || "",
            country: friend?.location?.country || ""
          },
          hobbies: friend?.hobbies || [],
          friendshipStatus: "Friend", // All are accepted friendships
          likedByMe: !!liked
        };
      })
    );

    res.status(200).json({
      success: true,
      message: "Friends fetched successfully",
      data: { friends: friendList.filter(f => f !== null) } // Remove any null entries
    });
  } catch (err) {
    console.error("Error fetching friends:", err);
    res.status(500).json({ success: false, message: "Server error", data: {} });
  }
};


export const unfriendUser = async (req, res) => {
  try {
    const userId = req.user.id;
    const friendId = req.params.id;

    // Find the accepted friendship
    const friendship = await Friendship.findOne({
      status: "Accepted",
      $or: [
        { user1: userId, user2: friendId },
        { user1: friendId, user2: userId }
      ]
    });

    if (!friendship) {
      return res.status(400).json({ message: "Friendship does not exist" });
    }

    await friendship.deleteOne();

    res.status(200).json({ message: "User unfriended successfully" });
  } catch (err) {
    res.status(500).json({ message: "Server error", error: err.message });
  }
};

export const toggleBlockUser = async (req, res) => {
  try {
    const userId = req.user.id;
    const targetId = req.params.id;
 
    if (userId === targetId)
      return res.status(400).json({ message: "Cannot block yourself" });
 
    // Find existing relationship
    let relationship = await Friendship.findOne({
      $or: [
        { user1: userId, user2: targetId },
        { user1: targetId, user2: userId }
      ]
    });
 
    // ✅ Case 1: Already blocked by this user → Unblock
    if (
      relationship &&
      relationship.status === "Blocked" &&
      relationship.actionBy.toString() === userId
    ) {
      await relationship.deleteOne();
      return res.status(200).json({
        message: "User unblocked successfully",
           status: "Unblocked",
        blocked: false
      });
    }
 
    // ✅ Case 2: Not blocked yet → Block
    if (relationship) {
      relationship.status = "Blocked";
      relationship.actionBy = userId;
      await relationship.save();
    } else {
      relationship = await Friendship.create({
        user1: userId,
        user2: targetId,
        status: "Blocked",
        actionBy: userId
      });
    }
 
    return res.status(200).json({
      message: "User blocked successfully",
      blocked: true,
      relationship
    });
  } catch (err) {
    console.error("toggleBlockUser error:", err);
    res.status(500).json({ message: "Server error", error: err.message });
  }
};

// GET /api/friends/blocked
export const getBlockedUsers = async (req, res) => {
  try {
    const userId = req.user.id;
 
    // Find all friendships where this user has blocked someone
    const blockedRelationships = await Friendship.find({
      status: "Blocked",
      actionBy: userId
    }).populate({
      path: "user1 user2",
      select: "_id Name email profilePic" // only select necessary fields
    });
 
    const blockedUsers = blockedRelationships
  .map(rel => {
 
    if (!rel.user1 || !rel.user2) return null;
 
    const isUser1 = rel.user1._id.toString() === userId;
    const target = isUser1 ? rel.user2 : rel.user1;
 
    if (!target) return null;
 
    return {
      id: target._id,
      name: `${target?.Name?.firstName || ""} ${target?.Name?.lastName || ""}`.trim() || "No Name",
      profilePic: target.profilePic,
      blockedAt: rel.updatedAt || rel.createdAt
    };
  })
  .filter(Boolean);
 
 
    return res.status(200).json({ blockedUsers, count: blockedUsers.length });
  } catch (err) {
    console.error("getBlockedUsers error:", err);
    return res.status(500).json({ message: "Server error", error: err.message });
  }
};