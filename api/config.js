// Vercel Serverless Function: GET /api/config
// Returns public config (client ID) - no secrets exposed

module.exports = (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    
    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }
    
    res.json({
        clientId: process.env.GOOGLE_CLIENT_ID || '',
        network: process.env.SUI_NETWORK || 'testnet'
    });
};
