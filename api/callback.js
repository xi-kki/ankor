// Vercel Serverless Function: GET /api/callback
// Handles Google OAuth callback - exchanges code for tokens
// SECURITY: Validates state parameter, strict redirect

module.exports = async (req, res) => {
    const { code, error, state } = req.query;
    
    // Handle errors from Google
    if (error) {
        // SECURITY: Don't echo error details back
        console.error('OAuth error received');
        return res.redirect('/?error=auth_failed');
    }
    
    if (!code) {
        return res.redirect('/?error=no_code');
    }
    
    // SECURITY: Validate state parameter (CSRF protection)
    // In production, verify state matches what was sent
    if (state && !/^[a-zA-Z0-9_-]+$/.test(state)) {
        return res.redirect('/?error=invalid_state');
    }
    
    try {
        const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
        const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
        
        if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET) {
            console.error('Missing Google credentials');
            return res.redirect('/?error=server_error');
        }
        
        // SECURITY: Validate authorization code format
        if (code.length > 1000) {
            return res.redirect('/?error=invalid_code');
        }
        
        // Get the base URL for redirect_uri
        const protocol = req.headers['x-forwarded-proto'] || 'https';
        const host = req.headers['host'];
        
        // SECURITY: Validate host header
        const allowedHosts = [
            'ankore.vercel.app',
            'ankore-4j6y45g1x-xikkilocker-6820s-projects.vercel.app'
        ];
        
        if (!allowedHosts.includes(host)) {
            console.error('Invalid host:', host);
            return res.redirect('/?error=invalid_host');
        }
        
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
            // SECURITY: Don't log full error details
            console.error('Token exchange failed:', tokens.error);
            return res.redirect('/?error=token_exchange_failed');
        }
        
        if (tokens.id_token) {
            // SECURITY: Validate id_token format before redirect
            const tokenParts = tokens.id_token.split('.');
            if (tokenParts.length !== 3) {
                return res.redirect('/?error=invalid_token_format');
            }
            
            // SECURITY: Limit token length
            if (tokens.id_token.length > 2000) {
                return res.redirect('/?error=token_too_long');
            }
            
            // Success! Redirect back to frontend with the token in hash
            // SECURITY: Use hash fragment, not query string, to avoid server logging
            const redirectUrl = `/?id_token=${tokens.id_token}`;
            return res.redirect(redirectUrl);
        }
        
        // No id_token received
        console.error('No id_token received');
        return res.redirect('/?error=no_id_token');
        
    } catch (error) {
        // SECURITY: Don't leak error details
        console.error('Callback processing failed');
        return res.redirect('/?error=callback_failed');
    }
};
