// Vercel Serverless Function: GET /api/callback
// Handles Google OAuth callback - exchanges code for tokens

module.exports = async (req, res) => {
    const { code, error, state } = req.query;
    
    // Handle errors from Google
    if (error) {
        console.error('OAuth error:', error);
        return res.redirect(`/?error=${encodeURIComponent(error)}`);
    }
    
    if (!code) {
        return res.redirect('/?error=no_code');
    }
    
    try {
        const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
        const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
        
        if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET) {
            console.error('Missing Google credentials in env');
            return res.redirect('/?error=server_config_error');
        }
        
        // Get the base URL for redirect_uri
        const protocol = req.headers['x-forwarded-proto'] || 'https';
        const host = req.headers['host'];
        const baseUrl = `${protocol}://${host}`;
        
        // Exchange authorization code for tokens
        const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({
                code,
                client_id: GOOGLE_CLIENT_ID,
                client_secret: GOOGLE_CLIENT_SECRET,
                redirect_uri: `${baseUrl}/api/callback`,
                grant_type: 'authorization_code'
            })
        });
        
        const tokens = await tokenResponse.json();
        
        if (tokens.error) {
            console.error('Token exchange error:', tokens.error, tokens.error_description);
            return res.redirect(`/?error=${encodeURIComponent(tokens.error)}`);
        }
        
        if (tokens.id_token) {
            // Success! Redirect back to frontend with the token in hash
            const redirectUrl = `/?id_token=${tokens.id_token}${state ? `&state=${state}` : ''}`;
            return res.redirect(redirectUrl);
        }
        
        // No id_token received
        console.error('No id_token in response:', tokens);
        return res.redirect('/?error=no_id_token');
        
    } catch (error) {
        console.error('Callback error:', error);
        return res.redirect('/?error=callback_failed');
    }
};
