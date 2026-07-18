# Ankore — Someone's Always Here

A voice-first AI wellness companion that's always available when you need someone to talk to.

## Features
- 🎤 Real-time voice conversation via Deepgram STT
- 🧠 AI responses powered by Groq (Llama 3.3)
- 🔊 Natural voice output via ElevenLabs TTS
- 🌊 Calming animations and breathing exercises
- 🔒 Private & secure — encrypted on-chain with Sui
- 🔐 zkLogin authentication (sign in with Google)

## Tech Stack
- **Frontend:** HTML, Tailwind CSS, Lucide Icons
- **Backend:** Node.js, Express, WebSocket
- **AI:** Groq (LLM), Deepgram (STT), ElevenLabs (TTS)
- **Auth:** Sui zkLogin (Google OAuth)
- **Hosting:** Vercel

## Deploy to Vercel

1. Push to GitHub
2. Go to [Vercel](https://vercel.com)
3. Import your GitHub repo
4. Add environment variables:
   - `GOOGLE_CLIENT_ID`
   - `GOOGLE_CLIENT_SECRET`
   - `GROQ_API_KEY`
   - `DEEPGRAM_API_KEY`
   - `ELEVENLABS_API_KEY`
5. Deploy!

## Local Development

```bash
# Install dependencies
npm install

# Create .env file
cp .env.example .env
# Add your API keys to .env

# Start server
node server.js

# Open http://localhost:3001
```

## Crisis Support

If you're in crisis, please call **988** (Suicide & Crisis Lifeline).

---

Built with 💜 for anyone who needs someone to talk to.
