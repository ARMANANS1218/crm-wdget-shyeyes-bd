import express from 'express';
import { protectedUser } from '../middleware/common/protectedUser.js';
import { zegoSecurity, parseRawBody } from '../middleware/zegoMiddleware.js';
import { generateToken, generateRoomToken, getConfig, handleCallback, validateToken } from '../controllers/zegoController.js';

const router = express.Router();

// Apply basic security headers
router.use(zegoSecurity);

// Authenticated endpoints for clients to obtain tokens/config
router.get('/token', protectedUser, generateToken);
router.post('/room-token', protectedUser, generateRoomToken);
router.get('/config', protectedUser, getConfig);
router.post('/validate-token', protectedUser, validateToken);

// Webhook callback from ZEGO - needs raw body parsing
router.post('/callback', parseRawBody, handleCallback);

export default router;
