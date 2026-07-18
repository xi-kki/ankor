# Security Policy for Ankore

## Overview

Ankore takes security seriously. This document outlines the security measures implemented and recommended practices.

## Implemented Security Measures

### 1. Authentication & Authorization

- **JWT Verification**: All Google OAuth tokens are verified using `jose` library against Google's public keys
- **Signature Verification**: JWT signatures are cryptographically verified to prevent token forgery
- **Token Validation**: Expiry, issuer, audience, and subject claims are validated
- **No PII Storage**: Only derived wallet addresses are stored, never personal information

### 2. API Security

- **CORS Protection**: Strict origin validation - only allowed domains can access APIs
- **Rate Limiting**: 30 requests per minute per IP on all API endpoints
- **Input Validation**: All user inputs are validated and sanitized
- **Request Size Limits**: 10KB max request body
- **Message Length Limits**: 1000 characters max per message
- **Method Restriction**: Endpoints only accept required HTTP methods

### 3. Data Protection

- **End-to-End Encryption**: Conversations encrypted client-side before storage
- **No Server-Side Storage**: Audio never stored, text only on-chain under user control
- **Secure Headers**: CSP, X-Frame-Options, X-Content-Type-Options, etc.
- **HTTPS Only**: All communications encrypted in transit

### 4. Infrastructure Security

- **Helmet.js**: Security headers automatically applied
- **WebSocket Rate Limiting**: Connection limits per IP
- **IP Blocklist**: Known malicious IPs blocked
- **Suspicious Activity Detection**: Automatic IP blocking for abuse patterns

### 5. Code Security

- **Secret Scanning**: Gitleaks in CI/CD pipeline
- **Dependency Auditing**: npm audit for known vulnerabilities
- **No Hardcoded Secrets**: All credentials in environment variables
- **.env Gitignored**: Credentials never committed to repository

## Security Headers

```
Content-Security-Policy: default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval' https://unpkg.com https://cdn.tailwindcss.com https://esm.sh; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data: https:; media-src 'self' https:; connect-src 'self' https://api.groq.com https://api.deepgram.com https://api.elevenlabs.io; frame-src 'none'; object-src 'none'; base-uri 'self'; form-action 'self'
X-Content-Type-Options: nosniff
X-Frame-Options: DENY
X-XSS-Protection: 1; mode=block
Referrer-Policy: strict-origin-when-cross-origin
Permissions-Policy: camera=(), microphone=(), geolocation=()
```

## Rate Limits

| Endpoint | Limit | Window |
|----------|-------|--------|
| All API endpoints | 30 requests | 1 minute |
| Auth endpoints | 5 attempts | 1 minute |
| Chat messages | 20 messages | Per request |
| WebSocket connections | 5 per IP | Concurrent |

## Input Validation Rules

### Messages
- Maximum 20 messages per request
- Maximum 1000 characters per message
- Only allowed roles: `user`, `assistant`, `system`
- HTML/template characters stripped

### Tokens
- Maximum 2000 characters
- Must have 3 parts separated by dots
- Must be valid base64url format

### WebSocket
- Maximum 100KB per message
- Maximum 5 connections per IP
- Valid JSON required

## Known Vulnerabilities

### Fixed
- ✅ JWT signature verification (was missing)
- ✅ CORS wildcard (now restricted)
- ✅ Input validation (was missing)
- ✅ Rate limiting (was in-memory only)

### Remaining
- ⚠️ In-memory rate limiting (use Redis in production)
- ⚠️ No nonce verification (implement for replay protection)

## Recommended Production Enhancements

### 1. Redis for Rate Limiting
```javascript
// Replace in-memory rate limiting with Redis
const Redis = require('ioredis');
const redis = new Redis(process.env.REDIS_URL);

async function checkRateLimit(ip, limit, window) {
    const key = `ratelimit:${ip}`;
    const current = await redis.incr(key);
    if (current === 1) {
        await redis.expire(key, window);
    }
    return current <= limit;
}
```

### 2. Nonce Verification
```javascript
// Store nonces in Redis
async function storeNonce(nonce, ttl = 3600) {
    await redis.setex(`nonce:${nonce}`, ttl, '1');
}

async function verifyNonce(nonce) {
    const exists = await redis.exists(`nonce:${nonce}`);
    if (exists) {
        await redis.del(`nonce:${nonce}`);
        return true;
    }
    return false;
}
```

### 3. Request Signing
```javascript
// For internal API calls
const crypto = require('crypto');

function signRequest(payload, secret) {
    return crypto
        .createHmac('sha256', secret)
        .update(JSON.stringify(payload))
        .digest('hex');
}

function verifySignature(payload, signature, secret) {
    const expected = signRequest(payload, secret);
    return crypto.timingSafeEqual(
        Buffer.from(signature, 'hex'),
        Buffer.from(expected, 'hex')
    );
}
```

## Incident Response

### If you suspect a security issue:

1. **Do not** disclose the issue publicly
2. **Document** what you found
3. **Contact** the security team immediately
4. **Do not** attempt to exploit the vulnerability

### Response Timeline

- **Acknowledgment**: Within 24 hours
- **Initial Assessment**: Within 48 hours
- **Fix Deployment**: Critical issues within 72 hours
- **Disclosure**: After fix is deployed

## Security Checklist for Deployment

- [ ] All environment variables set in Vercel dashboard
- [ ] Google Cloud Console configured with correct redirect URIs
- [ ] OAuth consent screen has test users added
- [ ] No hardcoded secrets in codebase
- [ ] .env file is gitignored
- [ ] Security headers are present
- [ ] Rate limiting is active
- [ ] Input validation is working
- [ ] CORS is properly configured
- [ ] HTTPS is enforced

## Dependencies Security

```bash
# Check for vulnerabilities
npm audit

# Fix automatically
npm audit fix

# Check for outdated packages
npm outdated

# Update packages
npm update
```

## Contact

For security inquiries or to report vulnerabilities:
- Email: security@ankore.app
- GitHub: Create a private security advisory

---

*Last updated: July 18, 2026*
