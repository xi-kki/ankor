import { readFileSync } from 'fs';
import { join } from 'path';

// Load env vars
const envPath = join(process.cwd(), '.env');
let GROQ_API_KEY, DEEPGRAM_API_KEY, ELEVENLABS_API_KEY;

try {
    const envContent = readFileSync(envPath, 'utf8');
    envContent.split('\n').forEach(line => {
        const [key, ...value] = line.split('=');
        if (key && value.length) process.env[key.trim()] = value.join('=').trim();
    });
} catch (e) {}

GROQ_API_KEY = process.env.GROQ_API_KEY;
DEEPGRAM_API_KEY = process.env.DEEPGRAM_API_KEY;
ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY;

export default async function handler(req, res) {
    // CORS
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
                        content: `You are Ankore, a calm, warm AI wellness companion. Keep responses SHORT (1-3 sentences). Warm, steady tone. Guide through breathing when overwhelmed. Help break tasks when unfocused. Never diagnose. Validate feelings first. For breathing, pace words: "In... 2... 3... 4..." Crisis? Say: "Please call 988."`
                    },
                    ...messages
                ],
                temperature: 0.7,
                max_tokens: 150
            })
        });

        const data = await response.json();
        const aiText = data.choices?.[0]?.message?.content || "I'm here. Take a breath with me.";

        // Get TTS audio
        let ttsAudio = null;
        try {
            const ttsResponse = await fetch('https://api.elevenlabs.io/v1/text-to-speech/21m00Tcm4TlvDq8ikWAM', {
                method: 'POST',
                headers: {
                    'xi-api-key': ELEVENLABS_API_KEY,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    text: aiText,
                    model_id: 'eleven_turbo_v2',
                    voice_settings: {
                        stability: 0.7,
                        similarity_boost: 0.8,
                        style: 0.3
                    }
                })
            });

            if (ttsResponse.ok) {
                const audioBuffer = await ttsResponse.arrayBuffer();
                ttsAudio = Buffer.from(audioBuffer).toString('base64');
            }
        } catch (e) {
            console.error('TTS error:', e);
        }

        return res.status(200).json({
            text: aiText,
            audio: ttsAudio
        });

    } catch (error) {
        console.error('Chat error:', error);
        return res.status(500).json({ error: 'Failed to process request' });
    }
}
