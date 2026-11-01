# 🔨 CVForge — Create. Analyze. Improve.

React + Tailwind (neo-brutalist) • Node/Express • MongoDB • JWT • AI Service • PDF/DOCX parser.
Production-grade: pino logging, centralized error handling, helmet + rate limits + Zod validation, Vitest test suites, ESLint/Prettier + Husky hooks, GitHub Actions CI, Swagger docs.

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
so both dev and prod talk same-origin.

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
| `FRONTEND_URL` | localhost:5173 | Comma-separated CORS allow-list |
| `ADMIN_PASSWORD` | empty | ≥12 chars to seed `admin`; unset = no admin account |
| `OPENAI_API_KEY` | empty | LLM features; empty = offline scoring fallback |
| `LOG_LEVEL` | info | pino level (`silent` for tests) |
| `TRUST_PROXY` | loopback | `1` behind Render/nginx, `loopback` for local tunnels |
| `FORCE_HTTPS` | false | Enable when TLS terminates at the proxy |
| `ALLOW_TUNNEL_ORIGINS` | false | Dev-only: accept rotating trycloudflare origins |
| `RATE_LIMIT_ENABLED` | true | Kill-switch for rate limits (tests set false) |

Full list + docs: `backend/.env.example`. Config is validated with Zod at startup —
production **fails fast** on weak secrets or malformed values.

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
locked CORS, rate limiting, audit logging, magic-byte upload verification, no default
admin credentials, `npm audit` clean (CI enforces).

## Testing & CI

- Backend: 49 tests — scoring units + API integration (auth, captcha, IDOR, validation,
  upload sniffing, CORS, headers, JSON error shapes).
- Frontend: component tests for landing, login gate, 404.
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
`TRUST_PROXY=1`, `FORCE_HTTPS=true`. Add `MONGO_URI` for persistence and
`OPENAI_API_KEY` for LLM upgrades.
