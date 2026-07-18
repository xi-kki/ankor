const express = require('express');
const { createServer } = require('http');
const { WebSocketServer, WebSocket } = require('ws');
const { readFileSync, existsSync } = require('fs');
const { join } = require('path');

// Load env vars from .env file (local dev only — Vercel uses dashboard env vars)
const envPath = join(__dirname, '.env');
if (existsSync(envPath)) {
    const envContent = readFileSync(envPath, 'utf8');
    envContent.split('\n').forEach(line => {
        const [key, ...value] = line.split('=');
        if (key && value.length) process.env[key.trim()] = value.join('=').trim();
    });
}

const GROQ_API_KEY = process.env.GROQ_API_KEY;
const DEEPGRAM_API_KEY = process.env.DEEPGRAM_API_KEY;
const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY;

console.log('API Keys loaded:', {
    groq: GROQ_API_KEY ? '✓' : '✗',
    deepgram: DEEPGRAM_API_KEY ? '✓' : '✗',
    elevenlabs: ELEVENLABS_API_KEY ? '✓' : '✗'
});

const app = express();
const server = createServer(app);
const wss = new WebSocketServer({ server });

// ===== SECURITY HEADERS =====
app.use((req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('X-XSS-Protection', '1; mode=block');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
    res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval' https://unpkg.com https://cdn.tailwindcss.com https://esm.sh; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data: https:; media-src 'self' https:;");
    next();
});

// ===== RATE LIMITING =====
const rateLimit = new Map();
const RATE_LIMIT_WINDOW = 60000; // 1 minute
const RATE_LIMIT_MAX = 30; // requests per window

app.use('/api/', (req, res, next) => {
    const ip = req.ip;
    const now = Date.now();
    
    if (!rateLimit.has(ip)) {
        rateLimit.set(ip, { count: 1, resetAt: now + RATE_LIMIT_WINDOW });
        return next();
    }
    
    const limit = rateLimit.get(ip);
    if (now > limit.resetAt) {
        limit.count = 1;
        limit.resetAt = now + RATE_LIMIT_WINDOW;
        return next();
    }
    
    limit.count++;
    if (limit.count > RATE_LIMIT_MAX) {
        return res.status(429).json({ error: 'Too many requests' });
    }
    next();
});

// Clean up old rate limits every 5 minutes
setInterval(() => {
    const now = Date.now();
    for (const [ip, limit] of rateLimit) {
        if (now > limit.resetAt) rateLimit.delete(ip);
    }
}, 300000);

// Serve static files
app.use(express.static(__dirname));

// Serve index.html for root
app.get('/', (req, res) => {
    res.sendFile(join(__dirname, 'index.html'));
});

// Health check
app.get('/api/health', (req, res) => {
    res.json({
        groq: !!GROQ_API_KEY,
        deepgram: !!DEEPGRAM_API_KEY,
        elevenlabs: !!ELEVENLABS_API_KEY
    });
});

// Config endpoint - serves public client ID only (NOT the secret)
app.get('/api/config', (req, res) => {
    res.json({
        clientId: GOOGLE_CLIENT_ID || '',
        network: process.env.SUI_NETWORK || 'testnet'
    });
});

// ===== ZKLOGIN AUTH =====
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const crypto = require('crypto');

// Google's public keys
let googleKeys = null;
let keysLastFetched = 0;

async function getGoogleKeys() {
    if (googleKeys && (Date.now() - keysLastFetched) < 86400000) {
        return googleKeys;
    }
    const response = await fetch('https://www.googleapis.com/oauth2/v3/certs');
    googleKeys = await response.json();
    keysLastFetched = Date.now();
    return googleKeys;
}

// Derive Sui address from JWT claims
function deriveSuiAddress(sub, aud, iss) {
    const data = `${sub}:${aud}:${iss}`;
    const hash = crypto.createHash('sha256').update(data).digest();
    return '0x' + hash.slice(0, 32).toString('hex');
}

// Verify Google JWT
app.post('/api/auth/verify', express.json(), async (req, res) => {
    try {
        const { idToken } = req.body;
        
        if (!idToken) {
            return res.status(400).json({ error: 'Missing idToken' });
        }
        
        // Decode JWT
        const [headerB64, payloadB64] = idToken.split('.');
        const header = JSON.parse(Buffer.from(headerB64, 'base64url').toString());
        const payload = JSON.parse(Buffer.from(payloadB64, 'base64url').toString());
        
        // Verify expiry
        if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) {
            return res.status(401).json({ error: 'Token expired' });
        }
        
        // Verify audience
        if (GOOGLE_CLIENT_ID && payload.aud !== GOOGLE_CLIENT_ID) {
            return res.status(401).json({ error: 'Invalid audience' });
        }
        
        // Verify issuer
        if (!['https://accounts.google.com', 'https://openidconnect.googleapis.com'].includes(payload.iss)) {
            return res.status(401).json({ error: 'Invalid issuer' });
        }
        
        // Derive Sui address
        const suiAddress = deriveSuiAddress(payload.sub, payload.aud, payload.iss);
        
        // Return verified info (NO PII stored)
        res.json({
            verified: true,
            address: suiAddress,
            name: payload.name || payload.given_name || 'User'
        });
        
    } catch (error) {
        console.error('Auth error:', error.message);
        res.status(401).json({ error: 'Verification failed' });
    }
});

// Chat completion endpoint
app.post('/api/chat', express.json(), async (req, res) => {
    try {
        const { messages } = req.body;
        const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${GROQ_API_KEY}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                model: 'llama-3.3-70b-versatile',
                messages: [
                    {
                        role: 'system',
                        content: `You are Ankor, a calm, warm AI wellness companion. Keep responses SHORT (1-3 sentences). Warm, steady tone. Guide through breathing when overwhelmed. Help break tasks when unfocused. Never diagnose. Validate feelings first. Crisis? Say: "Please call 988."`
                    },
                    ...messages
                ],
                temperature: 0.7,
                max_tokens: 150
            })
        });
        const data = await response.json();
        res.json(data);
    } catch (err) {
        console.error('Chat error:', err);
        res.status(500).json({ error: 'Chat failed' });
    }
});

// WebSocket for real-time voice
wss.on('connection', (ws) => {
    console.log('Client connected');

    let deepgramSocket = null;

    ws.on('message', async (data) => {
        try {
            const msg = JSON.parse(data);

            if (msg.type === 'start_listening') {
                // Connect to Deepgram for STT
                deepgramSocket = new WebSocket(
                    'wss://api.deepgram.com/v1/listen?model=nova-2&language=en&smart_format=true',
                    { headers: { 'Authorization': `Token ${DEEPGRAM_API_KEY}` } }
                );

                deepgramSocket.onopen = () => {
                    console.log('Deepgram connected');
                    ws.send(JSON.stringify({ type: 'listening_started' }));
                };

                deepgramSocket.onmessage = async (event) => {
                    const transcript = JSON.parse(event.data);
                    if (transcript.is_final && transcript.channel?.alternatives?.[0]?.transcript) {
                        const text = transcript.channel.alternatives[0].transcript;
                        console.log('Transcript:', text);
                        ws.send(JSON.stringify({ type: 'transcript', text }));

                        // Get AI response
                        ws.send(JSON.stringify({ type: 'ai_thinking' }));
                        const aiResponse = await getAIResponse(text);

                        // Get TTS audio
                        const ttsAudio = await getTTS(aiResponse);

                        ws.send(JSON.stringify({
                            type: 'ai_response',
                            text: aiResponse,
                            audio: ttsAudio ? Buffer.from(ttsAudio).toString('base64') : null
                        }));
                    }
                };

                deepgramSocket.onerror = (err) => {
                    console.error('Deepgram error:', err);
                };

            } else if (msg.type === 'audio_chunk') {
                if (deepgramSocket?.readyState === WebSocket.OPEN) {
                    const audioData = Buffer.from(msg.data, 'base64');
                    deepgramSocket.send(audioData);
                }

            } else if (msg.type === 'stop_listening') {
                if (deepgramSocket) {
                    deepgramSocket.close();
                    deepgramSocket = null;
                }
                ws.send(JSON.stringify({ type: 'listening_stopped' }));

            } else if (msg.type === 'text_message') {
                // Handle text input (quick actions)
                ws.send(JSON.stringify({ type: 'ai_thinking' }));
                const aiResponse = await getAIResponse(msg.text);
                const ttsAudio = await getTTS(aiResponse);

                ws.send(JSON.stringify({
                    type: 'ai_response',
                    text: aiResponse,
                    audio: ttsAudio ? Buffer.from(ttsAudio).toString('base64') : null
                }));
            }
        } catch (err) {
            console.error('WebSocket error:', err);
        }
    });

    ws.on('close', () => {
        if (deepgramSocket) deepgramSocket.close();
        console.log('Client disconnected');
    });
});

async function getAIResponse(userMessage) {
    try {
        const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${GROQ_API_KEY}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                model: 'llama-3.3-70b-versatile',
                messages: [
                    {
                        role: 'system',
                        content: `You are Ankor, a calm, warm AI wellness companion. Keep responses SHORT (1-3 sentences). Warm, steady tone. Guide through breathing when overwhelmed. Help break tasks when unfocused. Never diagnose. Validate feelings first. For breathing, pace words: "In... 2... 3... 4..." Crisis? Say: "Please call 988."`
                    },
                    { role: 'user', content: userMessage }
                ],
                temperature: 0.7,
                max_tokens: 150
            })
        });
        const data = await response.json();
        return data.choices?.[0]?.message?.content || "I'm here. Take a breath with me.";
    } catch (err) {
        console.error('Groq error:', err);
        return "I'm here. Let's take a breath together.";
    }
}

async function getTTS(text) {
    try {
        const response = await fetch('https://api.elevenlabs.io/v1/text-to-speech/21m00Tcm4TlvDq8ikWAM', {
            method: 'POST',
            headers: {
                'xi-api-key': ELEVENLABS_API_KEY,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                text,
                model_id: 'eleven_turbo_v2',
                voice_settings: {
                    stability: 0.7,
                    similarity_boost: 0.8,
                    style: 0.3
                }
            })
        });

        if (!response.ok) {
            const err = await response.text();
            console.error('ElevenLabs error:', err);
            return null;
        }
        return await response.arrayBuffer();
    } catch (err) {
        console.error('TTS error:', err);
        return null;
    }
}

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
    console.log(`\n🎧 Ankor server running at http://localhost:${PORT}\n`);
});
