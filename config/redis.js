// src/config/redis.js
import Redis from "ioredis";
import dotenv from "dotenv";

dotenv.config();

let redisClient = null;

export const connectRedis = async () => {
  try {
    const url = process.env.REDIS_URL || "redis://localhost:6379";

    redisClient = new Redis(url, {
      reconnectOnError: (err) => {
        console.error("🔄 Redis reconnect due to error:", err.message);
        return true;
      },
      retryStrategy(times) {
        // reconnect with exponential backoff
        const delay = Math.min(times * 50, 2000);
        return delay;
      },
    });

    redisClient.on("connect", () => {
      console.log("✅ Redis connected successfully!", url);
    });

    redisClient.on("ready", () => {
      console.log("🚀 Redis is ready to use!");
    });

    redisClient.on("error", (e) => {
      console.error("❌ Redis error:", e.message);
    });

    redisClient.on("close", () => {
      console.warn("⚠️ Redis connection closed.");
    });

    // Quick test (PING)
    const pong = await redisClient.ping();
    console.log("📡 Redis PING response:", pong);

    return redisClient;
  } catch (err) {
    console.error("❌ Failed to connect Redis:", err.message);
    return null;
  }
};

export { redisClient };