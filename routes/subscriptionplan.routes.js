import express from 'express';

import {
  getPlans,
  subscribePlan,
  getMySubscription,
  createPlan,
  checkRemainingPlan,
  debugDatabaseState,
  fixExistingSubscriptions,
  fixMySubscription,
  updateExistingPlans,
  normalizePlanLimits
} from '../controllers/subscription.controller.js';

// Import admin plan controllers
import {
  updatePlan,
  deletePlan,
  getPlanStats,
  getAllSubscribedUsers,
  getUsersByPlanType,
  getPlanDetails
} from '../controllers/admin/admin.plan.controller.js';

import { allowRoles, protectedAuth } from '../middleware/common/protectedAuth.js';
import { protectedUser } from '../middleware/common/protectedUser.js';

const router = express.Router();

// List all available membership plans
router.post('/', protectedAuth,allowRoles("admin"), createPlan);
router.get('/', getPlans);
router.get("/remaining",protectedUser, checkRemainingPlan);
// Subscribe to a plan
router.post('/subscribe/:planId', protectedUser, subscribePlan);

// Get current membership/subscription info
router.get('/me', protectedUser, getMySubscription);

// Self-service fix for user's own subscription
router.post('/fix-my-subscription', protectedUser, fixMySubscription);

// Debug endpoint to check database state
router.get('/debug-db', protectedAuth, debugDatabaseState);

// Migration endpoint to fix existing subscriptions
router.post('/fix-subscriptions', protectedAuth, allowRoles("admin"), fixExistingSubscriptions);

// Migration endpoint to update existing plans structure
router.post('/update-plans', protectedAuth, allowRoles("admin"), updateExistingPlans);
// Normalization endpoint to enforce 0 defaults where missing
router.post('/normalize-plans', protectedAuth, allowRoles("admin"), normalizePlanLimits);

// ===== ADMIN PLAN MANAGEMENT ROUTES =====
// 🔒 ADMIN ONLY - Plan CRUD Operations (Protected with Role Check)
router.put('/:planId', protectedAuth, allowRoles("admin"), updatePlan);
router.delete('/:planId', protectedAuth, allowRoles("admin"), deletePlan);

// 📊 SIMPLE PROTECTED ROUTES - View Statistics & Data (Any authenticated user)
router.get('/stats', protectedAuth, getPlanStats);
router.get('/:planId/details', protectedAuth, getPlanDetails);
router.get('/users/all', protectedAuth, getAllSubscribedUsers);

// 👥 SIMPLE PROTECTED ROUTES - View Users by Plan Type (Any authenticated user)
router.get('/users/free', protectedAuth, (req, res, next) => {
  req.params.planType = 'free';
  getUsersByPlanType(req, res, next);
});

router.get('/users/basic', protectedAuth, (req, res, next) => {
  req.params.planType = 'basic';
  getUsersByPlanType(req, res, next);
});

router.get('/users/standard', protectedAuth, (req, res, next) => {
  req.params.planType = 'standard';
  getUsersByPlanType(req, res, next);
});

router.get('/users/premium', protectedAuth, (req, res, next) => {
  req.params.planType = 'premium';
  getUsersByPlanType(req, res, next);
});

export default router;