import express from 'express';
import { protectedAuth, allowRoles } from '../middleware/common/protectedAuth.js';
import {
  createLocationRequest,
  createUnauthenticatedLocationRequest,
  listLocationRequests,
  reviewLocationRequest,
  listAllowedLocations,
  revokeAllowedLocation,
  deleteAllowedLocation,
  deleteLocationRequest,
  stopAccessByRequest,
  startAccessByRequest,
} from '../controllers/location.controller.js';

const router = express.Router();

// Admin/Agent: submit request (authenticated)
router.post('/requests', protectedAuth, allowRoles('admin', 'agent'), createLocationRequest);

// Unauthenticated request for initial setup (when user can't login)
router.post('/requests/unauthenticated', createUnauthenticatedLocationRequest);

// Superadmin & Admin: list requests
router.get('/requests', protectedAuth, allowRoles('superadmin', 'admin'), listLocationRequests);

// Superadmin & Admin: review request
router.put('/requests/:id/review', protectedAuth, allowRoles('superadmin', 'admin'), reviewLocationRequest);

// List my allowed locations (admin/agent), or query specific roleId if superadmin
router.get('/allowed', protectedAuth, listAllowedLocations);

// Superadmin & Admin: revoke allowed location
router.put('/allowed/:id/revoke', protectedAuth, allowRoles('superadmin', 'admin'), revokeAllowedLocation);

// Superadmin & Admin: delete allowed location permanently
router.delete('/allowed/:id', protectedAuth, allowRoles('superadmin', 'admin'), deleteAllowedLocation);

// Superadmin & Admin: delete location request permanently
router.delete('/requests/:requestId', protectedAuth, allowRoles('superadmin', 'admin'), deleteLocationRequest);

// Superadmin & Admin: stop access by request ID
router.put('/requests/:id/stop-access', protectedAuth, allowRoles('superadmin', 'admin'), stopAccessByRequest);

// Superadmin & Admin: start access by request ID
router.put('/requests/:id/start-access', protectedAuth, allowRoles('superadmin', 'admin'), startAccessByRequest);

export default router;
