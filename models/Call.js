import mongoose from 'mongoose';

const participantSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  role: { type: String, enum: ['caller', 'callee', 'participant'], default: 'participant' },
  joinedAt: { type: Date },
  leftAt: { type: Date }
}, { _id: false });

const tokenHistorySchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  generatedAt: { type: Date },
  expiresAt: { type: Date }
}, { _id: false });

const joinEventSchema = new mongoose.Schema({
  userId: { type: String },
  event: { type: String, enum: ['joined', 'left'] },
  timestamp: { type: Date }
}, { _id: false });

const callSchema = new mongoose.Schema({
  type: { type: String, enum: ['audio', 'video'], required: true },
  status: { type: String, enum: ['initiated', 'ongoing', 'ended', 'missed'], default: 'initiated' },
  participants: { type: [participantSchema], default: [] },
  zegoData: {
    roomId: { type: String },
    tokenGeneratedAt: { type: Date },
    tokenHistory: { type: [tokenHistorySchema], default: [] },
    joinEvents: { type: [joinEventSchema], default: [] },
    sessionEndedAt: { type: Date },
    actualDuration: { type: Number, default: 0 },
    recording: {
      url: { type: String },
      fileSize: { type: Number },
      readyAt: { type: Date }
    }
  }
}, { timestamps: true });

export default mongoose.model('Call', callSchema);
