import express from 'express';
import { protectedUser } from '../middleware/common/protectedUser.js';
import { startCallUsage, stopCallUsage } from '../controllers/usage.controller.js';

const router = express.Router();

router.post('/call/start', protectedUser, startCallUsage);
router.post('/call/stop', protectedUser, stopCallUsage);

export default router;
