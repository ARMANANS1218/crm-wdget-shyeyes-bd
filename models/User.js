import mongoose from "mongoose";

const userSchema = new mongoose.Schema(
  {
    Name: {
      firstName: { type: String, required: true, trim: true },
      lastName: { type: String, required: true, trim: true },
    },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    password: { type: String, required: true },
    phoneNo: { type: String, required: true, unique: true, trim: true },
    dob: { type: String, required: true },
    age: { type: Number, required: true, min: 18 },
    gender: { type: String, enum: ["Male", "Female", "Others"], required: true },

    location: {
      street: { type: String, trim: true },
      city: { type: String, trim: true },
      state: { type: String, trim: true },
      country: { type: String, trim: true },
      postalCode: { type: String, trim: true },
    },

    bio: { type: String, trim: true },
    hobbies: [{ type: String, trim: true }],
    photos: [{ type: String, trim: true }],
    profilePic: { type: String, trim: true },
    coverPic: { type: String, trim: true, default: "" }, 


    status: {
      type: String,
      enum: ["Active", "Inactive", "Banned"],
      default: "Active",
    },

  emailVerified: { type: Boolean, default: false },
  otp: String,
  otpExpires: Date,


    friends: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
    likeCount: { type: Number, default: 0 },
    matchCount: { type: Number, default: 0 }
  },
  { timestamps: true }
);

//get all active users


export default mongoose.model("User", userSchema);
