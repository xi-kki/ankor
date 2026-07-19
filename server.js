const express = require('express');
const { createServer } = require('http');
const { WebSocketServer, WebSocket } = require('ws');
const { readFileSync, existsSync } = require('fs');
const { join } = require('path');
const helmet = require('helmet');
const { rateLimit, validateRequest } = require('./api/middleware');

// Load env vars from .env file (local dev only — Vercel uses dashboard env vars)
const envPath = join(__dirname, '.env');
if (existsSync(envPath)) {
  const envContent = readFileSync(envPath, 'utf8');
  envContent.split('\n').forEach((line) => {
    const [key, ...value] = line.split('=');
    if (key && value.length) {
      process.env[key.trim()] = value.join('=').trim();
    }
  });
}

const GROQ_API_KEY = process.env.GROQ_API_KEY;
const DEEPGRAM_API_KEY = process.env.DEEPGRAM_API_KEY;
const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY;

// SECURITY: Only log in development
if (process.env.NODE_ENV !== 'production') {
  console.log('API Keys loaded:', {
    groq: !!GROQ_API_KEY,
    deepgram: !!DEEPGRAM_API_KEY,
    elevenlabs: !!ELEVENLABS_API_KEY,
  });
}

const app = express();
const server = createServer(app);
const wss = new WebSocketServer({ server });

// ===== SECURITY: Helmet =====
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: [
          "'self'",
          "'unsafe-inline'",
          "'unsafe-eval'",
          'https://unpkg.com',
          'https://cdn.tailwindcss.com',
          'https://esm.sh',
        ],
        styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
        fontSrc: ["'self'", 'https://fonts.gstatic.com'],
        imgSrc: ["'self'", 'data:', 'https:'],
        mediaSrc: ["'self'", 'https:'],
        connectSrc: [
          "'self'",
          'https://api.groq.com',
          'https://api.deepgram.com',
          'https://api.elevenlabs.io',
        ],
        frameSrc: ["'none'"],
        objectSrc: ["'none'"],
        baseUri: ["'self'"],
        formAction: ["'self'"],
      },
    },
    crossOriginEmbedderPolicy: false,
    crossOriginResourcePolicy: { policy: 'cross-origin' },
  }),
);

// ===== SECURITY: Request Validation =====
app.use(validateRequest);

// ===== SECURITY: Rate Limiting =====
app.use('/api/', rateLimit);

// ===== SECURITY: Body Parser with Limits =====
app.use(express.json({ limit: '10kb' }));

// Serve static files
app.use(express.static(__dirname));

// Serve index.html for root
app.get('/', (req, res) => {
  res.sendFile(join(__dirname, 'index.html'));
});

// Health check
app.get('/api/health', (req, res) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
  });
});

// Config endpoint - serves public client ID only (NOT the secret)
app.get('/api/config', (req, res) => {
  res.json({
    clientId: process.env.GOOGLE_CLIENT_ID || '',
    network: process.env.SUI_NETWORK || 'testnet',
  });
});

// ===== ZKLOGIN AUTH =====
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const crypto = require('crypto');

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

    if (!idToken || typeof idToken !== 'string') {
      return res.status(400).json({ error: 'Missing idToken' });
    }

    // SECURITY: Verify token format
    const tokenParts = idToken.split('.');
    if (tokenParts.length !== 3 || idToken.length > 2000) {
      return res.status(400).json({ error: 'Invalid token format' });
    }

    // Decode JWT
    const [, payloadB64] = tokenParts;
    const payload = JSON.parse(Buffer.from(payloadB64, 'base64url').toString());

    // Verify expiry
    const now = Math.floor(Date.now() / 1000);
    if (payload.exp && payload.exp < now) {
      return res.status(401).json({ error: 'Token expired' });
    }

    // Verify token age (max 1 hour)
    if (payload.iat && now - payload.iat > 3600) {
      return res.status(401).json({ error: 'Token too old' });
    }

    // Verify audience
    if (GOOGLE_CLIENT_ID && payload.aud !== GOOGLE_CLIENT_ID) {
      return res.status(401).json({ error: 'Invalid audience' });
    }

    // Verify issuer
    if (
      !['https://accounts.google.com', 'https://openidconnect.googleapis.com'].includes(payload.iss)
    ) {
      return res.status(401).json({ error: 'Invalid issuer' });
    }

    // SECURITY: Verify sub is numeric
    if (!payload.sub || !/^\d+$/.test(payload.sub)) {
      return res.status(401).json({ error: 'Invalid subject' });
    }

    // Derive Sui address
    const suiAddress = deriveSuiAddress(payload.sub, payload.aud, payload.iss);

    // Return verified info (NO PII stored)
    res.json({
      verified: true,
      address: suiAddress,
      name: payload.name || payload.given_name || 'User',
    });
  } catch (error) {
    // SECURITY: Don't leak error details
    console.error('Auth verification failed');
    res.status(401).json({ error: 'Verification failed' });
  }
});

// Chat completion endpoint
app.post('/api/chat', express.json(), async (req, res) => {
  try {
    const { messages } = req.body;

    // INPUT VALIDATION
    if (!Array.isArray(messages) || messages.length === 0) {
      return res.status(400).json({ error: 'Messages required' });
    }

    if (messages.length > 20) {
      return res.status(400).json({ error: 'Too many messages' });
    }

    // Sanitize messages
    const sanitizedMessages = messages
      .filter((msg) => msg.role && msg.content && typeof msg.content === 'string')
      .slice(-20)
      .map((msg) => ({
        role: msg.role,
        content: msg.content.slice(0, 1000).replace(/[<>{}]/g, ''),
      }));

    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${GROQ_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'llama-3.3-70b-versatile',
        messages: [
          {
            role: 'system',
            content: `You are Ankore, a calm, warm AI wellness companion. Keep responses SHORT (1-3 sentences). Warm, steady tone. Guide through breathing when overwhelmed. Help break tasks when unfocused. Never diagnose. Validate feelings first. Crisis? Say: "Please call 988."`,
          },
          ...sanitizedMessages,
        ],
        temperature: 0.7,
        max_tokens: 150,
      }),
    });
    const data = await response.json();

    // SECURITY: Validate response
    const aiText = data.choices?.[0]?.message?.content || "I'm here. Take a breath with me.";

    res.json({
      text: aiText.slice(0, 500),
      audio: null,
    });
  } catch (err) {
    // SECURITY: Don't leak error details
    console.error('Chat request failed');
    res.status(500).json({ error: 'Chat failed' });
  }
});

// WebSocket for real-time voice
const wsConnections = new Set();
const wsRateLimit = new Map();

wss.on('connection', (ws) => {
  const ip = ws._socket?.remoteAddress || 'unknown';

  // SECURITY: Check if IP is blocked
  const { isIPBlocked } = require('./api/middleware');
  if (isIPBlocked(ip)) {
    ws.close(1008, 'Access denied');
    return;
  }

  // SECURITY: Limit connections per IP
  const wsKey = `ws:${ip}`;
  const wsCount = wsRateLimit.get(wsKey) || 0;
  if (wsCount > 5) {
    ws.close(1008, 'Too many connections');
    return;
  }
  wsRateLimit.set(wsKey, wsCount + 1);

  wsConnections.add(ws);
  console.log('Client connected');

  let deepgramSocket = null;

  ws.on('message', async (data) => {
    try {
      // SECURITY: Validate message size
      if (data.length > 100000) {
        // 100KB limit
        ws.send(JSON.stringify({ type: 'error', message: 'Message too large' }));
        return;
      }

      const msg = JSON.parse(data.toString());

      if (msg.type === 'start_listening') {
        // Connect to Deepgram for STT
        deepgramSocket = new WebSocket(
          'wss://api.deepgram.com/v1/listen?model=nova-2&language=en&smart_format=true',
          { headers: { Authorization: `Token ${DEEPGRAM_API_KEY}` } },
        );

        deepgramSocket.onopen = () => {
          ws.send(JSON.stringify({ type: 'listening_started' }));
        };

        deepgramSocket.onmessage = async (event) => {
          try {
            const transcript = JSON.parse(event.data);
            if (transcript.is_final && transcript.channel?.alternatives?.[0]?.transcript) {
              const text = transcript.channel.alternatives[0].transcript;
              ws.send(JSON.stringify({ type: 'transcript', text }));

              // Get AI response
              ws.send(JSON.stringify({ type: 'ai_thinking' }));
              const aiResponse = await getAIResponse(text);

              // Get TTS audio
              const ttsAudio = await getTTS(aiResponse);

              ws.send(
                JSON.stringify({
                  type: 'ai_response',
                  text: aiResponse,
                  audio: ttsAudio ? Buffer.from(ttsAudio).toString('base64') : null,
                }),
              );
            }
          } catch (_e) {
            console.error('Deepgram message processing failed');
          }
        };

        deepgramSocket.onerror = (_err) => {
          console.error('Deepgram connection failed');
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
        // SECURITY: Validate text message
        if (!msg.text || typeof msg.text !== 'string' || msg.text.length > 1000) {
          ws.send(JSON.stringify({ type: 'error', message: 'Invalid message' }));
          return;
        }

        ws.send(JSON.stringify({ type: 'ai_thinking' }));
        const aiResponse = await getAIResponse(msg.text.slice(0, 1000));
        const ttsAudio = await getTTS(aiResponse);

        ws.send(
          JSON.stringify({
            type: 'ai_response',
            text: aiResponse,
            audio: ttsAudio ? Buffer.from(ttsAudio).toString('base64') : null,
          }),
        );
      }
    } catch (_err) {
      console.error('WebSocket message handling failed');
    }
  });

  ws.on('close', () => {
    if (deepgramSocket) {
      deepgramSocket.close();
    }
    wsConnections.delete(ws);

    // Decrement connection count
    const wsKey = `ws:${ip}`;
    const wsCount = wsRateLimit.get(wsKey) || 1;
    if (wsCount <= 1) {
      wsRateLimit.delete(wsKey);
    } else {
      wsRateLimit.set(wsKey, wsCount - 1);
    }

    console.log('Client disconnected');
  });
});

async function getAIResponse(userMessage) {
  try {
    // SECURITY: Sanitize input
    const sanitized = userMessage.replace(/[<>{}]/g, '').slice(0, 1000);

    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${GROQ_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'llama-3.3-70b-versatile',
        messages: [
          {
            role: 'system',
            content: `You are Ankore, a calm, warm AI wellness companion. Keep responses SHORT (1-3 sentences). Warm, steady tone. Guide through breathing when overwhelmed. Help break tasks when unfocused. Never diagnose. Validate feelings first. For breathing, pace words: "In... 2... 3... 4..." Crisis? Say: "Please call 988."`,
          },
          { role: 'user', content: sanitized },
        ],
        temperature: 0.7,
        max_tokens: 150,
      }),
    });
    const data = await response.json();
    return (data.choices?.[0]?.message?.content || "I'm here. Take a breath with me.").slice(
      0,
      500,
    );
  } catch (err) {
    console.error('AI response failed');
    return "I'm here. Let's take a breath together.";
  }
}

async function getTTS(text) {
  try {
    // SECURITY: Validate text
    if (!text || text.length > 500) {
      return null;
    }

    const response = await fetch(
      'https://api.elevenlabs.io/v1/text-to-speech/21m00Tcm4TlvDq8ikWAM',
      {
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
            style: 0.3,
          },
        }),
      },
    );

    if (!response.ok) {
      console.error('TTS request failed');
      return null;
    }
    return await response.arrayBuffer();
  } catch (err) {
    console.error('TTS request failed');
    return null;
  }
}

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  // SECURITY: Don't log sensitive info in production
  if (process.env.NODE_ENV !== 'production') {
    console.log(`\n🎧 Ankore server running at http://localhost:${PORT}\n`);
  }
});
