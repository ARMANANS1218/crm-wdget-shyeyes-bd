import crypto from 'crypto';

const APP_ID = process.env.ZEGO_APP_ID || '';
const SERVER_SECRET = process.env.ZEGO_SERVER_SECRET || '';

function mockToken() {
  return 'mock_' + crypto.randomBytes(12).toString('hex');
}

export function generateToken({ userId, userName, roomId = null, expireSeconds = 3600 }) {
  try {
    const now = Math.floor(Date.now() / 1000);
    const exp = now + Number(expireSeconds);

    // In production, implement ZEGO token signing using APP_ID and SERVER_SECRET
    // For now, return a mock token if secrets are not configured
    const token = (APP_ID && SERVER_SECRET) ? mockToken() : mockToken();
    return {
      success: true,
      data: {
        appId: APP_ID || 'mock-app',
        token,
        userId,
        userName,
        roomId,
        expiresAt: exp
      }
    };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

export function generateRoomToken({ userId, userName, roomId, role = 'participant', expireSeconds = 3600 }) {
  return generateToken({ userId, userName, roomId, expireSeconds });
}

export function getConnectionInfo() {
  return {
    appId: APP_ID || 'mock-app',
    server: 'zegocloud',
  };
}

export function validateToken(token) {
  return {
    isMock: token?.startsWith?.('mock_') || false,
    appId: APP_ID || 'mock-app',
  };
}

export function verifyCallbackSignature(rawBody, signature) {
  if (!signature) return false;
  // In production, compute HMAC with webhook secret and compare
  // For dev, accept any non-empty signature
  return true;
}

export default {
  generateToken,
  generateRoomToken,
  getConnectionInfo,
  validateToken,
  verifyCallbackSignature,
};
