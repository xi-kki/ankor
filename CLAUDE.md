# Ankore — CLAUDE.md

## 🎯 Overview
- **One-liner:** Voice-first AI wellness companion with Sui zkLogin — sign in with Google, own your data on-chain
- **Type:** Web2 + Web3 (Sui blockchain for data ownership)
- **Status:** 🟢 Production deployed at ankore.vercel.app

## 🏗️ Tech Stack
- **Language:** JavaScript (Node.js)
- **Frontend:** Vanilla HTML + Tailwind CSS + Lucide Icons
- **Backend:** Express.js + WebSocket
- **AI:** Groq (Llama 3.3) for chat, Deepgram for STT, ElevenLabs for TTS
- **Auth:** Sui zkLogin (Google OAuth → invisible wallet)
- **Blockchain:** Sui testnet
- **Hosting:** Vercel (serverless functions)
- **Package Manager:** npm

## 📁 Structure
```
ankore/
├── index.html           # Main app (landing + app page)
├── privacy.html         # Privacy policy
├── terms.html           # Terms of service
├── server.js            # Express server (local dev)
├── api/
│   ├── auth.js          # JWT verification (jose)
│   ├── callback.js      # OAuth token exchange
│   ├── chat.js          # Groq AI + ElevenLabs TTS
│   ├── config.js        # Public config endpoint
│   ├── health.js        # Health check
│   ├── middleware.js     # Rate limiting, validation
│   └── security.js      # Crypto utilities
├── .github/
│   └── workflows/
│       └── security.yml # CI/CD security scanning
├── SECURITY.md          # Security policy
├── README.md            # Project documentation
├── package.json         # Dependencies
├── vercel.json          # Vercel config
└── .env                 # Environment variables (gitignored)
```

## 🧠 Architecture
- **Data flow:** User → Mic → Deepgram STT → Groq AI → ElevenLabs TTS → Speaker
- **Auth flow:** Google OAuth → /api/callback → JWT verification → Sui address derived
- **Key modules:**
  1. `index.html` — Single-page app with landing + app views
  2. `api/chat.js` — AI conversation endpoint
  3. `api/auth.js` — JWT verification with jose library
  4. `server.js` — Local development server with WebSocket

## ⚡ Build Order
- Phase 1: Foundation ✅ Complete
- Phase 2: Core Build ✅ Complete
- Phase 3: Security ✅ Complete
- Phase 4: Quality & Polish 🔧 In Progress
- Phase 5: Enhancement Features 🔲 Pending

## 🔐 Security (NON-NEGOTIABLE)
1. ✅ NEVER commit .env (gitignored)
2. ✅ Validate ALL user inputs (middleware.js)
3. ✅ Rate limiting on all endpoints (30 req/min)
4. ✅ CORS restricted to allowed origins
5. ✅ JWT verification with jose (not manual decode)
6. ✅ Helmet.js security headers
7. ✅ IP blocklist for malicious actors
8. ✅ Input sanitization (remove HTML, limit length)

## ✅ Quality Gates Before Ship
- [x] Secret scan (Gitleaks in CI)
- [x] Input validation (middleware.js)
- [x] Rate limiting (middleware.js)
- [x] Security headers (Helmet.js)
- [ ] Type checking (not applicable — vanilla JS)
- [ ] Linter (not configured yet)
- [x] Happy path works (deployed at ankore.vercel.app)
- [ ] Error boundaries (UI crashes on API failure)
- [x] README written
- [x] Privacy policy
- [x] Terms of service

## 🚫 What NOT To Do
- Don't store API keys in code (use .env)
- Don't skip JWT signature verification (critical)
- Don't use wildcard CORS (security risk)
- Don't add features without security review
- Don't commit .env or secrets to git
- Don't expose error details in production

## 📝 Environment Variables
```env
# Required
GOOGLE_CLIENT_ID=your-google-client-id
GOOGLE_CLIENT_SECRET=your-google-client-secret
GROQ_API_KEY=your-groq-api-key
DEEPGRAM_API_KEY=your-deepgram-api-key
ELEVENLABS_API_KEY=your-elevenlabs-api-key

# Optional
SUI_NETWORK=testnet
PORT=3001
```

## 🔧 Development Commands
```bash
# Install dependencies
npm install

# Start local server
npm start

# Run security audit
npm run security

# Fix vulnerabilities
npm run audit:fix
```

## 🚀 Deployment
- **Platform:** Vercel
- **Production URL:** https://ankore.vercel.app
- **GitHub:** https://github.com/xi-kki/ankore
- **Branch:** master

## 📚 Key Documentation
- `SECURITY.md` — Security policy and measures
- `README.md` — Project overview and setup
- `privacy.html` — Privacy policy page
- `terms.html` — Terms of service page

---

*Last updated: July 18, 2026*
