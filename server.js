import express from "express";
import dotenv from "dotenv";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import hpp from "hpp";
import compression from "compression";
import path from "path";
import { fileURLToPath } from "url";
import { Server } from "socket.io";
import { createServer } from "http";
import mongoose from "mongoose";
import { connectRedis } from "./config/redis.js";
import connectDB from "./config/db.js";
//import userRoutes from "./routes/user.routes.js";


import userAuthRoutes from "./routes/user.auth.routes.js"; 
import authRoutes from "./routes/auth.routes.js";
import friendRoutes from "./routes/friend.routes.js";
import likeRoutes from "./routes/like.routes.js";
import locationRoutes from "./routes/location.routes.js";


import adminRoutes from "./routes/admin/admin.routes.js"; 
import agentRoutes from "./routes/agent/agent.routes.js"; 
import superAdminRoutes from "./routes/superadmin/superadmin.routes.js";
import fs from "fs";


import chatNamespace from "./sockets/chat.namespace.js";
import notificationNamespace from "./sockets/notification.namespace.js";
import PresenceNamespace from "./sockets/presence.namespace.js";

import chatRoutes from "./routes/chat.routes.js"
import suscriptionPlanRoutes from "./routes/subscriptionplan.routes.js"
import notificationRoutes from "./routes/notification.routes.js"
import paymentRoutes from "./routes/payment.routes.js"
import usageRoutes from "./routes/usage.routes.js"
import emailConfigRoutes from "./routes/emailconfig.routes.js"
import xssClean from "./utils/xssClean.js";
import zegoRoutes from "./routes/zego.routes.js";
// import limiter from "./utils/reteLimiter.js";



// Load environment variables
dotenv.config();

// Connect to MongoDB
connectDB();

// Initialize app
const app = express();
const httpServer = createServer(app);
// ===== Middleware =====
app.use(express.json()); 

// 🔧 BOM Stripping Middleware (prevents UTF-8 BOM from causing parse or MIME issues)
app.use((req, res, next) => {
  const originalSend = res.send;
  res.send = function (body) {
    try {
      if (typeof body === 'string') {
        // Remove leading UTF-8 BOM if present
        body = body.replace(/^\uFEFF/, '');
      } else if (Buffer.isBuffer(body)) {
        // Check for BOM sequence EF BB BF
        if (body.length >= 3 && body[0] === 0xEF && body[1] === 0xBB && body[2] === 0xBF) {
          body = body.slice(3);
        }
      }
    } catch (e) {
      console.warn('BOM strip skipped:', e.message);
    }
    return originalSend.call(this, body);
  };
  next();
});

// ✅ CORS Configuration for Production (supports Vercel preview domains)
const allowedOrigins = [
  // Local development
  'http://localhost:5173',
  'http://localhost:5174',
  'http://localhost:5175',
  // Production frontend(s)
  'https://crm-wdget-shyeyes-fd.vercel.app',
  'https://shyeyes-frontend.vercel.app',
  'https://shyeyes.vercel.app',
  'https://bitmaxtest.com'
];

const vercelPreviewRegex = /^https:\/\/.+\.vercel\.app$/i;

const corsOptions = {
  origin: function (origin, callback) {
    // allow requests with no origin like mobile apps or curl/postman
    if (!origin) return callback(null, true);
    if (allowedOrigins.includes(origin) || vercelPreviewRegex.test(origin)) {
      return callback(null, true);
    }
    return callback(new Error('Not allowed by CORS: ' + origin));
  },
  methods: ['GET', 'HEAD', 'PUT', 'PATCH', 'POST', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept', 'Origin'],
  credentials: true,
  optionsSuccessStatus: 204
};

// ✅ Apply CORS globally (preflights handled by CORS and fallback below)
app.use(cors(corsOptions));

// Extra CORS safety net: echo allowed origin and handle OPTIONS early
app.use((req, res, next) => {
  const origin = req.headers.origin;
  const isAllowed = !origin || allowedOrigins.includes(origin) || vercelPreviewRegex.test(origin);
  if (isAllowed && origin) {
    res.header('Access-Control-Allow-Origin', origin);
    res.header('Vary', 'Origin');
    res.header('Access-Control-Allow-Credentials', 'true');
    res.header('Access-Control-Allow-Methods', 'GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With, Accept, Origin, Cache-Control, Pragma');
  }
  if (req.method === 'OPTIONS') {
    return res.sendStatus(204);
  }
  next();
});

// ✅ Security
app.use(hpp());
app.use(xssClean);
// app.use(limiter);


// ✅ Performance
app.use(compression());

// Logging in development
if (process.env.NODE_ENV === "development") {
  app.use(morgan("dev"));
}

// Security headers in production
if (process.env.NODE_ENV === "production") {
  app.use(helmet());
}

// ===== Serve static uploads folder =====
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

app.use("/uploads", express.static(path.join(__dirname, "uploads")));

// ===== Routes =====

// 🏥 Health Check Endpoint for Deployment Debugging
app.get('/health', (req, res) => {
  const healthStatus = {
    status: 'OK',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV,
    database: mongoose.connection.readyState === 1 ? 'Connected' : 'Disconnected',
    email: {
      configured: !!(process.env.EMAIL_USER && process.env.EMAIL_PASS),
      user: process.env.EMAIL_USER ? process.env.EMAIL_USER.substring(0, 3) + '***' : 'Not set'
    },
    cors: {
      allowedOrigins: allowedOrigins.length,
      hasVercelRegex: !!vercelPreviewRegex
    }
  };
  
  console.log('🏥 Health check requested:', healthStatus);
  res.json(healthStatus);
});

// 🧪 Test Email Endpoint (for debugging email issues)
app.post('/test-email', async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) {
      return res.status(400).json({ success: false, message: 'Email is required' });
    }

    const { sendMail } = await import('./utils/mailSender.js');
    const result = await sendMail(
      email,
      'Test Email from ShyEyes',
      '<h1>Test Email</h1><p>If you receive this, email service is working!</p><p>SendGrid verification status will be shown in server logs.</p>'
    );

    const responseData = { 
      success: result.success, 
      message: result.success ? 'Test email sent' : result.error,
      service: result.service || 'unknown'
    };

    if (result.needsVerification) {
      responseData.note = 'SendGrid sender email needs verification. Check server logs for instructions.';
    }

    res.json(responseData);
  } catch (error) {
    console.error('Test email error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

//app.use("/api/users", userRoutes);


// =============Routes========USers=========Maaz
app.use("/api/user",  userAuthRoutes );

// =============Routes========Friends========
app.use("/api/friends", friendRoutes );

// =============Routes========likes========
app.use("/api/likes", likeRoutes );

app.use("/api/auth", authRoutes  );


//------------------admin routes -----------------
app.use("/api/admin", adminRoutes );


//------------------agent routes -----------------
app.use("/api/agents", agentRoutes );
app.use("/api/agent", agentRoutes);

//------------------Super admin routes -----------------
app.use("/api/superadmin", superAdminRoutes );


//----------------plan-------------//

app.use("/api/plans", suscriptionPlanRoutes );
app.use("/api/chats", chatRoutes );
app.use("/api/notify", notificationRoutes);
app.use("/api/location", locationRoutes );
app.use("/api/payments", paymentRoutes );
app.use("/api/zego", zegoRoutes );
app.use("/api/usage", usageRoutes );
app.use("/api/email-configs", emailConfigRoutes );

// ===== Root Route =====
app.get("/", (req, res) => {
  res.status(200).json({ message: "Server is live" });
});

// Import Socket.IO configuration
import { socketConfig } from "./config/socketConfig.js";

const io = new Server(httpServer, socketConfig);

// Import chat controller to set Socket.IO instance
import { setSocketIO } from "./controllers/chat.controller.js";
import ChatLogger from "./utils/chatLogger.js";

// Set Socket.IO instance in chat controller
setSocketIO(io);

// Global Socket.IO middleware for logging and rate limiting
io.use((socket, next) => {
  ChatLogger.logSocketEvent('connection_attempt', socket.handshake.auth?.userId || 'anonymous');
  next();
});

// Clean old logs daily (in production)
if (process.env.NODE_ENV === 'production') {
  setInterval(() => {
    ChatLogger.cleanOldLogs(7); // Keep logs for 7 days
  }, 24 * 60 * 60 * 1000); // Run daily
}

// ===== Socket.IO Namespaces =====

const chatNsp = io.of("/chat");
chatNamespace(chatNsp);

const notificationNsp = io.of("/notification");
notificationNamespace(notificationNsp);

// Global presence namespace for website-wide online status
const presenceService = new PresenceNamespace(io);
console.log('🌐 Global Presence namespace initialized');

app.set("trust proxy", true);

// PLEASE DONT REMOVE THIS LINE , ITS TEMPORARILY DISABLED MY ARMAN 

// await connectRedis(); // Temporarily disabled



// ===== Start Server =====
const PORT = process.env.PORT || 5000;
const MODE = process.env.NODE_ENV || "development";

httpServer.listen(PORT, () => {
  console.log(`🚀 Server running in ${MODE} mode on http://localhost:${PORT}`);
});
