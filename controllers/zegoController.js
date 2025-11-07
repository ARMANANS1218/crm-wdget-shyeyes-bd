import zegoService from '../services/zegoService.js';
import User from '../models/User.js';
import Call from '../models/Call.js';
import Subscription from '../models/Subscription.js';

/**
 * ZEGO Cloud Controller
 * Handles all ZEGO-related API endpoints
 */

/**
 * GET /api/zego/token
 * Generate access token for ZEGO Cloud authentication
 */
export const generateToken = async (req, res) => {
  try {
    const user = req.user;
    const { roomId, callType = 'video' } = req.query;

    // Lookup active subscription
    const subscription = await Subscription.findOne({ userId: user._id })
      .populate('planId');

    if (!subscription || new Date() > subscription.endDate) {
      return res.status(403).json({ success: false, message: 'No active subscription' });
    }

    // Determine remaining time for requested call type
    const planLimits = subscription.planId?.limits || {};
    const totalAudioAllowed = subscription.audioTimeAllowed ?? planLimits.totalAudioTimeSeconds ?? 0;
    const totalVideoAllowed = subscription.videoTimeAllowed ?? planLimits.totalVideoTimeSeconds ?? 0;
    const audioUsed = subscription.audioTimeUsedTotal || 0;
    const videoUsed = subscription.videoTimeUsedTotal || 0;
    const audioRemaining = Math.max(0, Number(totalAudioAllowed) - Number(audioUsed));
    const videoRemaining = Math.max(0, Number(totalVideoAllowed) - Number(videoUsed));

    if (callType === 'audio' && audioRemaining <= 0) {
      return res.status(403).json({ success: false, message: 'Audio call limit reached' });
    }
    if (callType !== 'audio' && videoRemaining <= 0) {
      return res.status(403).json({ success: false, message: 'Video call limit reached' });
    }
    
    // Upsert a Call record for this room and user so we can track session via callbacks
    if (roomId) {
      await Call.findOneAndUpdate(
        { 'zegoData.roomId': roomId },
        {
          $setOnInsert: {
            type: callType === 'audio' ? 'audio' : 'video',
            status: 'initiated',
          },
          $set: { 'zegoData.roomId': roomId },
          $addToSet: { participants: { userId: user._id, role: 'participant', joinedAt: new Date() } }
        },
        { upsert: true }
      );
    }

    // Generate token
    const tokenResult = zegoService.generateToken({
      userId: user._id.toString(),
      userName: `${user.Name.firstName} ${user.Name.lastName}`,
      roomId: roomId || null
    });
    
    if (!tokenResult.success) {
      return res.status(500).json({
        success: false,
        message: 'Failed to generate access token',
        error: tokenResult.error
      });
    }
    
    res.json({
      success: true,
      data: {
        ...tokenResult.data,
        user: {
          id: user._id,
          name: `${user.Name.firstName} ${user.Name.lastName}`,
          profilePic: user.profilePic
        },
        subscription: {
          planName: subscription.planType,
          planType: subscription.planType,
          isActive: true,
          endDate: subscription.endDate,
          features: {
            audioCall: (totalAudioAllowed > 0),
            videoCall: (totalVideoAllowed > 0),
            totalAudioAllowed,
            totalVideoAllowed,
            audioTimeUsed: audioUsed,
            videoTimeUsed: videoUsed,
            audioTimeRemaining: audioRemaining,
            videoTimeRemaining: videoRemaining
          }
        }
      }
    });
    
  } catch (error) {
    console.error('ZEGO token generation error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

/**
 * POST /api/zego/room-token
 * Generate room-specific token for joining a call
 */
export const generateRoomToken = async (req, res) => {
  try {
    const user = req.user;
    const { roomId, callId, role = 'participant' } = req.body;
    
    if (!roomId) {
      return res.status(400).json({
        success: false,
        message: 'Room ID is required'
      });
    }
    
    // Verify call exists and user is authorized
    let call = null;
    if (callId) {
      call = await Call.findById(callId);
      if (!call) {
        return res.status(404).json({
          success: false,
          message: 'Call not found'
        });
      }
      
      const isParticipant = call.participants.some(p => 
        p.userId.toString() === user._id.toString()
      );
      
      if (!isParticipant) {
        return res.status(403).json({
          success: false,
          message: 'Not authorized to join this call'
        });
      }
    }
    
    // Generate room token
    const tokenResult = zegoService.generateRoomToken({
      userId: user._id.toString(),
      userName: `${user.Name.firstName} ${user.Name.lastName}`,
      roomId,
      role
    });
    
    if (!tokenResult.success) {
      return res.status(500).json({
        success: false,
        message: 'Failed to generate room token',
        error: tokenResult.error
      });
    }
    
    // Update call with ZEGO room info if call exists
    if (call) {
      await Call.findByIdAndUpdate(callId, {
        'zegoData.roomId': roomId,
        'zegoData.tokenGeneratedAt': new Date(),
        $push: {
          'zegoData.tokenHistory': {
            userId: user._id,
            generatedAt: new Date(),
            expiresAt: new Date(tokenResult.data.expiresAt * 1000)
          }
        }
      });
    }
    
    res.json({
      success: true,
      data: {
        ...tokenResult.data,
        call: call ? {
          id: call._id,
          type: call.type,
          status: call.status,
          participants: call.participants
        } : null
      }
    });
    
  } catch (error) {
    console.error('ZEGO room token generation error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

/**
 * GET /api/zego/config
 * Get ZEGO Cloud configuration for client initialization
 */
export const getConfig = async (req, res) => {
  try {
    const user = req.user;
    
    // Get user subscription info (with bypass for development)
    const subscription = await Subscription.findOne({ userId: user._id })
      .populate('planId');
    
    const connectionInfo = zegoService.getConnectionInfo();
    
    // ⚠️ TEMPORARY: Mock subscription for development
    const mockSubscription = {
      isActive: true,
      planType: 'premium',
      planName: 'premium',
      endDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days from now
      features: {
        audioCall: true,
        videoCall: true
      },
      limits: {
        totalAudioAllowed: 7200, // 2 hours
        totalVideoAllowed: 3600, // 1 hour
        audioTimeUsed: subscription?.audioTimeUsedTotal || 0,
        videoTimeUsed: subscription?.videoTimeUsedTotal || 0,
        audioTimeRemaining: 7200 - (subscription?.audioTimeUsedTotal || 0),
        videoTimeRemaining: 3600 - (subscription?.videoTimeUsedTotal || 0)
      }
    };
    
    res.json({
      success: true,
      data: {
        ...connectionInfo,
        user: {
          id: user._id,
          name: `${user.Name.firstName} ${user.Name.lastName}`,
          profilePic: user.profilePic
        },
        subscription: mockSubscription
      }
    });
    
  } catch (error) {
    console.error('ZEGO config retrieval error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to retrieve configuration'
    });
  }
};

/**
 * POST /api/zego/callback
 * Handle webhooks from ZEGO Cloud (call events, recording, etc.)
 */
export const handleCallback = async (req, res) => {
  try {
    // Verify signature
    const signature = req.headers['x-zego-signature'] || 
                     req.headers['x-coolz-signature'] || 
                     req.headers['signature'];
    
    const rawBody = req.rawBody || req.body;
    
    if (!zegoService.verifyCallbackSignature(rawBody, signature)) {
      console.warn('ZEGO callback signature verification failed');
      return res.status(401).json({
        success: false,
        message: 'Invalid signature'
      });
    }
    
    // Parse callback data
    const callbackData = typeof rawBody === 'string' 
      ? JSON.parse(rawBody) 
      : rawBody;
    
    console.log('ZEGO callback received:', {
      event: callbackData.event_type || callbackData.event,
      roomId: callbackData.room_id,
      timestamp: new Date().toISOString()
    });
    
    // Handle different callback events
    await handleCallbackEvent(callbackData);
    
    res.json({ success: true });
    
  } catch (error) {
    console.error('ZEGO callback processing error:', error);
    res.status(500).json({
      success: false,
      message: 'Callback processing failed'
    });
  }
};

/**
 * POST /api/zego/validate-token
 * Validate a ZEGO token (for debugging)
 */
export const validateToken = async (req, res) => {
  try {
    const { token } = req.body;
    
    if (!token) {
      return res.status(400).json({
        success: false,
        message: 'Token is required'
      });
    }
    
    const validation = zegoService.validateToken(token);
    
    res.json({
      success: true,
      data: validation
    });
    
  } catch (error) {
    console.error('Token validation error:', error);
    res.status(500).json({
      success: false,
      message: 'Token validation failed'
    });
  }
};

/**
 * Handle specific callback events from ZEGO Cloud
 */
async function handleCallbackEvent(data) {
  try {
    const eventType = data.event_type || data.event;
    const roomId = data.room_id;
    
    switch (eventType) {
      case 'room_user_join':
        await handleUserJoinedRoom(data);
        break;
        
      case 'room_user_leave':
        await handleUserLeftRoom(data);
        break;
        
      case 'room_session_end':
        await handleRoomSessionEnd(data);
        break;
        
      case 'recording_ready':
        await handleRecordingReady(data);
        break;
        
      default:
        console.log(`Unhandled ZEGO callback event: ${eventType}`);
    }
  } catch (error) {
    console.error('Callback event handling error:', error);
  }
}

async function handleUserJoinedRoom(data) {
  const { room_id, user_id, timestamp } = data;
  
  // Find and update call record
  await Call.findOneAndUpdate(
    { 'zegoData.roomId': room_id },
    {
      $push: {
        'zegoData.joinEvents': {
          userId: user_id,
          event: 'joined',
          timestamp: new Date(timestamp || Date.now())
        }
      }
    }
  );
}

async function handleUserLeftRoom(data) {
  const { room_id, user_id, timestamp } = data;
  
  await Call.findOneAndUpdate(
    { 'zegoData.roomId': room_id },
    {
      $push: {
        'zegoData.joinEvents': {
          userId: user_id,
          event: 'left',
          timestamp: new Date(timestamp || Date.now())
        }
      }
    }
  );
}

async function handleRoomSessionEnd(data) {
  const { room_id, duration, timestamp } = data;
  
  // Update call with final duration from ZEGO
  const call = await Call.findOneAndUpdate(
    { 'zegoData.roomId': room_id },
    {
      status: 'ended',
      'zegoData.sessionEndedAt': new Date(timestamp || Date.now()),
      'zegoData.actualDuration': Number(duration) || 0
    },
    { new: true }
  );

  // If we know the call type and participants, attribute duration to all participants' subscriptions
  try {
    if (call && Array.isArray(call.participants) && call.participants.length > 0) {
      const secs = Math.max(0, Number(duration) || 0);
      if (secs > 0) {
        const type = call.type === 'audio' ? 'audio' : 'video';
        const inc = type === 'audio'
          ? { audioTimeUsedTotal: secs, totalAudioUsed: secs }
          : { videoTimeUsedTotal: secs, totalVideoUsed: secs };

        await Subscription.updateMany(
          { userId: { $in: call.participants.map(p => p.userId) } },
          { $inc: inc }
        );
      }
    }
  } catch (err) {
    console.error('Failed to attribute ZEGO duration to subscriptions:', err);
  }
}

async function handleRecordingReady(data) {
  const { room_id, recording_url, file_size } = data;
  
  await Call.findOneAndUpdate(
    { 'zegoData.roomId': room_id },
    {
      'zegoData.recording': {
        url: recording_url,
        fileSize: file_size,
        readyAt: new Date()
      }
    }
  );
}

export default {
  generateToken,
  generateRoomToken,
  getConfig,
  handleCallback,
  validateToken
};