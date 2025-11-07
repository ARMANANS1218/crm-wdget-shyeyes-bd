import rawBody from 'raw-body';

/**
 * Middleware to parse raw request body for signature verification
 * Required for ZEGO Cloud webhook callbacks
 */
export const parseRawBody = async (req, res, next) => {
  try {
    // Only parse raw body for callback endpoints
    if (req.originalUrl.includes('/callback')) {
      const raw = await rawBody(req, {
        length: req.headers['content-length'],
        limit: '1mb',
        encoding: 'utf8'
      });
      
      req.rawBody = raw;
      
      // Also parse as JSON for easier access
      try {
        req.body = JSON.parse(raw);
      } catch (e) {
        req.body = {};
      }
    }
    
    next();
  } catch (error) {
    console.error('Raw body parsing error:', error);
    res.status(400).json({
      success: false,
      message: 'Invalid request body'
    });
  }
};

/**
 * Rate limiting middleware for ZEGO endpoints
 */
export const zegoRateLimit = (maxRequests = 60, windowMs = 60000) => {
  const requests = new Map();
  
  return (req, res, next) => {
    const identifier = req.ip || req.connection.remoteAddress;
    const now = Date.now();
    const windowStart = now - windowMs;
    
    // Clean old entries
    for (const [key, timestamps] of requests.entries()) {
      requests.set(key, timestamps.filter(t => t > windowStart));
      if (requests.get(key).length === 0) {
        requests.delete(key);
      }
    }
    
    // Check current user's requests
    const userRequests = requests.get(identifier) || [];
    
    if (userRequests.length >= maxRequests) {
      return res.status(429).json({
        success: false,
        message: 'Rate limit exceeded',
        retryAfter: Math.ceil((userRequests[0] + windowMs - now) / 1000)
      });
    }
    
    // Add current request
    userRequests.push(now);
    requests.set(identifier, userRequests);
    
    next();
  };
};

/**
 * Security headers for ZEGO endpoints
 */
export const zegoSecurity = (req, res, next) => {
  // Add security headers
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  
  // CORS headers for ZEGO callback endpoints
  if (req.originalUrl.includes('/callback')) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Zego-Signature, X-Coolz-Signature, Signature');
  }
  
  next();
};

export default {
  parseRawBody,
  zegoRateLimit,
  zegoSecurity
};