// Global Presence Namespace - Backend Socket.IO handler for website-wide online status
import jwt from 'jsonwebtoken';
import User from '../models/User.js';

class PresenceNamespace {
  constructor(io) {
    this.io = io;
    this.presenceNamespace = io.of('/presence');
    this.onlineUsers = new Map(); // userId -> { socket, user, joinedAt }
    this.userSockets = new Map(); // userId -> Set of socketIDs
    
    this.setupEventHandlers();
    console.log('🌐 Global Presence namespace initialized');
  }

  setupEventHandlers() {
    this.presenceNamespace.use(async (socket, next) => {
      try {
        console.log('🌐 Authenticating presence connection...');
        
        const token = socket.handshake.auth?.token;
        if (!token) {
          console.log('🌐 ❌ No token provided');
          return next(new Error('Authentication error: No token provided'));
        }

        // Verify JWT token
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        console.log('🌐 Token decoded:', { userId: decoded.id || decoded._id });

        // Fetch user from database
        const user = await User.findById(decoded.id || decoded._id).select('-password');
        if (!user) {
          console.log('🌐 ❌ User not found:', decoded.id || decoded._id);
          return next(new Error('Authentication error: User not found'));
        }

        console.log('🌐 ✅ User authenticated:', user.name || user.email);
        
        // Attach user to socket
        socket.userId = user._id.toString();
        socket.user = user;
        next();
      } catch (error) {
        console.error('🌐 ❌ Presence authentication error:', error.message);
        next(new Error('Authentication error: ' + error.message));
      }
    });

    this.presenceNamespace.on('connection', (socket) => {
      this.handleConnection(socket);
    });
  }

  async handleConnection(socket) {
    const userId = socket.userId;
    const user = socket.user;
    
    console.log('🌐 === USER CONNECTED TO GLOBAL PRESENCE ===');
    console.log('🌐 User ID:', userId);
    console.log('🌐 User Name:', user.name || user.email);
    console.log('🌐 Socket ID:', socket.id);

    try {
      // Add user to online users
      this.addUserOnline(userId, socket, user);
      
      // Send current online users to the newly connected user
      await this.sendOnlineUsersToSocket(socket);
      
      // Broadcast that this user is now online
      await this.broadcastUserOnline(userId, user);
      
      // Handle user disconnect
      socket.on('disconnect', async (reason) => {
        console.log('🌐 User disconnected from presence:', userId, 'Reason:', reason);
        await this.handleDisconnection(userId, socket.id, user);
      });

      // Handle manual status updates (if needed in future)
      socket.on('update_status', async (data) => {
        console.log('🌐 User status update:', userId, data);
        await this.handleStatusUpdate(userId, data);
      });

      console.log('🌐 ✅ Global presence connection established for:', user.name || user.email);
      
    } catch (error) {
      console.error('🌐 ❌ Error handling presence connection:', error);
      socket.emit('presence_error', { message: 'Failed to establish presence connection' });
    }
  }

  // Add user to online users map
  addUserOnline(userId, socket, user) {
    // Initialize user socket set if doesn't exist
    if (!this.userSockets.has(userId)) {
      this.userSockets.set(userId, new Set());
    }
    
    // Add socket to user's socket set
    this.userSockets.get(userId).add(socket.id);
    
    // Store user info (update if already exists)
    this.onlineUsers.set(userId, {
      socket,
      user: {
        id: userId,
        _id: userId,
        name: user.name,
        email: user.email,
        profilePicture: user.profilePicture,
        age: user.age,
        location: user.location
      },
      joinedAt: new Date(),
      lastSeen: new Date()
    });

    console.log('🌐 User added to online list:', userId);
    console.log('🌐 Total online users:', this.onlineUsers.size);
  }

  // Remove user from online users
  async handleDisconnection(userId, socketId, user) {
    try {
      // Remove socket from user's socket set
      const userSocketSet = this.userSockets.get(userId);
      if (userSocketSet) {
        userSocketSet.delete(socketId);
        
        // If user has no more sockets, mark as offline
        if (userSocketSet.size === 0) {
          this.userSockets.delete(userId);
          
          // Update user's last seen before removing
          const userData = this.onlineUsers.get(userId);
          if (userData) {
            userData.lastSeen = new Date();
            
            // Remove from online users
            this.onlineUsers.delete(userId);
            
            // Broadcast user offline
            await this.broadcastUserOffline(userId, user, userData.lastSeen);
          }
          
          console.log('🌐 User completely offline:', userId);
        } else {
          console.log('🌐 User still has', userSocketSet.size, 'connections:', userId);
        }
      }
      
      console.log('🌐 Total online users after disconnect:', this.onlineUsers.size);
      
    } catch (error) {
      console.error('🌐 Error handling disconnection:', error);
    }
  }

  // Send list of online users to specific socket
  async sendOnlineUsersToSocket(socket) {
    try {
      const onlineUsers = Array.from(this.onlineUsers.values()).map(userData => ({
        userId: userData.user.id,
        id: userData.user.id,
        name: userData.user.name,
        email: userData.user.email,
        profilePicture: userData.user.profilePicture,
        age: userData.user.age,
        location: userData.user.location,
        joinedAt: userData.joinedAt,
        lastSeen: userData.lastSeen
      }));

      socket.emit('online_users', {
        users: onlineUsers,
        count: onlineUsers.length
      });

      console.log('🌐 Sent', onlineUsers.length, 'online users to socket:', socket.id);
    } catch (error) {
      console.error('🌐 Error sending online users:', error);
    }
  }

  // Broadcast that a user came online
  async broadcastUserOnline(userId, user) {
    try {
      const userData = {
        userId: userId,
        user: {
          id: userId,
          _id: userId,
          name: user.name,
          email: user.email,
          profilePicture: user.profilePicture,
          age: user.age,
          location: user.location
        },
        timestamp: new Date()
      };

      // Broadcast to all other users (exclude the user who just came online)
      this.presenceNamespace.emit('user_online', userData);
      
      console.log('🌐 Broadcasted user online:', user.name || user.email);
    } catch (error) {
      console.error('🌐 Error broadcasting user online:', error);
    }
  }

  // Broadcast that a user went offline
  async broadcastUserOffline(userId, user, lastSeen) {
    try {
      const userData = {
        userId: userId,
        user: {
          id: userId,
          _id: userId,
          name: user.name,
          email: user.email,
          profilePicture: user.profilePicture
        },
        lastSeen: lastSeen,
        timestamp: new Date()
      };

      // Broadcast to all users
      this.presenceNamespace.emit('user_offline', userData);
      
      console.log('🌐 Broadcasted user offline:', user.name || user.email);
    } catch (error) {
      console.error('🌐 Error broadcasting user offline:', error);
    }
  }

  // Handle status updates (for future features like custom status messages)
  async handleStatusUpdate(userId, statusData) {
    try {
      const userOnlineData = this.onlineUsers.get(userId);
      if (!userOnlineData) {
        console.log('🌐 User not online for status update:', userId);
        return;
      }

      // Update user status
      userOnlineData.status = statusData;
      userOnlineData.lastStatusUpdate = new Date();

      // Broadcast status update
      this.presenceNamespace.emit('user_status_update', {
        userId: userId,
        status: statusData,
        timestamp: new Date()
      });

      console.log('🌐 User status updated:', userId, statusData);
    } catch (error) {
      console.error('🌐 Error updating user status:', error);
    }
  }

  // Get current online users count
  getOnlineUsersCount() {
    return this.onlineUsers.size;
  }

  // Get all online users
  getAllOnlineUsers() {
    return Array.from(this.onlineUsers.values()).map(userData => userData.user);
  }

  // Check if user is online
  isUserOnline(userId) {
    return this.onlineUsers.has(userId);
  }

  // Get user's online data
  getUserOnlineData(userId) {
    return this.onlineUsers.get(userId) || null;
  }
}

export default PresenceNamespace;