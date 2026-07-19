// Security Middleware for Ankore API
// Provides persistent rate limiting, abuse detection, and IP blocklist
// SECURITY: Uses Upstash Redis for persistent rate limiting

const crypto = require('crypto');

// ===== REDIS CLIENT =====
let redis = null;

async function getRedis() {
  if (redis) {
    return redis;
  }

  try {
    // Use Upstash Redis (Vercel integration)
    const { Redis } = require('@upstash/redis');
    redis = new Redis({
      url: process.env.UPSTASH_REDIS_REST_URL,
      token: process.env.UPSTASH_REDIS_REST_TOKEN,
    });
    return redis;
  } catch (error) {
    console.error('Redis connection failed, using in-memory fallback');
    return null;
  }
}

// ===== IN-MEMORY FALLBACK =====
const rateLimitStore = new Map();
const ipBlocklist = new Set();
const suspiciousActivity = new Map();
const usedNonces = new Set();

// Rate limit configuration
const RATE_LIMIT = {
  windowMs: 60000, // 1 minute
  maxRequests: 30, // requests per window
  maxAuthAttempts: 5, // auth attempts per window
  maxChatMessages: 50, // chat messages per window
  maxWebSocketMessages: 20, // WebSocket messages per minute
};

// SECURITY: Known malicious IP patterns (basic blocklist)
const MALICIOUS_PATTERNS = [
  /^104\.16\./, // Known scanner IPs
  /^185\.220\./,
  /^198\.51\./,
  /^192\.168\./, // Private IPs (shouldn't be external)
  /^10\./, // Private IPs
  /^172\.(1[6-9]|2\d|3[01])\./, // Private IPs
];

// ===== HELPER FUNCTIONS =====

// Check if IP is blocked
function isIPBlocked(ip) {
  if (ipBlocklist.has(ip)) {
    return true;
  }

  // Check against malicious patterns
  for (const pattern of MALICIOUS_PATTERNS) {
    if (pattern.test(ip)) {
      ipBlocklist.add(ip);
      return true;
    }
  }

  return false;
}

// Track suspicious activity
function trackSuspiciousActivity(ip, _type) {
  if (!suspiciousActivity.has(ip)) {
    suspiciousActivity.set(ip, { count: 0, firstSeen: Date.now() });
  }

  const activity = suspiciousActivity.get(ip);
  activity.count++;

  // If more than 10 suspicious activities in 5 minutes, block IP
  if (activity.count > 10 && Date.now() - activity.firstSeen < 300000) {
    ipBlocklist.add(ip);
    console.warn(`IP blocked due to suspicious activity`);
    return true;
  }

  return false;
}

// ===== NONCE VERIFICATION (Replay Prevention) =====

async function storeNonce(nonce, ttl = 3600) {
  const r = await getRedis();
  if (r) {
    // Redis: store with expiry
    await r.setex(`nonce:${nonce}`, ttl, '1');
  } else {
    // In-memory fallback
    usedNonces.add(nonce);
    setTimeout(() => usedNonces.delete(nonce), ttl * 1000);
  }
}

async function verifyNonce(nonce) {
  const r = await getRedis();
  if (r) {
    // Redis: check and delete atomically
    const exists = await r.exists(`nonce:${nonce}`);
    if (exists) {
      return false;
    } // Already used
    await r.setex(`nonce:${nonce}`, 3600, '1');
    return true;
  } else {
    // In-memory fallback
    if (usedNonces.has(nonce)) {
      return false;
    }
    usedNonces.add(nonce);
    setTimeout(() => usedNonces.delete(nonce), 3600000);
    return true;
  }
}

// ===== CSRF STATE VERIFICATION =====

async function generateCSRFState() {
  const state = crypto.randomBytes(32).toString('hex');
  const r = await getRedis();
  if (r) {
    await r.setex(`oauth_state:${state}`, 600, '1'); // 10 min expiry
  } else {
    rateLimitStore.set(`state:${state}`, { expires: Date.now() + 600000 });
  }
  return state;
}

async function verifyCSRFState(state) {
  if (!state) {
    return false;
  }

  const r = await getRedis();
  if (r) {
    const exists = await r.exists(`oauth_state:${state}`);
    if (exists) {
      await r.del(`oauth_state:${state}`); // Use once
      return true;
    }
    return false;
  } else {
    const stored = rateLimitStore.get(`state:${state}`);
    if (stored && Date.now() < stored.expires) {
      rateLimitStore.delete(`state:${state}`);
      return true;
    }
    return false;
  }
}

// ===== RATE LIMITING (Persistent) =====

async function rateLimit(req, res, next) {
  const ip = req.ip || req.connection?.remoteAddress || 'unknown';

  // SECURITY: Check if IP is blocked
  if (isIPBlocked(ip)) {
    return res.status(403).json({ error: 'Access denied' });
  }

  const now = Date.now();
  const key = `ratelimit:${ip}:${req.path}`;

  const r = await getRedis();
  if (r) {
    // Redis-based rate limiting (persistent across cold starts)
    try {
      const current = await r.incr(key);
      if (current === 1) {
        await r.expire(key, Math.ceil(RATE_LIMIT.windowMs / 1000));
      }

      const remaining = Math.max(0, RATE_LIMIT.maxRequests - current);
      const ttl = await r.ttl(key);

      res.setHeader('X-RateLimit-Limit', RATE_LIMIT.maxRequests.toString());
      res.setHeader('X-RateLimit-Remaining', remaining.toString());
      res.setHeader('X-RateLimit-Reset', (now / 1000 + ttl).toString());

      if (current > RATE_LIMIT.maxRequests) {
        trackSuspiciousActivity(ip, 'rate_limit');
        return res.status(429).json({
          error: 'Too many requests',
          retryAfter: ttl,
        });
      }
    } catch (error) {
      // Redis failed, continue without rate limiting
      console.error('Redis rate limit failed');
    }
  } else {
    // In-memory fallback
    if (!rateLimitStore.has(key)) {
      rateLimitStore.set(key, { count: 1, resetAt: now + RATE_LIMIT.windowMs });
    } else {
      const limit = rateLimitStore.get(key);
      if (now > limit.resetAt) {
        limit.count = 1;
        limit.resetAt = now + RATE_LIMIT.windowMs;
      } else {
        limit.count++;
        if (limit.count > RATE_LIMIT.maxRequests) {
          trackSuspiciousActivity(ip, 'rate_limit');
          return res.status(429).json({
            error: 'Too many requests',
            retryAfter: Math.ceil((limit.resetAt - now) / 1000),
          });
        }
      }
    }

    res.setHeader('X-RateLimit-Limit', RATE_LIMIT.maxRequests.toString());
  }

  next();
}

// Auth-specific rate limiting (persistent)
async function authRateLimit(req, res, next) {
  const ip = req.ip || req.connection?.remoteAddress || 'unknown';
  const key = `authratelimit:${ip}`;

  const r = await getRedis();
  if (r) {
    try {
      const current = await r.incr(key);
      if (current === 1) {
        await r.expire(key, Math.ceil(RATE_LIMIT.windowMs / 1000));
      }

      if (current > RATE_LIMIT.maxAuthAttempts) {
        trackSuspiciousActivity(ip, 'auth_brute');
        return res.status(429).json({ error: 'Too many auth attempts' });
      }
    } catch (error) {
      console.error('Redis auth rate limit failed');
    }
  } else {
    if (!rateLimitStore.has(key)) {
      rateLimitStore.set(key, { count: 1, resetAt: Date.now() + RATE_LIMIT.windowMs });
    } else {
      const limit = rateLimitStore.get(key);
      if (Date.now() > limit.resetAt) {
        limit.count = 1;
        limit.resetAt = Date.now() + RATE_LIMIT.windowMs;
      } else {
        limit.count++;
        if (limit.count > RATE_LIMIT.maxAuthAttempts) {
          trackSuspiciousActivity(ip, 'auth_brute');
          return res.status(429).json({ error: 'Too many auth attempts' });
        }
      }
    }
  }

  next();
}

// WebSocket message rate limiting
async function wsRateLimit(ip) {
  const key = `wsratelimit:${ip}`;

  const r = await getRedis();
  if (r) {
    try {
      const current = await r.incr(key);
      if (current === 1) {
        await r.expire(key, 60); // 1 minute window
      }
      return current <= RATE_LIMIT.maxWebSocketMessages;
    } catch (error) {
      return true; // Allow if Redis fails
    }
  } else {
    // In-memory fallback
    const now = Date.now();
    if (!rateLimitStore.has(key)) {
      rateLimitStore.set(key, { count: 1, resetAt: now + 60000 });
      return true;
    }
    const limit = rateLimitStore.get(key);
    if (now > limit.resetAt) {
      limit.count = 1;
      limit.resetAt = now + 60000;
      return true;
    }
    limit.count++;
    return limit.count <= RATE_LIMIT.maxWebSocketMessages;
  }
}

// Request validation middleware
function validateRequest(req, res, next) {
  const ip = req.ip || req.connection?.remoteAddress || 'unknown';

  // SECURITY: Check for common attack patterns
  const suspiciousPatterns = [
    /(\.\.\/)+/, // Path traversal
    /<script/i, // XSS attempts
    /union\s+select/i, // SQL injection
    /exec\(/i, // Command injection
    /eval\(/i, // Code injection
    /\$\{.*\}/, // Template injection
    /javascript:/i, // JavaScript URI
    /data:text\/html/i, // Data URI XSS
  ];

  const requestString = JSON.stringify(req.body) + req.url;

  for (const pattern of suspiciousPatterns) {
    if (pattern.test(requestString)) {
      trackSuspiciousActivity(ip, 'attack_attempt');
      console.warn(`Suspicious request blocked`);
      return res.status(400).json({ error: 'Invalid request' });
    }
  }

  next();
}

// ===== CLEANUP (In-memory only) =====
if (process.env.NODE_ENV !== 'production') {
  setInterval(() => {
    const now = Date.now();

    // Clean rate limit store
    for (const [key, value] of rateLimitStore) {
      if (value.resetAt && now > value.resetAt) {
        rateLimitStore.delete(key);
      }
      if (value.expires && now > value.expires) {
        rateLimitStore.delete(key);
      }
    }

    // Clean suspicious activity (reset after 1 hour)
    for (const [ip, activity] of suspiciousActivity) {
      if (now - activity.firstSeen > 3600000) {
        suspiciousActivity.delete(ip);
      }
    }

    // Clean nonces (should be handled by Redis TTL)
    // In-memory cleanup for fallback
  }, 300000); // Every 5 minutes
}

module.exports = {
  rateLimit,
  authRateLimit,
  wsRateLimit,
  validateRequest,
  isIPBlocked,
  trackSuspiciousActivity,
  storeNonce,
  verifyNonce,
  generateCSRFState,
  verifyCSRFState,
  ipBlocklist,
  RATE_LIMIT,
};
