import { Server } from "socket.io";
import jwt from "jsonwebtoken";
import User from "../models/User.js";
import Subscription from "../models/Subscription.js";
import CallLog from "../models/CallLog.js";

// ====== SOCKET.IO INITIALIZATION ======
export default function initSocket(server) {
  const io = new Server(server, {
    cors: {
      origin: "*", // change in production
      methods: ["GET", "POST"]
    }
  });

  // ====== AUTH MIDDLEWARE ======
  io.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth?.token;
      if (!token) return next(new Error("No token"));

      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      const user = await User.findById(decoded.id);

      if (!user) return next(new Error("User not found"));

      const subscription = await Subscription.findOne({ user: user._id })
        .populate("plan");

      socket.user = user;
      socket.subscription = subscription;
      next();
    } catch (err) {
      console.error("Socket auth failed:", err.message);
      next(new Error("Authentication failed"));
    }
  });

  // ====== ON CONNECTION ======
  io.on("connection", (socket) => {
    console.log(`✅ User connected: ${socket.user._id}`);

    // ====== PRIVATE CHAT ======
    socket.on("private_message", async ({ to, content }, ack) => {
      try {
        const sub = socket.subscription;
        if (!sub || !sub.active) return ack({ ok: false, message: "No active subscription" });
        if (!sub.plan.features.chat) return ack({ ok: false, message: "Chat not allowed in this plan" });

        // Reset daily usage if needed
        const today = new Date().toDateString();
        if (sub.usage.lastUsageReset?.toDateString() !== today) {
          sub.usage.messagesToday = 0;
          sub.usage.lastUsageReset = new Date();
        }

        // Check daily limit
        if (sub.usage.messagesToday >= sub.plan.limits.messagesPerDay) {
          return ack({ ok: false, message: "Daily message limit reached" });
        }

        // Increment usage
        sub.usage.messagesToday++;
        await sub.save();

        io.to(to).emit("private_message", { from: socket.user._id, content });
        ack({ ok: true });
      } catch (err) {
        console.error(err);
        ack({ ok: false, message: "Error sending message" });
      }
    });

    // ====== CALL REQUEST ======
    socket.on("call:request", async ({ to, type }, ack) => {
      try {
        const sub = socket.subscription;
        if (!sub || !sub.active) return ack({ ok: false, message: "No active subscription" });

        // Validate feature
        if (type === "audio" && !sub.plan.features.audioCall)
          return ack({ ok: false, message: "Audio call not allowed in this plan" });

        if (type === "video" && !sub.plan.features.videoCall)
          return ack({ ok: false, message: "Video call not allowed in this plan" });

        // Check monthly call minutes
        const month = new Date().getMonth();
        if (sub.usage.lastUsageReset?.getMonth() !== month) {
          sub.usage.callMinutesThisMonth = 0;
          sub.usage.lastUsageReset = new Date();
        }

        if (sub.usage.callMinutesThisMonth >= sub.plan.limits.callMinutesPerMonth) {
          return ack({ ok: false, message: "Monthly call minutes limit reached" });
        }

        io.to(to).emit("call:incoming", { from: socket.user._id, type });
        ack({ ok: true });
      } catch (err) {
        console.error(err);
        ack({ ok: false, message: "Error initiating call" });
      }
    });

    // ====== CALL ACCEPT ======
    socket.on("call:accepted", ({ to }) => {
      io.to(to).emit("call:accepted", { from: socket.user._id });
    });

    // ====== CALL REJECT ======
    socket.on("call:rejected", ({ to }) => {
      io.to(to).emit("call:rejected", { from: socket.user._id });
    });

    // ====== CALL ENDED ======
    socket.on("call:ended", async ({ to, startedAt }, ack) => {
      try {
        const endedAt = new Date();
        const durationSeconds = Math.floor((endedAt - new Date(startedAt)) / 1000);

        // Update usage
        const minutes = Math.ceil(durationSeconds / 60);
        const sub = socket.subscription;
        sub.usage.callMinutesThisMonth += minutes;
        await sub.save();

        // Save call log
        await CallLog.create({
          caller: socket.user._id,
          callee: to,
          type: "video", // or "audio", better if passed in request
          startedAt,
          endedAt,
          durationSeconds,
          status: "ended"
        });

        io.to(to).emit("call:ended", { from: socket.user._id });
        ack({ ok: true });
      } catch (err) {
        console.error(err);
        ack({ ok: false, message: "Error ending call" });
      }
    });

    // ====== DISCONNECT ======
    socket.on("disconnect", () => {
      console.log(`❌ User disconnected: ${socket.user._id}`);
    });
  });

  return io;
}