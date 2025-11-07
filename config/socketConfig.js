// Socket.IO Production Configuration
export const socketConfig = {
  // CORS settings
  cors: {
    // Allow configured origins and any *.vercel.app in production
  origin: (origin, callback) => {
      const devOrigins = [
        "http://localhost:3000",
        "http://localhost:5173",
        "http://localhost:5174",
        "http://127.0.0.1:3000",
        "http://127.0.0.1:5174",
      ];

      // Allow non-browser clients (no origin) like curl or native apps
      if (!origin) return callback(null, true);

      const configured = (process.env.FRONTEND_URLs || process.env.FRONTEND_URLS || "")
        .split(",")
        .map(o => o.trim())
        .filter(Boolean);

  let hostname = '';
  try { hostname = new URL(origin).hostname; } catch { /* ignore invalid origin */ }

  const isLocal = devOrigins.includes(origin);
  const isConfigured = configured.includes(origin);
  const isVercel = hostname.endsWith('.vercel.app');

      if (process.env.NODE_ENV !== 'production') {
        return callback(null, isLocal || isConfigured);
      }

      if (isConfigured || isVercel) {
        return callback(null, true);
      }

      callback(new Error(`CORS blocked origin: ${origin}`));
    },
    methods: ["GET", "POST", "OPTIONS"],
    credentials: true
  },

  // Connection settings
  pingTimeout: 60000,
  pingInterval: 25000,
  upgradeTimeout: 10000,
  maxHttpBufferSize: 1e6, // 1MB

  // Transport settings
  transports: process.env.NODE_ENV === 'production' 
    ? ['websocket', 'polling'] 
    : ['websocket', 'polling'],

  // Compression
  compression: true,
  
  // Adapter settings for scaling (Redis adapter in production)
  adapter: null, // Will be set in server.js if needed

  // Rate limiting
  connectTimeout: 45000,
  
  // Security
  cookie: {
    name: "io",
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: "strict"
  }
};

// Connection limits per user
export const connectionLimits = {
  maxConnectionsPerUser: 3, // Multiple device support
  connectionTimeout: 30000, // 30 seconds
  maxRoomsPerUser: 10,
  maxMessageSize: 1000, // characters
  rateLimitMessages: 60, // messages per minute
  rateLimitWindow: 60000 // 1 minute
};

// Chat room settings
export const chatRoomConfig = {
  maxUsersPerRoom: 2, // 1-on-1 chat only
  roomIdFormat: 'chat_{userId1}_{userId2}',
  messageHistoryLimit: 100, // messages loaded initially
  typingTimeout: 3000, // 3 seconds
  deliveryTimeout: 5000, // 5 seconds
  readReceiptTimeout: 1000 // 1 second
};

// Error codes for standardized error handling
export const errorCodes = {
  AUTHENTICATION_FAILED: 'AUTH_001',
  SUBSCRIPTION_INVALID: 'SUB_001',
  SUBSCRIPTION_EXPIRED: 'SUB_002',
  MESSAGE_LIMIT_EXCEEDED: 'LIMIT_001',
  CALL_LIMIT_EXCEEDED: 'LIMIT_002',
  USER_NOT_FOUND: 'USER_001',
  USER_OFFLINE: 'USER_002',
  ROOM_JOIN_FAILED: 'ROOM_001',
  MESSAGE_SEND_FAILED: 'MSG_001',
  DATABASE_ERROR: 'DB_001',
  VALIDATION_ERROR: 'VAL_001',
  RATE_LIMIT_EXCEEDED: 'RATE_001'
};

export default {
  socketConfig,
  connectionLimits,
  chatRoomConfig,
  errorCodes
};