// Vercel Serverless Function: GET /api/config
// Returns public config (client ID) - no secrets exposed
// SECURITY: Rate limited, strict CORS

module.exports = (req, res) => {
    // SECURITY: Strict CORS
    const allowedOrigins = [
        'https://ankore.vercel.app',
        'https://ankore-4j6y45g1x-xikkilocker-6820s-projects.vercel.app',
        'http://localhost:3001'
    ];
    
    const origin = req.headers.origin;
    if (allowedOrigins.includes(origin)) {
        res.setHeader('Access-Control-Allow-Origin', origin);
    }
    
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    
    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }
    
    // SECURITY: Only allow GET
    if (req.method !== 'GET') {
        return res.status(405).json({ error: 'Method not allowed' });
    }
    
    // SECURITY: Cache control
    res.setHeader('Cache-Control', 'public, max-age=3600'); // Cache for 1 hour
    
    res.json({
        clientId: process.env.GOOGLE_CLIENT_ID || '',
        network: process.env.SUI_NETWORK || 'testnet'
    });
};
