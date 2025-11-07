import mongoose from "mongoose";

export const getFriendshipAggregationStages = (loginUserId, page = 1, limit = 20) => [
	// Lookup friendship relation between login user and target user
	{
		$lookup: {
			from: "friendships",
			let: { userId: "$_id" },
			pipeline: [
				{
					$match: {
						$expr: {
							$or: [
								{
									$and: [
										{ $eq: ["$user1", new mongoose.Types.ObjectId(loginUserId)] },
										{ $eq: ["$user2", "$$userId"] }
									]
								},
								{
									$and: [
										{ $eq: ["$user2", new mongoose.Types.ObjectId(loginUserId)] },
										{ $eq: ["$user1", "$$userId"] }
									]
								}
							]
						}
					}
				}
			],
			as: "friendship"
		}
	},

	// Add computed friendship status
	{
		$addFields: {
			friendshipStatus: {
				$cond: [
					{ $gt: [{ $size: "$friendship" }, 0] },
					{
						$let: {
							vars: { f: { $arrayElemAt: ["$friendship", 0] } },
							in: {
								$switch: {
									branches: [
										{ case: { $eq: ["$$f.status", "Accepted"] }, then: "Friend" },
										{
											case: {
												$and: [
													{ $eq: ["$$f.status", "Pending"] },
													{ $eq: ["$$f.user1", new mongoose.Types.ObjectId(loginUserId)] }
												]
											},
											then: "Requested"
										},
										{
											case: {
												$and: [
													{ $eq: ["$$f.status", "Pending"] },
													{ $eq: ["$$f.user2", new mongoose.Types.ObjectId(loginUserId)] }
												]
											},
											then: "Pending"
										},
										{ case: { $eq: ["$$f.status", "Rejected"] }, then: "Rejected" },
										{ case: { $eq: ["$$f.status", "Blocked"] }, then: "Blocked" },
										{ case: { $eq: ["$$f.status", "Cancelled"] }, then: "Cancelled" },
										{ case: { $eq: ["$$f.status", "Unblocked"] }, then: "Unblocked" }
									],
									default: "None"
								}
							}
						}
					},
					"None"
				]
			}
		}
	},

	// Lookup accepted friendships for each user (to calculate total friends)

	// Lookup accepted friends (for friendCount & friends list)
	{
		$lookup: {
			from: "friendships",
			let: { userId: "$_id" },
			pipeline: [
				{
					$match: {
						$expr: {
							$and: [
								{ $eq: ["$status", "Accepted"] },
								{ $or: [{ $eq: ["$user1", "$$userId"] }, { $eq: ["$user2", "$$userId"] }] }
							]
						}
					}
				},
				{
					$lookup: {
						from: "users",
						let: {
							friendId: {
								$cond: [
									{ $eq: ["$user1", "$$userId"] },
									"$user2",
									"$user1"
								]
							}
						},
						pipeline: [
							{
								$match: { $expr: { $eq: ["$_id", "$$friendId"] } }
							},
							{
								$project: { _id: 1, Name: 1, profilePic: 1 }
							}
						],
						as: "friendInfo"
					}
				},
				{ $unwind: "$friendInfo" },
				{ $replaceRoot: { newRoot: "$friendInfo" } }
			],
			as: "friendsList"
		}
	},

	// Lookup mutual friends
	{
		$lookup: {
			from: "friendships",
			let: { userId: "$_id" },
			pipeline: [
				{
					$match: {
						$expr: {
							$and: [
								{ $eq: ["$status", "Accepted"] },
								{
									$or: [
										{ $eq: ["$user1", "$$userId"] },
										{ $eq: ["$user2", "$$userId"] }
									]
								}
							]
						}
					}
				},
				{
					$project: {
						friendId: {
							$cond: [
								{ $eq: ["$user1", "$$userId"] },
								"$user2",
								"$user1"
							]
						}
					}
				}
			],
			as: "targetFriends"
		}
	},
	{
		$lookup: {
			from: "friendships",
			pipeline: [
				{
					$match: {
						$expr: {
							$and: [
								{ $eq: ["$status", "Accepted"] },
								{
									$or: [
										{ $eq: ["$user1", new mongoose.Types.ObjectId(loginUserId)] },
										{ $eq: ["$user2", new mongoose.Types.ObjectId(loginUserId)] }
									]
								}
							]
						}
					}
				},
				{
					$project: {
						friendId: {
							$cond: [
								{ $eq: ["$user1", new mongoose.Types.ObjectId(loginUserId)] },
								"$user2",
								"$user1"
							]
						}
					}
				}
			],
			as: "loginUserFriends"
		}
	},
	{
		$addFields: {
			mutualFriendsCount: {
				$size: {
					$setIntersection: ["$targetFriends.friendId", "$loginUserFriends.friendId"]
				}
			}
		}
	},

	// ✅ Lookup likes to check if login user liked this user
	{
		$lookup: {
			from: "likes",
			let: { targetUserId: "$_id" },
			pipeline: [
				{ $match: { $expr: { $and: [{ $eq: ["$liker", new mongoose.Types.ObjectId(loginUserId)] }, { $eq: ["$liked", "$$targetUserId"] }] } } }
			],
			as: "likedByMeData"
		}
	},
	{
		$addFields: {
			likedByMe: { $gt: [{ $size: "$likedByMeData" }, 0] }
		}
	},

	// Final projection
	{
		$project: {
			_id: 1,
			Name:1,
			gender:1,
			age: 1,
			profilePic: 1,
			location: {
				city: "$location.city",
				country: "$location.country"
			},
			photos:1,
			bio: 1,
			hobbies: 1,
			friendshipStatus: 1,
			friendCount: 1,
			mutualFriendsCount: 1,
			friendsList: 1,
			likedByMe: 1
		}
	},

	// Pagination
	{ $skip: (page - 1) * limit },
	{ $limit: limit }
];
