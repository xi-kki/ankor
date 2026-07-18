// Security Middleware for Ankore API
// Provides rate limiting, abuse detection, and IP blocklist

// SECURITY: In-memory rate limiting (use Redis in production)
const rateLimitStore = new Map();
const ipBlocklist = new Set();
const suspiciousActivity = new Map();

// Rate limit configuration
const RATE_LIMIT = {
    windowMs: 60000, // 1 minute
    maxRequests: 30, // requests per window
    maxAuthAttempts: 5, // auth attempts per window
    maxChatMessages: 50 // chat messages per window
};

// SECURITY: Known malicious IP patterns (basic blocklist)
const MALICIOUS_PATTERNS = [
    /^104\.16\./, // Known scanner IPs
    /^185\.220\./,
    /^198\.51\./
];

// Check if IP is blocked
function isIPBlocked(ip) {
    if (ipBlocklist.has(ip)) return true;
    
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
function trackSuspiciousActivity(ip, type) {
    if (!suspiciousActivity.has(ip)) {
        suspiciousActivity.set(ip, { count: 0, firstSeen: Date.now() });
    }
    
    const activity = suspiciousActivity.get(ip);
    activity.count++;
    
    // If more than 10 suspicious activities in 5 minutes, block IP
    if (activity.count > 10 && (Date.now() - activity.firstSeen) < 300000) {
        ipBlocklist.add(ip);
        console.warn(`IP blocked due to suspicious activity: ${ip}`);
        return true;
    }
    
    return false;
}

// Rate limiting middleware
function rateLimit(req, res, next) {
    const ip = req.ip || req.connection.remoteAddress;
    
    // SECURITY: Check if IP is blocked
    if (isIPBlocked(ip)) {
        return res.status(403).json({ error: 'Access denied' });
    }
    
    const now = Date.now();
    const key = `${ip}:${req.path}`;
    
    if (!rateLimitStore.has(key)) {
        rateLimitStore.set(key, { count: 1, resetAt: now + RATE_LIMIT.windowMs });
        return next();
    }
    
    const limit = rateLimitStore.get(key);
    
    // Reset if window expired
    if (now > limit.resetAt) {
        limit.count = 1;
        limit.resetAt = now + RATE_LIMIT.windowMs;
        return next();
    }
    
    limit.count++;
    
    // Set rate limit headers
    res.setHeader('X-RateLimit-Limit', RATE_LIMIT.maxRequests.toString());
    res.setHeader('X-RateLimit-Remaining', Math.max(0, RATE_LIMIT.maxRequests - limit.count).toString());
    res.setHeader('X-RateLimit-Reset', Math.ceil(limit.resetAt / 1000).toString());
    
    if (limit.count > RATE_LIMIT.maxRequests) {
        // SECURITY: Track as suspicious
        trackSuspiciousActivity(ip, 'rate_limit');
        
        return res.status(429).json({ 
            error: 'Too many requests',
            retryAfter: Math.ceil((limit.resetAt - now) / 1000)
        });
    }
    
    next();
}

// Auth-specific rate limiting
function authRateLimit(req, res, next) {
    const ip = req.ip || req.connection.remoteAddress;
    const key = `auth:${ip}`;
    
    if (!rateLimitStore.has(key)) {
        rateLimitStore.set(key, { count: 1, resetAt: Date.now() + RATE_LIMIT.windowMs });
        return next();
    }
    
    const limit = rateLimitStore.get(key);
    
    if (Date.now() > limit.resetAt) {
        limit.count = 1;
        limit.resetAt = Date.now() + RATE_LIMIT.windowMs;
        return next();
    }
    
    limit.count++;
    
    if (limit.count > RATE_LIMIT.maxAuthAttempts) {
        trackSuspiciousActivity(ip, 'auth_brute');
        return res.status(429).json({ error: 'Too many auth attempts' });
    }
    
    next();
}

// Request validation middleware
function validateRequest(req, res, next) {
    const ip = req.ip || req.connection.remoteAddress;
    
    // SECURITY: Check for common attack patterns
    const suspiciousPatterns = [
        /(\.\.\/)+/, // Path traversal
        /<script/i, // XSS attempts
        /union\s+select/i, // SQL injection
        /exec\(/i, // Command injection
        /eval\(/i // Code injection
    ];
    
    const requestString = JSON.stringify(req.body) + req.url;
    
    for (const pattern of suspiciousPatterns) {
        if (pattern.test(requestString)) {
            trackSuspiciousActivity(ip, 'attack_attempt');
            console.warn(`Suspicious request from ${ip}: ${req.url}`);
            return res.status(400).json({ error: 'Invalid request' });
        }
    }
    
    next();
}

// Clean up old entries periodically
setInterval(() => {
    const now = Date.now();
    
    // Clean rate limit store
    for (const [key, value] of rateLimitStore) {
        if (now > value.resetAt) {
            rateLimitStore.delete(key);
        }
    }
    
    // Clean suspicious activity (reset after 1 hour)
    for (const [ip, activity] of suspiciousActivity) {
        if ((now - activity.firstSeen) > 3600000) {
            suspiciousActivity.delete(ip);
        }
    }
}, 300000); // Every 5 minutes

module.exports = {
    rateLimit,
    authRateLimit,
    validateRequest,
    isIPBlocked,
    trackSuspiciousActivity,
    ipBlocklist
};
