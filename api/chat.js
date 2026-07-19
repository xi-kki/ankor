import { readFileSync } from 'fs';
import { join } from 'path';

// Load env vars
const envPath = join(process.cwd(), '.env');
try {
  const envContent = readFileSync(envPath, 'utf8');
  envContent.split('\n').forEach((line) => {
    const [key, ...value] = line.split('=');
    if (key && value.length) {
      process.env[key.trim()] = value.join('=').trim();
    }
  });
} catch (_e) {}

const GROQ_API_KEY = process.env.GROQ_API_KEY;
const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY;

// SECURITY: Input sanitization
function sanitizeInput(text) {
  if (typeof text !== 'string') {
    return '';
  }

  // Remove potential injection patterns
  return text
    .replace(/[<>{}]/g, '') // Remove HTML/template chars
    .replace(/\b(system|assistant)\b/gi, '') // Remove role injection attempts
    .slice(0, 1000); // Limit length
}

// SECURITY: Validate messages array
function validateMessages(messages) {
  if (!Array.isArray(messages)) {
    return { valid: false, error: 'Messages must be an array' };
  }

  if (messages.length === 0) {
    return { valid: false, error: 'Messages cannot be empty' };
  }

  if (messages.length > 20) {
    return { valid: false, error: 'Too many messages (max 20)' };
  }

  // Validate each message
  for (const msg of messages) {
    if (!msg.role || !msg.content) {
      return { valid: false, error: 'Invalid message format' };
    }

    if (!['user', 'assistant', 'system'].includes(msg.role)) {
      return { valid: false, error: 'Invalid message role' };
    }

    if (typeof msg.content !== 'string') {
      return { valid: false, error: 'Message content must be a string' };
    }

    if (msg.content.length > 1000) {
      return { valid: false, error: 'Message too long (max 1000 chars)' };
    }
  }

  return { valid: true };
}

// SECURITY: Fetch with timeout
async function fetchWithTimeout(url, options, timeoutMs = 10000) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
    });
    clearTimeout(timeout);
    return response;
  } catch (error) {
    clearTimeout(timeout);
    if (error.name === 'AbortError') {
      throw new Error('Request timeout', { cause: error });
    }
    throw error;
  }
}

export default async function handler(req, res) {
  // SECURITY: Strict CORS
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
    const { messages } = req.body;

    // INPUT VALIDATION
    const validation = validateMessages(messages);
    if (!validation.valid) {
      return res.status(400).json({ error: validation.error });
    }

    // SANITIZE all messages
    const sanitizedMessages = messages.map((msg) => ({
      role: msg.role,
      content: sanitizeInput(msg.content),
    }));

    // SECURITY: Add rate limiting header
    res.setHeader('X-RateLimit-Limit', '30');

    // SECURITY: Fetch with timeout (10 seconds)
    const response = await fetchWithTimeout(
      'https://api.groq.com/openai/v1/chat/completions',
      {
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
            ...sanitizedMessages,
          ],
          temperature: 0.7,
          max_tokens: 150,
        }),
      },
      10000,
    ); // 10 second timeout

    const data = await response.json();

    // SECURITY: Validate response from Groq
    if (!data.choices || !data.choices[0] || !data.choices[0].message) {
      // SECURITY: Don't log full response
      return res.status(502).json({ error: 'Invalid response from AI' });
    }

    const aiText = data.choices[0].message.content || "I'm here. Take a breath with me.";

    // SECURITY: Sanitize AI response
    const sanitizedAiText = aiText.slice(0, 500); // Limit response length

    // Get TTS audio
    let ttsAudio = null;
    try {
      if (ELEVENLABS_API_KEY) {
        const ttsResponse = await fetchWithTimeout(
          'https://api.elevenlabs.io/v1/text-to-speech/21m00Tcm4TlvDq8ikWAM',
          {
            method: 'POST',
            headers: {
              'xi-api-key': ELEVENLABS_API_KEY,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              text: sanitizedAiText,
              model_id: 'eleven_turbo_v2',
              voice_settings: {
                stability: 0.7,
                similarity_boost: 0.8,
                style: 0.3,
              },
            }),
          },
          15000,
        ); // 15 second timeout for TTS

        if (ttsResponse.ok) {
          const audioBuffer = await ttsResponse.arrayBuffer();
          ttsAudio = Buffer.from(audioBuffer).toString('base64');
        }
      }
    } catch (e) {
      // SECURITY: Don't log full error
    }

    return res.status(200).json({
      text: sanitizedAiText,
      audio: ttsAudio,
    });
  } catch (error) {
    // SECURITY: Don't leak error details
    if (error.message === 'Request timeout') {
      return res.status(504).json({ error: 'AI service timeout' });
    }
    return res.status(500).json({ error: 'Failed to process request' });
  }
}
