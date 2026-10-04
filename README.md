# 🔨 CVForge — Create. Analyze. Improve.
React + Tailwind • Node/Express • MongoDB • JWT • AI Service • PDF/DOCX Parser

```
┌─────────────────────┐
│      React UI       │  frontend/src/App.jsx — #/ #/login #/dashboard #/create
│  CV Creator/Upload  │  #/preview #/analyzer #/match #/profile #/templates #/settings
└──────────┬──────────┘
           │  REST API (JSON + multipart)
┌──────────▼──────────┐
│   Node.js/Express   │  backend/server.js — rate-limited, memory-only uploads
└───────┬───────┬─────┘  (5MB, PDF/DOCX/TXT/MD, never touch disk)
        │       │
┌───────▼───┐ ┌─▼──────────┐
│  MongoDB  │ │ AI Service │  store.js (Users/CVs/Analyses) • services/aiService.js
└───────────┘ └────────────┘  (LLM when OPENAI_API_KEY, else offline scoring)
        │
┌───────▼───────────┐
│ PDF/DOCX Parser   │  services/parserService.js + lib/parse.js (pdf-parse/mammoth)
└───────────────────┘  + JD-URL fetch with SSRF guard
```

## Collections
- **Users** {_id, name, email, passwordHash} — bcrypt + JWT 7d
- **CVs** {_id, userId, personalInfo, education, experience, skills, projects, template, createdAt}
- **Analyses** {_id, userId, cvId, scoreData, missingKeywords, suggestions, createdAt}

## Run (single origin — one URL serves UI + API, no CORS / 127.0.0.1 problem)
```bash
cd ~/cv_mern/backend && npm install && cp .env.example .env  # then edit JWT_SECRET!
cd ~/cv_mern/frontend && npm install && npm run build        # fixed for Termux (no /usr/bin/env there)
cd ~/cv_mern/backend && PORT=5001 node server.js &           # serves API + frontend/dist on :5001
# open http://127.0.0.1:5001  (hash routes #/analyzer etc. — API calls are same-origin;
# VITE_API_URL only needed for split hosting, e.g. Netlify + Render)
```

## MongoDB persistence (Atlas — Termux can't run mongod itself)
1. https://cloud.mongodb.com → free M0 cluster → Database Access user + Network Access `0.0.0.0/0` (dev) → Connect → **Node.js** → copy URI
2. `backend/.env`: `MONGO_URI=mongodb+srv://USER:PASS@cluster0.xxx.mongodb.net/cvforge`
3. Restart backend → `/api/health` shows `"mongo":true` (`false` = in-memory, wiped on restart)
4. Collections auto-created: **Users** / **CVs** / **Analyses** (schema above)

## Phases — all done ✓
1. **Creator**: 6-step form, live preview, modern/classic/minimal/neon, PDF download
2. **Upload**: PDF/DOCX/TXT multipart → text → structured `{name, education, skills, experience, projects}`
3. **Analyzer**: sections, skills, missing, keywords, formatting + honest suggestions (gaps shown as “add if truthful (Familiar)” — never invents)
4. **Matcher**: `POST /api/match` ranks one CV vs many JDs with present/missing per job
5. **Production**: login/signup, saved CVs, dashboard, in-memory→Atlas, rate limits, file restrictions, deployment-ready
