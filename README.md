# 🎧 Ankore — Someone's Always Here

A voice-first AI wellness companion that's always available when you need someone to talk to.

## ✨ Features

- 🎤 **Voice-first conversation** — Speak naturally, AI responds with voice
- 🧠 **AI-powered responses** — Groq (Llama 3.3) for warm, helpful conversations
- 🔊 **Natural voice output** — ElevenLabs text-to-speech
- 🔐 **zkLogin authentication** — Sign in with Google, own your data on Sui blockchain
- 🔒 **End-to-end encryption** — Your conversations, your data, always
- 🌊 **Calming UI** — Dark theme with video parallax and smooth animations
- 📱 **Mobile responsive** — Works on all devices
- 📴 **Offline support** — Use core features without internet
- 📲 **PWA ready** — Install as app on your device

## 🚀 Quick Start

### Prerequisites

- Node.js 18+
- npm
- Google Cloud Console account (for OAuth)

### Installation

```bash
# Clone the repository
git clone https://github.com/xi-kki/ankore.git
cd ankore

# Install dependencies
npm install

# Copy environment variables
cp .env.example .env

# Edit .env with your API keys
# (see Environment Variables section below)

# Start development server
npm start

# Open http://localhost:3001
```

## 🔑 Environment Variables

| Variable               | Required | Description                    |
| ---------------------- | -------- | ------------------------------ |
| `GOOGLE_CLIENT_ID`     | ✅       | Google OAuth client ID         |
| `GOOGLE_CLIENT_SECRET` | ✅       | Google OAuth client secret     |
| `GROQ_API_KEY`         | ✅       | Groq API key for AI chat       |
| `DEEPGRAM_API_KEY`     | ✅       | Deepgram API key for STT       |
| `ELEVENLABS_API_KEY`   | ✅       | ElevenLabs API key for TTS     |
| `SUI_NETWORK`          | ❌       | Sui network (default: testnet) |
| `PORT`                 | ❌       | Server port (default: 3001)    |

### Getting API Keys

1. **Google OAuth**
   - Go to [Google Cloud Console](https://console.cloud.google.com/)
   - Create OAuth 2.0 credentials
   - Add `https://ankore.vercel.app/api/callback` to redirect URIs

2. **Groq**
   - Sign up at [groq.com](https://groq.com/)
   - Create API key

3. **Deepgram**
   - Sign up at [deepgram.com](https://deepgram.com/)
   - Create API key

4. **ElevenLabs**
   - Sign up at [elevenlabs.io](https://elevenlabs.io/)
   - Create API key

## 🏗️ Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    CLIENT (Browser)                      │
├─────────────────────────────────────────────────────────┤
│  Landing Page → App Page → Voice Recording → AI Chat    │
└─────────────────────────────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────┐
│                    API Layer (Vercel)                    │
├─────────────────┬─────────────────┬─────────────────────┤
│  /api/auth      │  /api/chat      │  /api/callback      │
│  (JWT verify)   │  (Groq + TTS)   │  (OAuth exchange)   │
└─────────────────┴─────────────────┴─────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────┐
│                 External Services                        │
├─────────────────┬─────────────────┬─────────────────────┤
│  Google OAuth   │  Groq AI        │  ElevenLabs TTS     │
│  Deepgram STT   │  Sui Blockchain │                     │
└─────────────────┴─────────────────┴─────────────────────┘
```

## 📴 Offline Support

Ankore works offline for core features:

### Available Offline

| Feature                 | Works Offline | Notes                                    |
| ----------------------- | ------------- | ---------------------------------------- |
| Breathing Exercises     | ✅ Yes        | All 4 patterns (Calm, Box, 4-7-8, Quick) |
| View Past Conversations | ✅ Yes        | Stored in IndexedDB                      |
| AI Chat                 | ❌ No         | Requires internet                        |
| Voice Recording         | ❌ No         | Requires Deepgram API                    |
| Sign In                 | ❌ No         | Requires Google OAuth                    |

### How It Works

1. **Service Worker** — Caches static assets for offline use
2. **IndexedDB** — Stores conversations locally
3. **Offline Fallback** — Friendly offline page when no connection
4. **Auto-Sync** — Syncs conversations when back online

### PWA Installation

Install Ankore as an app on your device:

**iOS Safari:**

1. Open Ankore in Safari
2. Tap Share → Add to Home Screen

**Android Chrome:**

1. Open Ankore in Chrome
2. Tap Install app banner

**Desktop:**

1. Click Install icon in address bar
2. Follow prompts

### Offline Storage Management

- Conversations stored in IndexedDB (up to 50MB)
- Settings stored in localStorage
- Storage usage visible in Settings
- Clear data option available

## 🔒 Security

Ankore implements multiple security layers:

- **JWT Verification** — Uses `jose` library for proper Google JWT verification
- **CORS Protection** — Restricted to allowed origins only
- **Rate Limiting** — 30 requests per minute per IP
- **Input Validation** — All user inputs sanitized and validated
- **Security Headers** — Helmet.js with CSP, X-Frame-Options, etc.
- **IP Blocklist** — Known malicious IPs automatically blocked
- **Secret Scanning** — Gitleaks in CI/CD pipeline

See [SECURITY.md](SECURITY.md) for complete security documentation.

## 📁 Project Structure

```
ankore/
├── index.html           # Main application
├── privacy.html         # Privacy policy
├── terms.html           # Terms of service
├── offline.html         # Offline fallback page
├── server.js            # Express server (local dev)
├── sw.js                # Service Worker for offline
├── manifest.json        # PWA manifest
├── offline-storage.js   # IndexedDB storage
├── offline-breathing.js # Offline breathing exercises
├── api/                 # Vercel serverless functions
│   ├── auth.js          # JWT verification
│   ├── callback.js      # OAuth callback
│   ├── chat.js          # AI chat endpoint
│   ├── config.js        # Public config
│   ├── health.js        # Health check
│   ├── middleware.js     # Security middleware
│   └── security.js      # Crypto utilities
├── .github/workflows/   # CI/CD
│   └── security.yml     # Security scanning
├── CLAUDE.md            # AI rules file
├── SECURITY.md          # Security policy
├── package.json         # Dependencies
└── vercel.json          # Vercel configuration
```

## 🚀 Deployment

### Vercel (Recommended)

1. Push to GitHub
2. Go to [vercel.com](https://vercel.com)
3. Import repository
4. Add environment variables
5. Deploy!

### Local Development

```bash
npm start
# Open http://localhost:3001
```

## 🧪 Testing

```bash
# Run security audit
npm run security

# Fix vulnerabilities
npm run audit:fix

# Health check
curl http://localhost:3001/api/health
```

## 📚 Documentation

- [SECURITY.md](SECURITY.md) — Security policy and measures
- [CLAUDE.md](CLAUDE.md) — AI rules and architecture
- [privacy.html](https://ankore.vercel.app/privacy.html) — Privacy policy
- [terms.html](https://ankore.vercel.app/terms.html) — Terms of service

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Run security scan: `npm run security`
5. Submit a pull request

## 📄 License

ISC

## 🆘 Crisis Support

If you're in crisis, please call **988** (Suicide & Crisis Lifeline).

---

Built with 💜 for anyone who needs someone to talk to.

**Live at:** [ankore.vercel.app](https://ankore.vercel.app)
