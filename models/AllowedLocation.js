import mongoose from 'mongoose';

const allowedLocationSchema = new mongoose.Schema({
  role: { type: mongoose.Schema.Types.ObjectId, ref: 'Role', required: true, index: true },

  label: { type: String }, // e.g., HQ, Home Office
  address: { type: String },

  // GeoJSON Point
  location: {
    type: { type: String, enum: ['Point'], default: 'Point', required: true },
    coordinates: { type: [Number], required: true }, // [lng, lat]
  },
  radiusMeters: { type: Number, default: 100, min: 5 },

  type: { type: String, enum: ['permanent', 'temporary'], default: 'permanent' },
  startAt: { type: Date },
  endAt: { type: Date },

  isActive: { type: Boolean, default: true },
  addedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Role' },
  revokedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Role' },
  revokedAt: { type: Date },
  reactivatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Role' },
  reactivatedAt: { type: Date },
}, { timestamps: true });

allowedLocationSchema.index({ location: '2dsphere' });
allowedLocationSchema.index({ role: 1, isActive: 1 });
allowedLocationSchema.index({ endAt: 1 });

export default mongoose.model('AllowedLocation', allowedLocationSchema);
