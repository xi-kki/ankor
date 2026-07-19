// Security Configuration for Ankore
// Additional hack prevention measures

const crypto = require('crypto');

// SECURITY: Generate request signature for API calls
function generateRequestSignature(payload, secret) {
  return crypto.createHmac('sha256', secret).update(JSON.stringify(payload)).digest('hex');
}

// SECURITY: Verify request signature
function verifyRequestSignature(payload, signature, secret) {
  const expected = generateRequestSignature(payload, secret);
  return crypto.timingSafeEqual(Buffer.from(signature, 'hex'), Buffer.from(expected, 'hex'));
}

// SECURITY: CSRF token generation
function generateCSRFToken() {
  return crypto.randomBytes(32).toString('hex');
}

// SECURITY: Validate CSRF token
function validateCSRFToken(token, storedToken) {
  if (!token || !storedToken) {
    return false;
  }
  return crypto.timingSafeEqual(Buffer.from(token, 'hex'), Buffer.from(storedToken, 'hex'));
}

// SECURITY: Generate nonce for replay protection
function generateNonce() {
  return crypto.randomBytes(16).toString('hex');
}

// SECURITY: Session token generation
function generateSessionToken() {
  return crypto.randomBytes(48).toString('base64');
}

// SECURITY: Hash password/key for storage
function hashForStorage(data) {
  return crypto.createHash('sha256').update(data).digest('hex');
}

// SECURITY: Constant-time comparison to prevent timing attacks
function safeCompare(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') {
    return false;
  }
  if (a.length !== b.length) {
    return false;
  }

  return crypto.timingSafeEqual(Buffer.from(a, 'utf8'), Buffer.from(b, 'utf8'));
}

// SECURITY: Input length limits
const LIMITS = {
  maxMessageLength: 1000,
  maxMessages: 20,
  maxTokenLength: 2000,
  maxNameLength: 100,
  maxWsMessageSize: 100000, // 100KB
  maxRequestBody: 10240, // 10KB
};

// SECURITY: Allowed origins
const ALLOWED_ORIGINS = [
  'https://ankore.vercel.app',
  'https://ankore-4j6y45g1x-xikkilocker-6820s-projects.vercel.app',
  'http://localhost:3001',
];

// SECURITY: Check if origin is allowed
function isOriginAllowed(origin) {
  if (!origin) {
    return false;
  }
  return ALLOWED_ORIGINS.includes(origin);
}

// SECURITY: Sanitize filename (for future file uploads)
function sanitizeFilename(filename) {
  return filename
    .replace(/[^a-zA-Z0-9._-]/g, '')
    .replace(/\.{2,}/g, '.')
    .slice(0, 255);
}

// SECURITY: Generate secure random string
function generateSecureRandom(length = 32) {
  return crypto.randomBytes(length).toString('hex');
}

// SECURITY: IP validation
function isValidIP(ip) {
  const ipv4Regex = /^(\d{1,3}\.){3}\d{1,3}$/;
  const ipv6Regex = /^([0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}$/;
  return ipv4Regex.test(ip) || ipv6Regex.test(ip);
}

// SECURITY: Extract real IP from request
function getClientIP(req) {
  return (
    req.headers['x-forwarded-for']?.split(',')[0]?.trim() ||
    req.headers['x-real-ip'] ||
    req.connection?.remoteAddress ||
    'unknown'
  );
}

module.exports = {
  generateRequestSignature,
  verifyRequestSignature,
  generateCSRFToken,
  validateCSRFToken,
  generateNonce,
  generateSessionToken,
  hashForStorage,
  safeCompare,
  LIMITS,
  ALLOWED_ORIGINS,
  isOriginAllowed,
  sanitizeFilename,
  generateSecureRandom,
  isValidIP,
  getClientIP,
};
