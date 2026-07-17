import express from 'express';
import { createServer } from 'http';
import { WebSocketServer } from 'ws';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load env vars
const envContent = readFileSync(join(__dirname, '.env'), 'utf8');
envContent.split('\n').forEach(line => {
    const [key, ...value] = line.split('=');
    if (key && value.length) process.env[key.trim()] = value.join('=').trim();
});

const GROQ_API_KEY = process.env.GROQ_API_KEY;
const DEEPGRAM_API_KEY = process.env.DEEPGRAM_API_KEY;
const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY;

const app = express();
const server = createServer(app);
const wss = new WebSocketServer({ server });

// Serve static files
app.use(express.static(__dirname));

// Health check
app.get('/api/health', (req, res) => {
    res.json({
        groq: !!GROQ_API_KEY,
        deepgram: !!DEEPGRAM_API_KEY,
        elevenlabs: !!ELEVENLABS_API_KEY
    });
});

// Text-to-speech endpoint
app.post('/api/tts', express.json(), async (req, res) => {
    try {
        const { text, voice_id = '21m00Tcm4TlvDq8ikWAM' } = req.body; // Rachel - calm female voice

        const response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voice_id}`, {
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
                    use_speaker_boost: true
                }
            })
        });

        if (!response.ok) {
            const err = await response.text();
            console.error('ElevenLabs error:', err);
            return res.status(500).json({ error: 'TTS failed' });
        }

        const audioBuffer = await response.arrayBuffer();
        res.set({
            'Content-Type': 'audio/mpeg',
            'Content-Length': audioBuffer.byteLength
        });
        res.send(Buffer.from(audioBuffer));
    } catch (err) {
        console.error('TTS error:', err);
        res.status(500).json({ error: 'TTS failed' });
    }
});

// Chat completion endpoint (for non-streaming)
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
                        content: `You are Ankor, a calm, warm AI wellness companion. You speak like a gentle, supportive friend — not a therapist.

CORE RULES:
- Keep responses SHORT (1-3 sentences max)
- Use a warm, steady, calming tone
- When someone is overwhelmed, guide them through breathing or grounding
- When someone can't focus, help them break tasks into tiny steps
- Never diagnose or give medical advice
- Always validate their feelings first
- Use "I hear you" and "You're safe" often
- For breathing exercises, pace your words: "In... 2... 3... 4..."
- If crisis detected (self-harm, suicide), immediately say: "Please call 988 or text HOME to 741741. You matter."

PERSONALITY:
- Warm like a best friend at 2 AM
- Patient, never rushed
- Speaks in short, grounding sentences
- Uses silence (pauses) effectively
- Celebrates small wins`
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
    let audioBuffer = [];

    ws.on('message', async (data) => {
        try {
            const msg = JSON.parse(data);

            if (msg.type === 'start_listening') {
                // Connect to Deepgram for STT
                deepgramSocket = new WebSocket(
                    `wss://api.deepgram.com/v1/listen?model=nova-2&language=en&smart_format=true`,
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

                        // Send transcript to client
                        ws.send(JSON.stringify({ type: 'transcript', text }));

                        // Get AI response
                        const aiResponse = await getAIResponse(text);
                        ws.send(JSON.stringify({ type: 'ai_thinking' }));

                        // Get TTS audio
                        const ttsAudio = await getTTS(aiResponse);

                        // Send response
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
                // Forward audio to Deepgram
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
                // Handle text input (for quick actions)
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
                        content: `You are Ankor, a calm, warm AI wellness companion. You speak like a gentle, supportive friend — not a therapist.

CORE RULES:
- Keep responses SHORT (1-3 sentences max)
- Use a warm, steady, calming tone
- When someone is overwhelmed, guide them through breathing or grounding
- When someone can't focus, help them break tasks into tiny steps
- Never diagnose or give medical advice
- Always validate their feelings first
- Use "I hear you" and "You're safe" often
- For breathing exercises, pace your words: "In... 2... 3... 4..."
- If crisis detected (self-harm, suicide), immediately say: "Please call 988 or text HOME to 741741. You matter."

PERSONALITY:
- Warm like a best friend at 2 AM
- Patient, never rushed
- Speaks in short, grounding sentences
- Uses silence (pauses) effectively
- Celebrates small wins`
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

        if (!response.ok) return null;
        return await response.arrayBuffer();
    } catch (err) {
        console.error('TTS error:', err);
        return null;
    }
}

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`\n🎧 Ankor server running at http://localhost:${PORT}\n`);
});
