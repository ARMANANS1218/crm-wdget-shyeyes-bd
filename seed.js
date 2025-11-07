// src/seed/membershipSeeder.js
import mongoose from "mongoose";
import dotenv from "dotenv";
import Membership from "./models/Membership.js";

dotenv.config();

const seedMembershipPlans = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI);

    const plans = [
      {
        name: "Free",
        price: 0,
        durationDays: 365,
        features: {
          viewProfiles: true,
          chat: true,
          chatDurationSeconds: 20,
          sendRequests: 0,
          audioCall: false,
          videoCall: false
        }
      },
      {
        name: "Basic",
        price: 9.99,
        durationDays: 30,
        features: {
          viewProfiles: true,
          chat: true,
          chatDurationSeconds: 300,
          sendRequests: 10,
          audioCall: false,
          videoCall: false
        }
      },
      {
        name: "Standard",
        price: 19.99,
        durationDays: 30,
        features: {
          viewProfiles: true,
          chat: true,
          chatDurationSeconds: 1800,
          sendRequests: 50,
          audioCall: true,
          videoCall: false
        }
      },
      {
        name: "Premium",
        price: 29.99,
        durationDays: 30,
        features: {
          viewProfiles: true,
          chat: true,
          unlimitedAccess: true,
          sendRequests: 9999,
          audioCall: true,
          videoCall: true
        }
      }
    ];

    await Membership.deleteMany(); // reset
    await Membership.insertMany(plans);

    console.log("✅ Membership plans seeded successfully!");
    process.exit();
  } catch (error) {
    console.error("❌ Error seeding membership plans:", error);
    process.exit(1);
  }
};

seedMembershipPlans();
