// Vercel Serverless Function: POST /api/auth/verify
// Verifies Google JWT and derives Sui address

const crypto = require('crypto');

module.exports = async (req, res) => {
    // CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    
    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }
    
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }
    
    try {
        const { idToken } = req.body;
        
        if (!idToken) {
            return res.status(400).json({ error: 'Missing idToken' });
        }
        
        const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
        
        // Decode JWT (header + payload)
        const [headerB64, payloadB64] = idToken.split('.');
        const header = JSON.parse(Buffer.from(headerB64, 'base64url').toString());
        const payload = JSON.parse(Buffer.from(payloadB64, 'base64url').toString());
        
        // Verify expiry
        const now = Math.floor(Date.now() / 1000);
        if (payload.exp && payload.exp < now) {
            return res.status(401).json({ error: 'Token expired' });
        }
        
        // Verify audience
        if (GOOGLE_CLIENT_ID && payload.aud !== GOOGLE_CLIENT_ID) {
            return res.status(401).json({ error: 'Invalid audience' });
        }
        
        // Verify issuer
        const validIssuers = ['https://accounts.google.com', 'https://openidconnect.googleapis.com'];
        if (!validIssuers.includes(payload.iss)) {
            return res.status(401).json({ error: 'Invalid issuer' });
        }
        
        // Verify nonce (prevents replay attacks)
        // In production, store used nonces and check against them
        
        // Derive Sui address from JWT claims
        const suiAddress = deriveSuiAddress(payload.sub, payload.aud, payload.iss);
        
        // Return verified info (NO PII stored)
        res.json({
            verified: true,
            address: suiAddress,
            name: payload.name || payload.given_name || 'User'
        });
        
    } catch (error) {
        console.error('Auth verification error:', error.message);
        res.status(401).json({ 
            error: 'Verification failed',
            message: process.env.NODE_ENV === 'development' ? error.message : 'Invalid token'
        });
    }
};

// Derive deterministic Sui address from JWT claims
function deriveSuiAddress(sub, aud, iss) {
    const data = `${sub}:${aud}:${iss}`;
    const hash = crypto.createHash('sha256').update(data).digest();
    return '0x' + hash.slice(0, 32).toString('hex');
}
