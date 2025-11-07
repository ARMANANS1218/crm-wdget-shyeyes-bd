import mongoose from "mongoose";

const likeSchema = new mongoose.Schema(
  {
    liker: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    liked: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    isFavourite: { type: Boolean, default: false }
  },
  { timestamps: true }
  
);

export default mongoose.model("Like", likeSchema);
