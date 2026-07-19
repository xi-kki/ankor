// Health check endpoint
module.exports = (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', 'https://ankore.vercel.app');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    
    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }
    
    res.json({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        version: '1.0.0'
    });
};
