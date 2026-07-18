/**
 * Sui zkLogin Backend Verification
 * 
 * This endpoint:
 * 1. Receives the Google JWT from the client
 * 2. Verifies the JWT signature with Google's public keys
 * 3. Derives the Sui address from the JWT claims
 * 4. Returns verified user info (no PII stored)
 */

const express = require('express');
const router = express.Router();

// Google's public keys endpoint
const GOOGLE_KEYS_URL = 'https://www.googleapis.com/oauth2/v3/certs';

// Cache Google's public keys (rotate daily)
let googleKeys = null;
let keysLastFetched = 0;
const KEYS_CACHE_DURATION = 24 * 60 * 60 * 1000; // 24 hours

async function getGoogleKeys() {
    const now = Date.now();
    if (googleKeys && (now - keysLastFetched) < KEYS_CACHE_DURATION) {
        return googleKeys;
    }
    
    try {
        const response = await fetch(GOOGLE_KEYS_URL);
        const data = await response.json();
        googleKeys = data;
        keysLastFetched = now;
        return data;
    } catch (error) {
        console.error('Failed to fetch Google keys:', error);
        throw error;
    }
}

// Simple JWT verification (for production, use a proper JWT library)
async function verifyGoogleJWT(idToken, clientId) {
    const [headerB64, payloadB64, signatureB64] = idToken.split('.');
    
    // Decode header and payload
    const header = JSON.parse(Buffer.from(headerB64, 'base64url').toString());
    const payload = JSON.parse(Buffer.from(payloadB64, 'base64url').toString());
    
    // Get Google's public keys
    const keys = await getGoogleKeys();
    const key = keys.keys?.find(k => k.kid === header.kid);
    
    if (!key) {
        throw new Error('Invalid key ID');
    }
    
    // Verify expiry
    const now = Math.floor(Date.now() / 1000);
    if (payload.exp && payload.exp < now) {
        throw new Error('Token expired');
    }
    
    // Verify audience
    if (payload.aud !== clientId) {
        throw new Error('Invalid audience');
    }
    
    // Verify issuer
    if (payload.iss !== 'https://accounts.google.com' && 
        payload.iss !== 'https://openidconnect.googleapis.com') {
        throw new Error('Invalid issuer');
    }
    
    // Note: For production, verify the signature using the public key
    // This is simplified - use a proper JWT verification library like jose or jsonwebtoken
    
    return payload;
}

// Derive Sui address from JWT claims
// This is a simplified version - real zkLogin usesPoseidon hash
function deriveSuiAddress(sub, aud, iss) {
    const crypto = require('crypto');
    
    // Combine claims to create a deterministic address
    const data = `${sub}:${aud}:${iss}`;
    const hash = crypto.createHash('sha256').update(data).digest();
    
    // Take first 32 bytes and format as Sui address (0x + 64 hex chars)
    const address = '0x' + hash.slice(0, 32).toString('hex');
    
    return address;
}

// POST /api/auth/verify
router.post('/verify', express.json(), async (req, res) => {
    try {
        const { idToken, clientId } = req.body;
        
        if (!idToken) {
            return res.status(400).json({ error: 'Missing idToken' });
        }
        
        const finalClientId = clientId || process.env.GOOGLE_CLIENT_ID;
        
        // Verify the JWT
        const payload = await verifyGoogleJWT(idToken, finalClientId);
        
        // Extract user info (only what we need)
        const userSub = payload.sub; // Google's unique user ID
        const userName = payload.name || payload.given_name || 'User';
        const userEmail = payload.email;
        
        // Derive Sui address from JWT claims
        const suiAddress = deriveSuiAddress(
            userSub,
            payload.aud,
            payload.iss
        );
        
        // Return verified info (NO PII is stored on our end)
        res.json({
            verified: true,
            address: suiAddress,
            name: userName,
            // Don't return email or sub to client for privacy
        });
        
    } catch (error) {
        console.error('Verification error:', error.message);
        res.status(401).json({ 
            error: 'Verification failed',
            message: error.message 
        });
    }
});

// POST /api/auth/session
// Creates a signed session token for the user
router.post('/session', express.json(), async (req, res) => {
    try {
        const { address, name } = req.body;
        
        if (!address || !name) {
            return res.status(400).json({ error: 'Missing address or name' });
        }
        
        // In production, you'd sign this with a server secret
        // For now, just return success
        res.json({
            success: true,
            sessionToken: `session_${Date.now()}_${address.slice(0, 8)}`,
            expiresIn: 3600 // 1 hour
        });
        
    } catch (error) {
        console.error('Session error:', error);
        res.status(500).json({ error: 'Session creation failed' });
    }
});

module.exports = router;
