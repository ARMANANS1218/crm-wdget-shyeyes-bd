import Plan from '../models/Plan.js';
import { createOrReplaceSubscription } from './subscription.controller.js';

// Evaluate bypass at request-time to avoid dotenv load-order issues
const isBypass = () => {
  const val = String(process.env.PAYMENT_BYPASS || '').toLowerCase().trim();
  return val === 'true' || val === '1' || val === 'yes';
};

// POST /api/payments/checkout
// Body: { planId }
export const createCheckout = async (req, res) => {
  try {
    const { planId } = req.body;
    const plan = await Plan.findById(planId);
    if (!plan) return res.status(404).json({ success: false, message: 'Plan not found' });
    // Free plan: return a zero-amount order so client can proceed to verify
    if (Number(plan.price) === 0) {
      return res.json({
        success: true,
        order: {
          id: `order_free_${Date.now()}`,
          amount: 0,
          currency: 'INR',
          planId: plan._id,
        },
        bypass: true
      });
    }
    if (isBypass()) {
      // Return a fake order that frontend can treat as created
      return res.json({
        success: true,
        order: {
          id: `order_mock_${Date.now()}`,
          amount: plan.price,
          currency: 'INR',
          planId: plan._id,
        },
        bypass: true
      });
    }
    // TODO: integrate Razorpay order creation here when enabling gateway
    return res.status(501).json({ success: false, message: 'Real gateway not enabled yet' });
  } catch (err) {
    console.error('createCheckout error:', err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

// POST /api/payments/verify
// Body: { planId, orderId, paymentId, signature }
export const verifyPayment = async (req, res) => {
  try {
    const userId = req.user.id;
    const { planId } = req.body;
    const plan = await Plan.findById(planId);
    if (!plan) return res.status(404).json({ success: false, message: 'Plan not found' });

    // If plan is free (price 0), grant immediately without payment
    if (Number(plan.price) === 0) {
      const subscription = await createOrReplaceSubscription(userId, plan, 0);
      return res.json({ success: true, message: 'Free plan activated', subscription, bypass: true });
    }

    if (isBypass()) {
      // Directly grant subscription
      const subscription = await createOrReplaceSubscription(userId, plan, plan.price);
      return res.json({ success: true, message: 'Payment bypassed, subscription granted', subscription, bypass: true });
    }
    // TODO: verify Razorpay signature and payment status, then grant
    return res.status(501).json({ success: false, message: 'Real gateway not enabled yet' });
  } catch (err) {
    console.error('verifyPayment error:', err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
};
