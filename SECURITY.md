# CVForge Security

Security review + controls map for CVForge (Express + MongoDB-ready + React SPA).
Every item below is implemented in code and covered by `backend/tests/api.test.js` where testable.

## Quick audit summary

| # | Control | Status | Where |
|---|---------|--------|-------|
| 1 | Auth on every API route | ✅ | `backend/middleware/auth.js` + route guards; public allow-list below |
| 2 | Row-level-style ownership (RLS equivalent) | ✅ | `backend/models/store.js` — every query filters by `userId` |
| 3 | Never trust the frontend | ✅ | `backend/schemas/index.js` (Zod), server-side whitelists |
| 4 | Rate limiting | ✅ | `backend/middleware/rateLimit.js` (global / auth / AI / upload / export) |
| 5 | Sanitized input | ✅ | Zod transforms strip control chars, trim, hard max-lengths |
| 6 | Parameterized queries | ✅ | Mongoose operators only; no string-built queries; `CastError → 404` wrapper |
| 7 | Locked-down CORS | ✅ | `backend/middleware/security.js` — strict allow-list, no wildcard |
| 8 | HTTPS everywhere | ✅ | helmet HSTS (prod) + `FORCE_HTTPS` redirect + `trust proxy` |
| 9 | IDOR stopped | ✅ | Ownership checks return 404 (existence hidden); covered by tests |
| 10 | Debug off in production | ✅ | Generic 500 bodies, no stack traces, `x-powered-by` removed |
| 11 | CAPTCHA on public forms | ✅ | One-time math captcha on register (`backend/lib/captcha.js`, `GET /api/captcha`) |
| 12 | Admin actions logged | ✅ | `backend/middleware/audit.js` (login, register, share, export, delete, seed) |
| 13 | Private storage | ✅ | No buckets: uploads are memory-only, never written to disk |
| 14 | Admin hardening | ✅ | No default credentials; admin seeded only via `ADMIN_PASSWORD` (≥12 chars) |
| 15 | Vulnerable packages updated | ✅ | multer 2.x, Zod 4, unused `openai`/`puppeteer` removed — `npm audit` = 0 |
| 16 | File upload checks | ✅ | Extension allow-list + magic-byte verification + 5MB cap, memory-only |
| 17 | Security headers | ✅ | helmet: strict CSP, HSTS, nosniff, frame-deny, referrer-policy |

## Public (unauthenticated) endpoints — the complete list

Everything else requires `Authorization: Bearer <JWT>`.

- `GET /api/health` — booleans only, no internals
- `GET /api/captcha` — issues a one-time captcha
- `POST /api/auth/register` — captcha + rate limited
- `POST /api/auth/login` — rate limited, uniform error messages
- `GET /api/demo` — demo data, offline scoring
- `GET /api/share/:token` — public share read (random 96-bit token, revocable)
- `GET /api/docs`, `GET /api/openapi.json` — API docs

## Threat-model notes

- **IDOR**: all `:id` routes call store functions scoped by the JWT user id. A foreign id
  yields `404` (not `403`) so object existence is not enumerable. Guarded by tests
  covering CVs, share links, history references and applications.
- **JWT**: 7-day expiry, `issuer: cvforge`, secret validated at boot. Production refuses
  to start with the dev default or any secret < 32 chars.
- **Passwords**: bcryptjs cost 12; min length 8; login errors are uniform.
- **Uploads**: memory storage only; `.pdf/.docx/.txt/.md` extension allow-list; magic-byte
  verification (`%PDF-`, `PK\x03\x04`, NUL-byte rejection for text); 5MB/2-file caps.
- **SSRF**: JD-URL fetch blocks localhost, link-local, private IPv4 ranges and
  `metadata.google.internal`, with a 10s timeout and content-type allow-list.
- **Injection**: JSON body limit 1MB; Zod strips unknown keys; Mongo receives only typed
  fields; template/status enums are whitelisted server-side (invalid values coerced to
  safe defaults or rejected).
- **XSS**: React escapes by default; CSP blocks inline scripts on app pages; DOCX/PDF
  generation escapes user text.
- **Prompt injection**: LLM outputs are treated as data (JSON-parsed with fallbacks);
  missing/rate-limited LLM always degrades to deterministic offline output.

## Reporting a vulnerability

Open a private security advisory on GitHub (repo → Security → Report a vulnerability)
or contact the maintainer directly. Please do not open public issues for security bugs.
We aim to acknowledge within 72 hours.
