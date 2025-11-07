import Plan from '../../models/Plan.js';
import Subscription from '../../models/Subscription.js';
import User from '../../models/User.js';
import mongoose from 'mongoose';

/**
 * @desc    Update an existing plan
 * @route   PUT /api/plans/admin/:planId
 * @access  Admin only
 */
export const updatePlan = async (req, res) => {
  try {
    const { planId } = req.params;
  const { planType, price, durationDays, limits = {}, isActive } = req.body;

    // Validate ObjectId
    if (!mongoose.Types.ObjectId.isValid(planId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid plan ID format"
      });
    }

    // Find the plan
    const existingPlan = await Plan.findById(planId);
    if (!existingPlan) {
      return res.status(404).json({
        success: false,
        message: "Plan not found"
      });
    }

    // Validate plan type if provided
    if (planType && !["free", "basic", "standard", "premium"].includes(planType)) {
      return res.status(400).json({
        success: false,
        message: "Invalid plan type. Must be: free, basic, standard, or premium"
      });
    }

    // Validate price
    if (price !== undefined && (typeof price !== 'number' || price < 0)) {
      return res.status(400).json({
        success: false,
        message: "Price must be a non-negative number"
      });
    }

    // Validate duration
    if (durationDays !== undefined && (typeof durationDays !== 'number' || durationDays < 1)) {
      return res.status(400).json({
        success: false,
        message: "Duration must be at least 1 day"
      });
    }

    // Normalize limits (accept legacy keys and coerce blanks to 0)
    let limitsPatch = undefined;
    if (limits && typeof limits === 'object') {
      const toInt = (v) => {
        if (v === null || v === undefined || v === '') return 0;
        const n = Number(v);
        return Number.isFinite(n) && n >= 0 ? n : 0;
      };
      limitsPatch = {
        totalMessagesAllowed: toInt(limits.totalMessagesAllowed ?? limits.messagesPerDay),
        totalAudioTimeSeconds: toInt(limits.totalAudioTimeSeconds ?? limits.audioTimeSeconds ?? (limits.audioTimeMinutes ? Number(limits.audioTimeMinutes) * 60 : undefined)),
        totalVideoTimeSeconds: toInt(limits.totalVideoTimeSeconds ?? limits.videoTimeSeconds ?? (limits.videoTimeMinutes ? Number(limits.videoTimeMinutes) * 60 : undefined)),
        matchesAllowed: toInt(limits.matchesAllowed),
      };
    }

    // Update plan
    const updatedPlan = await Plan.findByIdAndUpdate(
      planId,
      {
        ...(planType && { planType }),
        ...(price !== undefined && { price }),
        ...(durationDays !== undefined && { durationDays }),
        ...(limitsPatch && { limits: limitsPatch }),
        ...(isActive !== undefined && { isActive }),
        updatedAt: new Date()
      },
      { new: true, runValidators: true }
    );

    res.status(200).json({
      success: true,
      message: "Plan updated successfully",
      plan: updatedPlan
    });

  } catch (error) {
    console.error("❌ updatePlan error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to update plan",
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

/**
 * @desc    Delete a plan (soft delete - mark as inactive)
 * @route   DELETE /api/plans/admin/:planId
 * @access  Admin only
 */
export const deletePlan = async (req, res) => {
  try {
    const { planId } = req.params;
    const { forceDelete = false } = req.query;

    // Validate ObjectId
    if (!mongoose.Types.ObjectId.isValid(planId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid plan ID format"
      });
    }

    // Find the plan
    const plan = await Plan.findById(planId);
    if (!plan) {
      return res.status(404).json({
        success: false,
        message: "Plan not found"
      });
    }

    // Check if plan has active subscriptions
    const activeSubscriptions = await Subscription.countDocuments({
      planId,
      endDate: { $gt: new Date() }
    });

    if (activeSubscriptions > 0 && forceDelete !== 'true') {
      return res.status(400).json({
        success: false,
        message: `Cannot delete plan. ${activeSubscriptions} users are currently subscribed to this plan.`,
        activeSubscriptions,
        suggestion: "Use forceDelete=true query parameter to force deletion or deactivate the plan instead."
      });
    }

    if (forceDelete === 'true') {
      // Hard delete - remove plan completely
      await Plan.findByIdAndDelete(planId);
      
      // Update affected subscriptions to mark them as discontinued
      await Subscription.updateMany(
        { planId },
        { 
          $set: { 
            status: 'discontinued',
            discontinuedAt: new Date(),
            discontinuedReason: 'Plan deleted by admin'
          }
        }
      );

      res.status(200).json({
        success: true,
        message: "Plan permanently deleted",
        affectedSubscriptions: activeSubscriptions
      });
    } else {
      // Soft delete - mark as inactive
      const updatedPlan = await Plan.findByIdAndUpdate(
        planId,
        { 
          isActive: false,
          deactivatedAt: new Date(),
          deactivatedBy: req.user._id
        },
        { new: true }
      );

      res.status(200).json({
        success: true,
        message: "Plan deactivated successfully",
        plan: updatedPlan
      });
    }

  } catch (error) {
    console.error("❌ deletePlan error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to delete plan",
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

/**
 * @desc    Get comprehensive plan statistics
 * @route   GET /api/plans/admin/stats
 * @access  Admin only
 */
export const getPlanStats = async (req, res) => {
  try {
    // Get all plans with subscription counts
    const planStats = await Plan.aggregate([
      {
        $lookup: {
          from: 'subscriptions',
          localField: '_id',
          foreignField: 'planId',
          as: 'subscriptions'
        }
      },
      {
        $addFields: {
          totalSubscriptions: { $size: '$subscriptions' },
          activeSubscriptions: {
            $size: {
              $filter: {
                input: '$subscriptions',
                cond: { $gt: ['$$this.endDate', new Date()] }
              }
            }
          },
          expiredSubscriptions: {
            $size: {
              $filter: {
                input: '$subscriptions',
                cond: { $lte: ['$$this.endDate', new Date()] }
              }
            }
          },
          totalRevenue: {
            $multiply: [
              '$price',
              { $size: '$subscriptions' }
            ]
          }
        }
      },
      {
        $project: {
          subscriptions: 0 // Remove the full subscriptions array to keep response clean
        }
      },
      {
        $sort: { planType: 1 }
      }
    ]);

    // Get overall statistics
    const totalPlans = await Plan.countDocuments();
    const activePlans = await Plan.countDocuments({ isActive: true });
    const totalUsers = await User.countDocuments();
    const subscribedUsers = await User.countDocuments({ membership: { $ne: null } });

    // Get subscription trends (last 30 days)
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const recentSubscriptions = await Subscription.aggregate([
      {
        $match: {
          purchasedAt: { $gte: thirtyDaysAgo }
        }
      },
      {
        $group: {
          _id: '$planType',
          count: { $sum: 1 },
          revenue: { $sum: '$planId.price' }
        }
      }
    ]);

    // Calculate total revenue
    const totalRevenue = planStats.reduce((sum, plan) => sum + plan.totalRevenue, 0);

    res.status(200).json({
      success: true,
      message: "Plan statistics retrieved successfully",
      data: {
        overview: {
          totalPlans,
          activePlans,
          inactivePlans: totalPlans - activePlans,
          totalUsers,
          subscribedUsers,
          freeUsers: totalUsers - subscribedUsers,
          totalRevenue
        },
        planDetails: planStats,
        recentTrends: {
          last30Days: recentSubscriptions,
          periodStart: thirtyDaysAgo,
          periodEnd: new Date()
        }
      }
    });

  } catch (error) {
    console.error("❌ getPlanStats error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to retrieve plan statistics",
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

/**
 * @desc    Get all users with their subscription details
 * @route   GET /api/plans/admin/users/all
 * @access  Admin only
 */
export const getAllSubscribedUsers = async (req, res) => {
  try {
    const { 
      page = 1, 
      limit = 20, 
      sortBy = 'createdAt', 
      sortOrder = 'desc',
      planType = null,
      includeExpired = false 
    } = req.query;
    
    const skip = (parseInt(page) - 1) * parseInt(limit);
    const sort = { [`user.${sortBy}`]: sortOrder === 'desc' ? -1 : 1 };

    // Build match conditions for subscriptions
    const matchConditions = {};

    // Add plan type filter if specified
    if (planType && ['free', 'basic', 'standard', 'premium'].includes(planType.toLowerCase())) {
      matchConditions.planType = planType.toLowerCase();
    }

    // Add expiry filter if not including expired subscriptions
    if (!includeExpired || includeExpired === 'false') {
      matchConditions.endDate = { $gt: new Date() };
    }

    // Build aggregation pipeline starting from Subscription collection
    const pipeline = [
      { $match: matchConditions },
      {
        $lookup: {
          from: 'users',
          localField: 'userId',
          foreignField: '_id',
          as: 'user'
        }
      },
      { $unwind: '$user' },
      {
        $lookup: {
          from: 'plans',
          localField: 'planId',
          foreignField: '_id',
          as: 'plan'
        }
      },      
      { $unwind: '$plan' },
      {
        $project: {
          _id: '$user._id',
          firstName: '$user.firstName',
          lastName: '$user.lastName',
          Name: '$user.Name',
          email: '$user.email',
          profilePic: '$user.profilePic',
          createdAt: '$user.createdAt',
          membershipStart: '$user.membershipStart',
          membershipExpiry: '$user.membershipExpiry',
          subscription: {
            _id: '$_id',
            planType: '$planType',
            paidAmount: '$paidAmount',
            startDate: '$startDate',
            endDate: '$endDate',
            purchasedAt: '$purchasedAt',
            isActive: { $gt: ['$endDate', new Date()] }
          },
          plan: {
            _id: '$plan._id',
            planType: '$plan.planType',
            price: '$plan.price',
            limits: '$plan.limits'
          }
        }
      },
      { $sort: sort },
      { $skip: skip },
      { $limit: parseInt(limit) }
    ];

    const users = await Subscription.aggregate(pipeline);

    // Calculate total count using the same aggregation logic
    const countPipeline = [
      { $match: matchConditions },
      {
        $lookup: {
          from: 'users',
          localField: 'userId',
          foreignField: '_id',
          as: 'user'
        }
      },
      { $unwind: '$user' },
      { $count: 'total' }
    ];
    
    const totalCountPipeline = await Subscription.aggregate(countPipeline);
    const totalCount = totalCountPipeline.length > 0 ? totalCountPipeline[0].total : 0;

    res.status(200).json({
      success: true,
      message: "Subscribed users retrieved successfully",
      data: {
        users,
        pagination: {
          currentPage: parseInt(page),
          totalPages: Math.ceil(totalCount / parseInt(limit)),
          totalCount,
          hasNextPage: (skip + users.length) < totalCount,
          hasPrevPage: parseInt(page) > 1
        },
        filters: {
          planType: planType || 'all',
          includeExpired: includeExpired === 'true'
        }
      }
    });

  } catch (error) {
    console.error("❌ getAllSubscribedUsers error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to retrieve subscribed users",
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

/**
 * @desc    Get users by specific plan type
 * @route   GET /api/plans/admin/users/:planType
 * @access  Admin only
 */
export const getUsersByPlanType = async (req, res) => {
  try {
    const { planType } = req.params;
    const { page = 1, limit = 20, includeExpired = false } = req.query;

    // Validate plan type
    if (!["free", "basic", "standard", "premium"].includes(planType)) {
      return res.status(400).json({
        success: false,
        message: "Invalid plan type. Must be: free, basic, standard, or premium"
      });
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);

    // Build match conditions for subscriptions
    const matchConditions = {
      planType: planType
    };

    // If not including expired, only show active subscriptions
    if (includeExpired !== 'true') {
      matchConditions.endDate = { $gt: new Date() };
    }

    const users = await Subscription.aggregate([
      {
        $match: matchConditions
      },
      {
        $lookup: {
          from: 'users',
          localField: 'userId',
          foreignField: '_id',
          as: 'user'
        }
      },
      {
        $unwind: '$user'
      },
      {
        $lookup: {
          from: 'plans',
          localField: 'planId',
          foreignField: '_id',
          as: 'plan'
        }
      },
      {
        $unwind: '$plan'
      },
      {
        $project: {
          _id: '$user._id',
          firstName: '$user.firstName',
          lastName: '$user.lastName',
          Name: '$user.Name',
          email: '$user.email',
          profilePic: '$user.profilePic',
          createdAt: '$user.createdAt',
          membershipStart: '$user.membershipStart',
          membershipExpiry: '$user.membershipExpiry',
          subscription: {
            _id: '$_id',
            planType: '$planType',
            startDate: '$startDate',
            endDate: '$endDate',
            purchasedAt: '$purchasedAt',
            isActive: { $gt: ['$endDate', new Date()] },
            usage: {
              messagesUsedToday: '$messagesUsedToday',
              audioTimeUsedToday: '$audioTimeUsedToday',
              videoTimeUsedToday: '$videoTimeUsedToday',
              totalMessagesUsed: '$totalMessagesUsed',
              totalAudioUsed: '$totalAudioUsed',
              totalVideoUsed: '$totalVideoUsed'
            }
          },
          plan: {
            _id: '$plan._id',
            planType: '$plan.planType',
            price: '$plan.price',
            limits: '$plan.limits'
          }
        }
      },
      { $sort: { purchasedAt: -1 } },
      { $skip: skip },
      { $limit: parseInt(limit) }
    ]);

    // Get total count for pagination
    const totalCountPipeline = [
      {
        $match: matchConditions
      },
      {
        $lookup: {
          from: 'users',
          localField: 'userId',
          foreignField: '_id',
          as: 'user'
        }
      },
      {
        $unwind: '$user'
      },
      {
        $count: 'total'
      }
    ];

    const countResult = await Subscription.aggregate(totalCountPipeline);
    const totalCount = countResult.length > 0 ? countResult[0].total : 0;

    res.status(200).json({
      success: true,
      message: `Users with ${planType} plan retrieved successfully`,
      data: {
        planType,
        users,
        pagination: {
          currentPage: parseInt(page),
          totalPages: Math.ceil(totalCount / parseInt(limit)),
          totalCount,
          hasNextPage: skip + users.length < totalCount,
          hasPrevPage: parseInt(page) > 1
        },
        filters: {
          includeExpired: includeExpired === 'true'
        }
      }
    });

  } catch (error) {
    console.error("❌ getUsersByPlanType error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to retrieve users by plan type",
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

/**
 * @desc    Get detailed plan information with usage analytics
 * @route   GET /api/plans/admin/:planId/details
 * @access  Admin only
 */
export const getPlanDetails = async (req, res) => {
  try {
    const { planId } = req.params;

    // Validate ObjectId
    if (!mongoose.Types.ObjectId.isValid(planId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid plan ID format"
      });
    }

    const planDetails = await Plan.aggregate([
      {
        $match: { _id: new mongoose.Types.ObjectId(planId) }
      },
      {
        $lookup: {
          from: 'subscriptions',
          localField: '_id',
          foreignField: 'planId',
          as: 'subscriptions'
        }
      },
      {
        $addFields: {
          totalSubscriptions: { $size: '$subscriptions' },
          activeSubscriptions: {
            $size: {
              $filter: {
                input: '$subscriptions',
                cond: { $gt: ['$$this.endDate', new Date()] }
              }
            }
          },
          totalRevenue: {
            $multiply: ['$price', { $size: '$subscriptions' }]
          },
          averageUsage: {
            $cond: {
              if: { $gt: [{ $size: '$subscriptions' }, 0] },
              then: {
                avgMessages: { $avg: '$subscriptions.totalMessagesUsed' },
                avgAudioTime: { $avg: '$subscriptions.totalAudioUsed' },
                avgVideoTime: { $avg: '$subscriptions.totalVideoUsed' }
              },
              else: null
            }
          }
        }
      },
      {
        $project: {
          subscriptions: 0 // Remove full subscriptions array for cleaner response
        }
      }
    ]);

    if (planDetails.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Plan not found"
      });
    }

    res.status(200).json({
      success: true,
      message: "Plan details retrieved successfully",
      data: planDetails[0]
    });

  } catch (error) {
    console.error("❌ getPlanDetails error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to retrieve plan details",
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};