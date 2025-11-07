import mongoose from "mongoose";

const connectDB = async () => {
  try {
    console.log('🔄 Attempting to connect to MongoDB...');
    console.log('🔍 MongoDB URI check:', { 
      hasURI: !!process.env.MONGO_URI,
      environment: process.env.NODE_ENV 
    });

    if (!process.env.MONGO_URI) {
      throw new Error('MONGO_URI environment variable is not set');
    }

    // Enhanced connection options for production
    const options = {
      serverSelectionTimeoutMS: 30000, // 30 seconds
      socketTimeoutMS: 45000, // 45 seconds
      maxPoolSize: 10, // Maximum number of connections
      minPoolSize: 1, // Minimum number of connections
    };

    const conn = await mongoose.connect(process.env.MONGO_URI, options);
    
    console.log(`✅ MongoDB Connected: ${conn.connection.db.databaseName}`);
    console.log(`✅ MongoDB Host: ${conn.connection.host}`);
    console.log(`✅ MongoDB Ready State: ${conn.connection.readyState}`);

    // Handle connection events
    mongoose.connection.on('error', (error) => {
      console.error('❌ MongoDB connection error:', error);
    });

    mongoose.connection.on('disconnected', () => {
      console.log('⚠️ MongoDB disconnected');
    });

    mongoose.connection.on('reconnected', () => {
      console.log('✅ MongoDB reconnected');
    });

    return conn;
  } catch (error) {
    console.error(`❌ MongoDB connection error: ${error.message}`);
    console.error(`❌ Full error:`, error);
    
    // In production, exit the process if DB connection fails
    if (process.env.NODE_ENV === 'production') {
      process.exit(1);
    } else {
      // In development, just log the error
      console.log('🔄 Will retry in 5 seconds...');
      setTimeout(() => connectDB(), 5000);
    }
  }
};

export default connectDB;
