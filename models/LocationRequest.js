import mongoose from 'mongoose';

const locationRequestSchema = new mongoose.Schema({
  role: { type: mongoose.Schema.Types.ObjectId, ref: 'Role', required: true, index: true },
  requestedByRole: { type: String, enum: ['admin', 'agent'], required: true },

  address: { type: String },
  location: {
    type: { type: String, enum: ['Point'], default: 'Point', required: true },
    coordinates: { type: [Number], required: true }, // [lng, lat]
  },
  requestedRadius: { type: Number, default: 100, min: 5 },

  reason: { type: String, required: true },
  requestType: { type: String, enum: ['temporary', 'permanent'], default: 'permanent' },
  startAt: { type: Date },
  endAt: { type: Date },
  emergency: { type: Boolean, default: false },

  status: { type: String, enum: ['pending', 'approved', 'rejected', 'expired', 'stopped'], default: 'pending', index: true },
  reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Role' },
  reviewedAt: { type: Date },
  reviewComments: { type: String },
  
  // For stop/start access functionality
  stoppedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Role' },
  stoppedAt: { type: Date },
  reactivatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Role' },
  reactivatedAt: { type: Date },
}, { timestamps: true });

locationRequestSchema.index({ emergency: 1, status: 1, createdAt: 1 });

export default mongoose.model('LocationRequest', locationRequestSchema);
