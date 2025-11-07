import express from 'express';
import { protectedUser } from '../middleware/common/protectedUser.js';
import { createCheckout, verifyPayment } from '../controllers/payment.controller.js';

const router = express.Router();

router.post('/checkout', protectedUser, createCheckout);
router.post('/verify', protectedUser, verifyPayment);

export default router;
