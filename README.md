# 🔨 CVForge — Create. Analyze. Improve.

React + Tailwind (neo-brutalist) • Node/Express • MongoDB • JWT • AI Service • PDF/DOCX parser.
Production-grade: pino logging, centralized error handling, helmet + rate limits + Zod validation, Vitest test suites, ESLint/Prettier + Husky hooks, GitHub Actions CI, Swagger docs.

Google sign-in uses Firebase Authentication (browser popup/redirect, backend Admin ID-token verification); password login and the legacy Google/GitHub OAuth routes remain available.

```
┌─────────────────────┐
│      React UI       │  frontend/src/App.jsx — #/ #/login #/dashboard #/create
│  CV Creator/Upload  │  #/preview #/analyzer #/match #/interview #/tracker ...
└──────────┬──────────┘
           │  REST API (JSON + multipart) — Bearer JWT on every route
┌──────────▼──────────┐
│   Node.js/Express   │  backend/app.js + routes/*.js — helmet, CORS allow-list,
└───────┬───────┬─────┘  rate limits, Zod validation, pino logs, memory-only uploads
        │       │
┌───────▼───┐ ┌─▼──────────┐
│  MongoDB  │ │ AI Service │  store.js (Users/CVs/Analyses/Applications)
└───────────┘ └────────────┘  aiService.js → llm.js (LLM when key) + scoring.js (offline)
        │
┌───────▼───────────┐
│ PDF/DOCX Parser   │  parserService.js + lib/parse.js (pdf-parse/mammoth)
└───────────────────┘  + JD-URL fetch with SSRF guard, magic-byte file checks
```

## Run (dev)

```bash
# Backend  (API on :5001)
cd backend && npm install && cp .env.example .env   # edit JWT_SECRET
npm run dev

# Frontend (Vite on :5173, proxies /api → :5001 — no CORS in dev)
cd frontend && npm install && npm run dev
```

Open http://127.0.0.1:5173 — Vite proxies `/api/*` to Express (see `vite.config.js`),
so both dev and prod talk same-origin. Firebase Google sign-in is optional: copy
`frontend/.env.example` to `frontend/.env.local` and fill the public Web App values
(see below).

## Run (production, single origin)

```bash
cd frontend && npm install && npm run build     # emits frontend/dist
cd ../backend && npm install --omit=dev
NODE_ENV=production JWT_SECRET=$(openssl rand -hex 32) node server.js
# Express serves the built SPA + API on one URL
```

## Environment (`backend/.env`)

| Var | Default | Purpose |
|-----|---------|---------|
| `PORT` | 5001 | API port |
| `JWT_SECRET` | dev default | **Required in prod** (≥32 chars, `openssl rand -hex 32`) |
| `MONGO_URI` | empty | Atlas URI; empty = in-memory store (wiped on restart) |
| `FRONTEND_URL` | localhost:5173 | First entry is the OAuth post-login redirect target; all entries are CORS origins |
| `GOOGLE_CLIENT_ID` | empty | Google OAuth client ID (optional) |
| `GOOGLE_CLIENT_SECRET` | empty | Google OAuth client secret (optional; backend only) |
| `GOOGLE_CALLBACK_URL` | empty | Exact Google redirect URI, e.g. `https://HOST/api/auth/google/callback` |
| `GITHUB_CLIENT_ID` | empty | GitHub OAuth app client ID (optional) |
| `GITHUB_CLIENT_SECRET` | empty | GitHub OAuth app client secret (optional; backend only) |
| `GITHUB_CALLBACK_URL` | empty | Exact GitHub callback URL, e.g. `https://HOST/api/auth/github/callback` |
| `FIREBASE_PROJECT_ID` | empty | Must be `cvforge-ca97c` when Firebase is enabled |
| `FIREBASE_SERVICE_ACCOUNT_PATH` | empty | Absolute path **outside this repo** to the Admin service-account JSON, mode `600`; both Firebase values are required together |
| `ADMIN_PASSWORD` | empty | ≥12 chars to seed `admin`; unset = no admin account |
| `OPENAI_API_KEY` | empty | Paid LLM features; empty = local then offline fallback |
| `LOCAL_LLM_ENABLED` | true | Enable the Ollama fallback |
| `LOCAL_LLM_BASE_URL` | `http://127.0.0.1:11434/v1` | Ollama OpenAI-compatible endpoint |
| `LOCAL_LLM_MODEL` | `llama3.2` | Local model name (use `cvforge-qwen:latest` for the tuned setup) |
| `LOCAL_LLM_TIMEOUT_MS` | 120000 | Local completion timeout (CPU inference is slow) |
| `LLM_HEALTH_TIMEOUT_MS` | 30000 | Real-completion health probe timeout |
| `LOG_LEVEL` | info | pino level (`silent` for tests) |
| `TRUST_PROXY` | loopback | `1` behind Render/nginx, `loopback` for local tunnels |
| `FORCE_HTTPS` | false | Enable when TLS terminates at the proxy |
| `ALLOW_TUNNEL_ORIGINS` | false | Dev-only: accept rotating trycloudflare origins |
| `RATE_LIMIT_ENABLED` | true | Kill-switch for rate limits (tests set false) |

Full list + docs: `backend/.env.example`. Config is validated with Zod at startup —
production **fails fast** on weak or placeholder secrets and malformed values.

## Firebase Google sign-in (recommended)

Firebase Authentication handles the Google popup/redirect in the browser. The SPA
sends the resulting ID token to `POST /api/auth/firebase`; the backend verifies it with
Firebase Admin, requires project `cvforge-ca97c`, issuer, UID, and Google as the
sign-in provider, then creates or links a normal CVForge user. The backend still issues
its own 7-day JWT, so the rest of the API is unchanged. Only verified Google email
addresses may link to an existing account; ambiguous email ownership returns
`409 account_conflict` instead of merging accounts.

### Backend

1. Firebase Console → Project settings → Service accounts → generate a private key.
   Create the parent directory with mode `700`, store the JSON **outside this repository**, for example
   `/data/data/com.termux/files/home/.secrets/cvforge-firebase-admin.json`, and `chmod 600` it.
2. Set both values in `backend/.env`:
   `FIREBASE_PROJECT_ID=cvforge-ca97c` and
   `FIREBASE_SERVICE_ACCOUNT_PATH=/absolute/path/outside/repo/key.json`.
   The server starts without them, but the Firebase endpoint returns
   `503 firebase_not_configured` until both are present.
3. Restart the backend. The service account file is re-read on the next process start;
   invalid project IDs, in-repo paths, or group/world-readable files fail validation.

The Admin key is backend-only and is never sent to the SPA. The Firebase Web App
configuration values are public, but they are still supplied at build time rather than
committed.

### Frontend

Copy `frontend/.env.example` to `frontend/.env.local` and fill the Firebase Console →
Project settings → General → Your apps → Web app values:

| Var | Purpose |
|-----|---------|
| `VITE_FIREBASE_API_KEY` | Public Web API key |
| `VITE_FIREBASE_AUTH_DOMAIN` | Usually `cvforge-ca97c.firebaseapp.com` |
| `VITE_FIREBASE_PROJECT_ID` | Must be `cvforge-ca97c` |
| `VITE_FIREBASE_STORAGE_BUCKET` | Web app storage bucket |
| `VITE_FIREBASE_MESSAGING_SENDER_ID` | Web app sender ID |
| `VITE_FIREBASE_APP_ID` | Web app ID |

In Firebase Console → Authentication → Settings → Authorized domains, add the exact
deployment host (confirm the ngrok host; add a new ngrok host if the tunnel restarts)
and `localhost` if you test locally. Popup sign-in is used on desktop with a redirect fallback for mobile and
blocked popups. If the frontend has no Firebase values, the Google button falls back to
the legacy backend Google route when that provider is configured.

### Rollback

Remove the two `FIREBASE_*` values from `backend/.env` and the `VITE_FIREBASE_*` values
from the frontend build, then rebuild/restart. The Firebase route returns 503 and the
legacy Google/GitHub routes remain available if their credentials are still configured.
The additive `firebaseUid` index is safe to leave in place.

## Legacy OAuth setup (Google / GitHub)

These backend-only routes remain available for rollback and GitHub sign-in. Client
secrets never reach the SPA. Configure one or both providers:

1. Expose CVForge on a public HTTPS origin, or use localhost for local development.
   Production must serve the SPA and API from the same origin (Express does this) so
   the short-lived HttpOnly OAuth cookie is sent back. A split frontend/API origin
   does not work without additional CORS-credential support.
2. Google Cloud Console → OAuth consent screen → Credentials → Create OAuth client ID
   (Web application). Add the origin under **Authorized JavaScript origins** and the
   exact callback under **Authorized redirect URIs**, e.g.
   `https://HOST/api/auth/google/callback`. Copy the client ID and secret.
3. GitHub → Settings → Developer settings → OAuth Apps → New OAuth App. Set the
   homepage to the app origin and the **Authorization callback URL** to the exact
   value, e.g. `https://HOST/api/auth/github/callback`. Copy the client ID and secret.
4. Put the values in `backend/.env`, set `FRONTEND_URL` to the same public origin,
   keep `JWT_SECRET` stable, and restart the backend. Registering a different callback
   in the provider console and `.env` is the most common cause of `redirect_uri_mismatch`.
5. For local development, the Vite proxy keeps `/api` same-origin:
   frontend `http://localhost:5173`, backend `http://localhost:5001`, callback
   `http://localhost:5001/api/auth/{provider}/callback`. Local HTTP OAuth testing
   also requires `NODE_ENV=development`; production mode always marks OAuth cookies
   `Secure`, so it needs HTTPS.

Never commit real client IDs or secrets. Real provider verification cannot be claimed
until the external console configuration is complete and tested with the actual
credentials.

## Local AI (Ollama) — no OpenAI required

CVForge tries OpenAI only when configured, then local Ollama, then offline scoring.
Health is reported as available only after a real one-token completion; a configured
provider that has never completed a request is not reported healthy.

```bash
# one-time model setup (0.5B is the default for this 7.2 GB Termux device)
cd backend
ollama pull qwen2.5:0.5b
ollama create cvforge-qwen:latest -f scripts/Modelfile.local
# optional quality upgrade; requires ~1.3 GB RAM and is much slower on CPU
ollama pull qwen2.5:1.5b
ollama create cvforge-qwen:1.5b -f scripts/Modelfile.local-1.5b

# start / check / stop the daemon
npm run local:start
npm run local:status
npm run local:stop          # only stops a process this script started
npm run verify:local        # real health + completion + CV enhancement
```

Termux has no systemd, so `scripts/start_local_llm.sh` uses `start-stop-daemon`
and keeps a pid file. On a systemd host, enable the official `ollama` service
instead (`systemctl enable --now ollama`). Keep `OLLAMA_HOST=127.0.0.1:11434`;
do not expose the model server publicly.

The enhancement prompt now requires every sentence to change, preserves facts, and
uses a second local-only attempt if the model echoes the input or copies the job
description. If it still returns the original text, the job description, or no
usable rewrite, the API labels the result offline with an explicit error instead of
pretending an AI rewrite happened. The default 0.5B model is fast enough for
interactive use here (~10–15 s for a short CV); the 1.5B model produces stronger
wording but measured ~2 tokens/s and 50–65 s cold latency, so it remains optional.
Transport retries are local-only (one retry); paid OpenAI requests are never
retried automatically.

## JD URL import

`POST /api/jd-import` (authenticated JSON `{ "url": "https://..." }`) fetches a
public job posting, extracts readable text, and returns `{ text, length }`.
`parserService.fetchJDFromURL` blocks loopback, link-local, private, file, and
non-HTTP targets. The Analyzer UI exposes the same import and a CV file upload
(PDF, DOCX, TXT, MD, up to 5 MB); file analysis is sent as multipart to
`POST /api/analyze`.

## Tunnels and Ngrok

`ALLOW_TUNNEL_ORIGINS=true` only permits rotating tunnel origins in the CORS
allow-list. Ngrok's free tier can inject a browser-warning interstitial, which
breaks automated API/browser checks even though the Express service is healthy.
Tunnels are a local-development convenience, not a production deployment, and the
external tunnel path is not covered by this repository's verification.

## Scripts

| Where | Command | What |
|-------|---------|------|
| root | `npm run lint` | ESLint across backend + frontend |
| root | `npm run format` | Prettier write |
| root | `npm test` | backend + frontend test suites |
| backend | `npm test` | Vitest + supertest (unit + API security/IDOR tests) |
| frontend | `npm test` | Vitest + React Testing Library (component tests) |
| frontend | `npm run build` | Vite production build |

Git hooks: Husky runs `lint-staged` (Prettier + ESLint --fix on staged files) pre-commit.

## API documentation

- Swagger UI: `GET /api/docs` (served by the app)
- OpenAPI spec: `GET /api/openapi.json` (source: `backend/docs/openapi.json`)

## Security

See **[SECURITY.md](SECURITY.md)** — full control map: auth on every route, ownership
scoping (no IDOR), captcha on register, Zod validation/sanitization, helmet headers,
locked CORS, rate limiting, audit logging, OAuth state validation + PKCE and
verified-email-only account linking, magic-byte upload verification, no default
admin credentials, `npm audit` clean (CI enforces).

## Testing & CI

- Backend: scoring units + API integration (auth, captcha, IDOR, validation, upload
  sniffing, CORS/ngrok allow-list, JSON error shapes, JD URL SSRF guard), mocked
  Google/GitHub OAuth flows (state/PKCE, linking, conflicts, failures), Firebase
  ID-token/claim validation and account resolution, plus gated MongoDB index/linking
  integration tests (`TEST_MONGO_URI`), and mock OpenAI/local-provider tests. Run
  `cd backend && npm test`.
- Frontend: component tests for landing/login/404, legacy OAuth callback exchange/error
  handling, Firebase popup/redirect/token exchange and cancellation paths, and
  API-wired pages; Analyzer tests cover JD URL import and multipart CV upload. Run
  `cd frontend && npm test`.
- Local verification: `cd backend && npm run verify:local` uses a real Ollama model.
- `.github/workflows/ci.yml`: lint job, backend job (tests + audit ≥high fails),
  frontend job (tests + build + audit) on every PR to `main`.

## Design system — Neo-brutalism (charcoal / forest / crimson)

Tokens in `frontend/src/index.css`: `--ink:#1A1A1A`, `--forest:#1B4332`,
`--crimson:#C1121F`, paper `#F6F1E7`; 0px radius, 2–4px visible borders, hard offset
shadows, visible grid, 700–900 typography (Inter + JetBrains Mono), visible focus rings,
reduced-motion support, light & dark themes. The CV renderer additionally ships a
**Brutal** template (plus modern/minimal/professional/tech/fresher/classic/neon).

## Deployment (Render blueprint)

`render.yaml` provisions one web service: builds the SPA, serves API + UI from Express,
health check `/api/health`, generates `JWT_SECRET`, sets `NODE_ENV=production`,
`TRUST_PROXY=1`, `FORCE_HTTPS=true`. Add `MONGO_URI` for persistence. Ollama is a
local CPU process and is not provisioned by `render.yaml`; a hosted deployment needs
an external model endpoint or the offline scoring fallback.

Firebase on Render: set `FIREBASE_PROJECT_ID=cvforge-ca97c` and
`FIREBASE_SERVICE_ACCOUNT_PATH` to a mounted Admin JSON path outside the repository
(parent directory `700`, file `600`). Render does not create the service-account file;
provision it through a secret file or persistent disk before enabling Firebase. Set all
six `VITE_FIREBASE_*` build variables before `npm run build`; otherwise Firebase sign-in
returns `503`. Do not commit real credential values.

## Verification status and external dependencies

- **Verified locally:** real Ollama health/completion/enhancement, offline fallback,
  mock OpenAI/local providers, mocked Google/GitHub OAuth and Firebase flows,
  API/UI tests, and the production build.
- **Blocked without credentials:** live OpenAI, live Google/GitHub OAuth, and live
  Firebase Google sign-in. No paid request or real provider sign-in is claimed. Live
  Firebase needs the Web App values, an Admin service-account JSON, authorized
  domains, and a restarted backend.
- **External and unverified here:** Ngrok/browser-interstitial behavior, hosted
  deployment, Atlas connectivity, Firebase Console state, provider-dashboard
  behavior/private-email policy, and any model endpoint not on this machine.
- Verification date: 2026-11-02. Re-run the commands above on the target host; local
  success does not prove a hosted or paid-provider path.
