// Chat-specific logging utility for production
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Create logs directory if it doesn't exist
const logsDir = path.join(__dirname, '..', 'logs');

async function ensureLogsDir() {
  try {
    await fs.access(logsDir);
  } catch {
    await fs.mkdir(logsDir, { recursive: true });
  }
}

class ChatLogger {
  static async logInfo(message, data = {}) {
    await this.writeLog('INFO', message, data);
  }

  static async logError(message, error = {}, data = {}) {
    await this.writeLog('ERROR', message, { error: error.message || error, stack: error.stack, ...data });
  }

  static async logWarning(message, data = {}) {
    await this.writeLog('WARNING', message, data);
  }

  static async logSocketEvent(event, userId, data = {}) {
    await this.writeLog('SOCKET', `${event}`, { userId, ...data });
  }

  static async logSubscriptionCheck(userId, receiverId, result) {
    await this.writeLog('SUBSCRIPTION', 'Subscription validation', {
      sender: userId,
      receiver: receiverId,
      valid: result.valid,
      message: result.message
    });
  }

  static async writeLog(level, message, data = {}) {
    try {
      await ensureLogsDir();
      
      const timestamp = new Date().toISOString();
      const logEntry = {
        timestamp,
        level,
        message,
        ...data
      };

      const logLine = JSON.stringify(logEntry) + '\n';
      const fileName = `chat-${new Date().toISOString().split('T')[0]}.log`;
      const filePath = path.join(logsDir, fileName);

      await fs.appendFile(filePath, logLine);

      // Also log to console in development
      if (process.env.NODE_ENV === 'development') {
        console.log(`[${level}] ${message}`, data);
      }

    } catch (error) {
      console.error('Logging error:', error);
    }
  }

  static async cleanOldLogs(daysToKeep = 7) {
    try {
      await ensureLogsDir();
      const files = await fs.readdir(logsDir);
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - daysToKeep);

      for (const file of files) {
        if (file.endsWith('.log')) {
          const filePath = path.join(logsDir, file);
          const stats = await fs.stat(filePath);
          
          if (stats.mtime < cutoffDate) {
            await fs.unlink(filePath);
            console.log(`Deleted old log file: ${file}`);
          }
        }
      }
    } catch (error) {
      console.error('Error cleaning old logs:', error);
    }
  }
}

export default ChatLogger;