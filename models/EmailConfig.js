import mongoose from 'mongoose';

const EmailConfigSchema = new mongoose.Schema({
  emailAddress: { type: String, required: true },
  imap: {
    host: { type: String, required: true },
    port: { type: Number, required: true },
    secure: { type: Boolean, default: true },
    username: { type: String, required: true },
    password: { type: String, required: true },
  },
  smtp: {
    host: { type: String, required: true },
    port: { type: Number, required: true },
    secure: { type: Boolean, default: true },
    username: { type: String, required: true },
    password: { type: String, required: true },
    fromName: { type: String }
  },
  isEnabled: { type: Boolean, default: true },
  status: { type: String, default: 'unknown' }
}, { timestamps: true });

EmailConfigSchema.index({ emailAddress: 1 }, { unique: true });

export default mongoose.model('EmailConfig', EmailConfigSchema);
