// Vercel Serverless Function: POST /api/auth/verify
// Verifies Google JWT and derives Sui address
// SECURITY: Uses jose library for proper JWT signature verification
// SECURITY: Includes nonce verification for replay prevention

const jose = require('jose');
const crypto = require('crypto');
const { verifyNonce } = require('./middleware');

// Cache Google's public keys (refresh daily)
let googleKeys = null;
let keysLastFetched = 0;
const KEYS_CACHE_DURATION = 86400000; // 24 hours

async function getGooglePublicKeys() {
  if (googleKeys && Date.now() - keysLastFetched < KEYS_CACHE_DURATION) {
    return googleKeys;
  }

  try {
    const response = await fetch('https://www.googleapis.com/oauth2/v3/certs');
    if (!response.ok) {
      throw new Error('Failed to fetch Google keys');
    }
    googleKeys = await response.json();
    keysLastFetched = Date.now();
    return googleKeys;
  } catch (error) {
    // SECURITY: Don't leak error details
    if (googleKeys) {
      return googleKeys;
    }
    throw error;
  }
}

module.exports = async (req, res) => {
  // SECURITY: Strict CORS - only allow your domain
  const allowedOrigins = [
    'https://ankore.vercel.app',
    'https://ankore-4j6y45g1x-xikkilocker-6820s-projects.vercel.app',
    'http://localhost:3001',
  ];

  const origin = req.headers.origin;
  if (allowedOrigins.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
  }

  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { idToken, nonce } = req.body;

    // INPUT VALIDATION
    if (!idToken || typeof idToken !== 'string') {
      return res.status(400).json({ error: 'Missing or invalid idToken' });
    }

    // SECURITY: Verify token format (should have 3 parts separated by dots)
    const tokenParts = idToken.split('.');
    if (tokenParts.length !== 3) {
      return res.status(400).json({ error: 'Invalid token format' });
    }

    // SECURITY: Limit token length (Google JWTs are typically ~1000 chars)
    if (idToken.length > 2000) {
      return res.status(400).json({ error: 'Token too long' });
    }

    // SECURITY: Verify nonce (replay prevention)
    if (nonce) {
      const nonceValid = await verifyNonce(nonce);
      if (!nonceValid) {
        return res.status(401).json({ error: 'Invalid or reused nonce' });
      }
    }

    const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;

    if (!GOOGLE_CLIENT_ID) {
      // SECURITY: Don't leak config details
      return res.status(500).json({ error: 'Server configuration error' });
    }

    // Fetch Google's public keys
    const keys = await getGooglePublicKeys();

    // Decode header to find the key ID
    const [headerB64] = tokenParts;
    const header = JSON.parse(Buffer.from(headerB64, 'base64url').toString());

    // Find the matching key
    const key = keys.keys.find((k) => k.kid === header.kid);
    if (!key) {
      return res.status(401).json({ error: 'Invalid key ID' });
    }

    // SECURITY: Import the key for verification
    const publicKey = await jose.importJWK(key, 'RS256');

    // SECURITY: Verify JWT signature, expiry, issuer, and audience
    const { payload } = await jose.jwtVerify(idToken, publicKey, {
      issuer: ['https://accounts.google.com', 'https://openidconnect.googleapis.com'],
      audience: GOOGLE_CLIENT_ID,
      maxTokenAge: '1h', // Reject tokens older than 1 hour
    });

    // SECURITY: Verify required claims exist
    if (!payload.sub || !payload.aud) {
      return res.status(401).json({ error: 'Missing required claims' });
    }

    // SECURITY: Verify sub is a numeric string (Google user ID)
    if (!/^\d+$/.test(payload.sub)) {
      return res.status(401).json({ error: 'Invalid subject format' });
    }

    // SECURITY: Verify nonce claim in JWT if present
    if (payload.nonce) {
      const jwtNonceValid = await verifyNonce(payload.nonce);
      if (!jwtNonceValid) {
        return res.status(401).json({ error: 'JWT nonce already used' });
      }
    }

    // Derive Sui address from JWT claims
    const suiAddress = deriveSuiAddress(payload.sub, payload.aud, payload.iss);

    // Return verified info (NO PII stored)
    res.json({
      verified: true,
      address: suiAddress,
      name: payload.name || payload.given_name || 'User',
    });
  } catch (error) {
    // SECURITY: Don't leak error details in production
    if (error.code === 'ERR_JWT_EXPIRED') {
      return res.status(401).json({ error: 'Token expired' });
    }
    if (error.code === 'ERR_JWT_INVALID_AUDIENCE') {
      return res.status(401).json({ error: 'Invalid audience' });
    }
    if (error.code === 'ERR_JWT_INVALID_ISSUER') {
      return res.status(401).json({ error: 'Invalid issuer' });
    }

    res.status(401).json({ error: 'Verification failed' });
  }
};

// Derive deterministic Sui address from JWT claims
function deriveSuiAddress(sub, aud, iss) {
  const data = `${sub}:${aud}:${iss}`;
  const hash = crypto.createHash('sha256').update(data).digest();
  return '0x' + hash.slice(0, 32).toString('hex');
}
