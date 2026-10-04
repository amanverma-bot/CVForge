require("dotenv").config();
const express = require("express");
const cors = require("cors");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const multer = require("multer");
const scoring = require("./lib/scoring");
const llm = require("./lib/llm");
const ai = require("./services/aiService");
const parser = require("./services/parserService");
const { makePDF } = require("./lib/pdf");
const store = require("./models/store");
const { auth } = require("./middleware/auth");

const app = express();
const PORT = process.env.PORT || 5001;
const EXTRA_ORIGINS = (process.env.FRONTEND_URL || "http://localhost:5173,http://127.0.0.1:5173,http://localhost:5174,http://127.0.0.1:5174").split(",").map(s => s.trim()).filter(Boolean);
app.use(cors({
  origin: (origin, cb) => {
    if (!origin) return cb(null, true); // curl / same-origin
    if (EXTRA_ORIGINS.includes(origin)) return cb(null, true);
    if (/^https:\/\/[a-z0-9-]+\.trycloudflare\.com$/.test(origin)) return cb(null, true); // quick tunnels rotate
    if (/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) return cb(null, true);
    return cb(new Error("CORS blocked for " + origin));
  },
  credentials: true,
}));
app.use(express.json({ limit: "2mb" }));

// ---------- Production hardening ----------
// Rate limit: 60 req/min per IP on /api (in-memory, no dep). Uploads: memory only (never touch disk).
const _hits = new Map();
function rateLimit(max = 60, windowMs = 60000) {
  return (req, res, next) => {
    const ip = req.ip || req.headers["x-forwarded-for"] || "local";
    const now = Date.now();
    const rec = _hits.get(ip) || [];
    const fresh = rec.filter(t => now - t < windowMs);
    fresh.push(now);
    _hits.set(ip, fresh);
    if (fresh.length > max) return res.status(429).json({ error: "Too many requests — slow down" });
    next();
  };
}
app.use("/api/", rateLimit(120));
const _loginHits = new Map();
function loginGuard(req, res, next) {
  const ip = req.ip || "local";
  const now = Date.now();
  const rec = _loginHits.get(ip) || [];
  const fresh = rec.filter(t => now - t < 5 * 60 * 1000);
  if (fresh.length >= 10) return res.status(429).json({ error: "Too many login attempts — try in 5 min" });
  fresh.push(now);
  _loginHits.set(ip, fresh);
  next();
}
const ALLOWED_UPLOADS = [".pdf", ".docx", ".txt", ".md"];
const upload = multer({
  storage: multer.memoryStorage(), // never written to disk → nothing to delete
  limits: { fileSize: 5 * 1024 * 1024, files: 2 },
  fileFilter: (req, file, cb) => {
    const n = (file.originalname || "").toLowerCase();
    if (ALLOWED_UPLOADS.some(ext => n.endsWith(ext))) return cb(null, true);
    cb(new Error("Only PDF/DOCX/TXT/MD allowed"));
  },
});

const sign = (u) => jwt.sign({ id: u._id || u.id, username: u.name || u.username }, process.env.JWT_SECRET || "dev-secret", { expiresIn: "7d" });

// ---------- Auth (JWT): Users{name, email, passwordHash} ----------
app.post("/api/auth/register", loginGuard, async (req, res) => {
  const { name, username, password = "", email = "" } = req.body || {};
  const u = String(name || username || "").trim(), p = String(password);
  if (u.length < 3 || u.length > 32 || !/^[a-zA-Z0-9_-]+$/.test(u)) return res.status(400).json({ error: "Name 3-32, letters/numbers/_/-" });
  if (p.length < 6) return res.status(400).json({ error: "Password min 6 chars" });
  if (email && !/^\S+@\S+\.\S+$/.test(String(email))) return res.status(400).json({ error: "Invalid email" });
  try {
    const hash = await bcrypt.hash(p, 10);
    const user = await store.createUser({ name: u, email: String(email).trim(), passwordHash: hash });
    try { // seed admin once
      if (!(await store.findUser("admin"))) await store.createUser({ name: "admin", email: "admin@college.edu", passwordHash: await bcrypt.hash("admin123", 10) });
    } catch {}
    return res.json({ token: sign(user), username: u, name: u });
  } catch (e) { return res.status(400).json({ error: e.code === 11000 ? "Name/email exists" : "Register failed" }); }
});
app.post("/api/auth/login", loginGuard, async (req, res) => {
  const { name, username, password = "" } = req.body || {};
  const user = await store.findUser(String(name || username || "").trim());
  if (!user) return res.status(401).json({ error: "Invalid credentials" });
  const stored = user.passwordHash || user.password || "";
  const ok = await bcrypt.compare(String(password), stored).catch(() => false);
  if (!ok) return res.status(401).json({ error: "Invalid credentials" });
  return res.json({ token: sign(user), username: user.name || user.username, name: user.name || user.username });
});
app.get("/api/auth/me", auth, (req, res) => res.json({ user: req.user }));

// ---------- Analyze (React UI → REST API → Express → Parser + AI Service) ----------
async function bodyTexts(req) {
  let cv = (req.body?.cv_text || "").slice(0, 50000);
  let jd = (req.body?.jd_text || "").slice(0, 50000);
  if (req.files?.cv_file?.[0]) cv = await parser.extractCVText(req.files.cv_file[0].buffer, req.files.cv_file[0].originalname);
  if (req.files?.jd_file?.[0]) jd = await parser.extractCVText(req.files.jd_file[0].buffer, req.files.jd_file[0].originalname);
  if ((!jd || jd.length < 30) && req.body?.jd_url) jd = (await parser.fetchJDFromURL(String(req.body.jd_url).slice(0, 500))) || jd;
  return { cv: cv || scoring.DEMO_CV, jd: jd || scoring.DEMO_JD };
}
app.post("/api/analyze", upload.fields([{ name: "cv_file" }, { name: "jd_file" }]), async (req, res) => {
  try {
    const { cv, jd } = await bodyTexts(req);
    const fresher = req.body?.mode === "fresher" || req.body?.fresher === true || req.body?.fresher === "true";
    const { analysis } = await ai.analyzeWithAI(cv, jd, { fresher }); res.json(analysis);
  }
  catch (e) { res.status(500).json({ error: String(e.message || e) }); }
});
app.post("/api/quickfix", rateLimit(60), async (req, res) => {
  try {
    const { cv_text = "" } = req.body || {};
    if (!cv_text.trim()) return res.status(400).json({ error: "cv_text required" });
    res.json({ pairs: scoring.quickFixes(String(cv_text).slice(0, 30000)) });
  } catch (e) { res.status(500).json({ error: String(e.message || e) }); }
});
app.get("/api/demo", (req, res) => { const r = scoring.analyse(scoring.DEMO_CV, scoring.DEMO_JD); r.detailed = scoring.detailedFeedback(scoring.DEMO_CV, scoring.DEMO_JD, r); res.json(r); });

// ---------- CV created BY job requirement (JD → tailored draft) ----------
app.post("/api/build", async (req, res) => {
  try {
    const built = scoring.buildCV(req.body || {});
    const jd = (req.body?.jd || "").trim() || "Software Developer Python React SQL";
    const { analysis } = await ai.analyzeWithAI(built, jd);
    res.json({ cv_text: built, analysis });
  } catch (e) { res.status(500).json({ error: String(e.message || e) }); }
});
// ---------- Requirements breakdown (Job Requirements → matching → sections) ----------
app.post("/api/jd-breakdown", upload.fields([{ name: "jd_file" }]), async (req, res) => {
  try {
    let profile = req.body?.profile || {};
    if (typeof profile === "string") { try { profile = JSON.parse(profile) } catch { profile = {} } }
    let jd = String(req.body?.jd_text || "").slice(0, 20000);
    if (req.files?.jd_file?.[0]) jd = await parser.extractCVText(req.files.jd_file[0].buffer, req.files.jd_file[0].originalname);
    if ((!jd || jd.length < 30) && req.body?.jd_url) jd = (await parser.fetchJDFromURL(String(req.body.jd_url).slice(0, 500))) || jd;
    if (!jd.trim()) return res.status(400).json({ error: "Paste the job requirements (or its URL)" });
    const fresher = req.body?.fresher === true || req.body?.fresher === "true" || req.body?.mode === "fresher";
    res.json(scoring.analyzeJDRequirements(profile, jd, { fresher }));
  } catch (e) { res.status(500).json({ error: String(e.message || e) }); }
});
app.post("/api/jd-cv", rateLimit(30), async (req, res) => {  try {
    const { profile = {}, jd_text = "", jd_url = "" } = req.body || {};
    let jd = String(jd_text).slice(0, 20000);
    if ((!jd || jd.length < 30) && jd_url) jd = (await parser.fetchJDFromURL(String(jd_url).slice(0, 500))) || jd;
    if (!jd.trim()) return res.status(400).json({ error: "Paste a job description (or its URL)" });
    const out = scoring.buildCVFromJD(profile, jd);
    const { analysis } = await ai.analyzeWithAI(out.cv_text, jd);
    res.json({ ...out, analysis });
  } catch (e) { res.status(500).json({ error: String(e.message || e) }); }
});
// ---------- Builder / Enhance / Cover / Mock / Matcher (AI Service) ----------
app.post("/api/enhance", async (req, res) => {
  try {
    const { cv_text = "", jd_text = "" } = req.body || {};
    if (!cv_text || !jd_text) return res.status(400).json({ error: "cv_text and jd_text required" });
    res.json(await ai.enhanceWithAI(cv_text, jd_text));
  } catch (e) { res.status(500).json({ error: String(e.message || e) }); }
});
app.post("/api/cover-letter", async (req, res) => {
  try {
    const { cv_text = "", jd_text = "", name = "" } = req.body || {};
    if (!cv_text || !jd_text) return res.status(400).json({ error: "cv_text and jd_text required" });
    res.json(await ai.coverLetterWithAI(cv_text, jd_text, String(name).slice(0, 80)));
  } catch (e) { res.status(500).json({ error: String(e.message || e) }); }
});
app.post("/api/mock-interview", async (req, res) => {
  try {
    const { cv_text = "", jd_text = "" } = req.body || {};
    if (!cv_text || !jd_text) return res.status(400).json({ error: "cv_text and jd_text required" });
    res.json(await ai.mockWithAI(cv_text, jd_text));
  } catch (e) { res.status(500).json({ error: String(e.message || e) }); }
});
app.post("/api/match", async (req, res) => {
  try {
    const { cv_text = "", jobs = [] } = req.body || {};
    if (!cv_text || !Array.isArray(jobs) || !jobs.length) return res.status(400).json({ error: "cv_text and jobs[] required" });
    res.json(await ai.matchJobs(cv_text.slice(0, 50000), jobs.slice(0, 10)));
  } catch (e) { res.status(500).json({ error: String(e.message || e) }); }
});

// ---------- Grammar & spelling screen (offline) ----------
app.post("/api/grammar", rateLimit(60), async (req, res) => {
  try {
    const { text = "" } = req.body || {};
    if (!text.trim()) return res.status(400).json({ error: "text required" });
    res.json({ issues: scoring.grammarCheck(String(text).slice(0, 30000)) });
  } catch (e) { res.status(500).json({ error: String(e.message || e) }); }
});

// ---------- Shareable CV link (public read-only) ----------
app.post("/api/cvs/:id/share", auth, async (req, res) => {
  const r = await store.shareCV(req.params.id, String(req.user.id));
  if (!r) return res.status(404).json({ error: "CV not found" });
  res.json({ ...r, url: `/s/${r.token}` });
});
app.get("/api/share/:token", async (req, res) => {
  const c = await store.getShared(req.params.token);
  if (!c) return res.status(404).json({ error: "Link invalid or revoked" });
  const { userId, shareToken, ...pub } = c.toObject ? c.toObject() : c;
  res.json(pub);
});
app.delete("/api/cvs/:id/share", auth, async (req, res) => {
  if (!(await store.revokeShare(req.params.id, String(req.user.id)))) return res.status(404).json({ error: "CV not found" });
  res.json({ ok: true, revoked: true });
});

// ---------- Interview practice (questions + STAR scoring) ----------
app.post("/api/practice", async (req, res) => {
  try {
    const { cv_text = "", jd_text = "" } = req.body || {};
    if (!cv_text || !jd_text) return res.status(400).json({ error: "cv_text and jd_text required" });
    res.json(await ai.practiceWithAI(cv_text.slice(0, 20000), jd_text.slice(0, 20000)));
  } catch (e) { res.status(500).json({ error: String(e.message || e) }); }
});
app.post("/api/practice/evaluate", async (req, res) => {
  try {
    const { questions = [], answers = [] } = req.body || {};
    if (!questions.length || !answers.length) return res.status(400).json({ error: "questions and answers required" });
    const results = questions.slice(0, 10).map((q, i) => ({ q: typeof q === "string" ? q : q.q, ev: ai.evaluateAnswer(q, answers[i] || "") }));
    const avg = Math.round(results.reduce((a, r) => a + r.ev.score, 0) / Math.max(results.length, 1) * 10) / 10;
    res.json({ results, avg, level: avg >= 8 ? "Interview Ready 🌟" : avg >= 6 ? "Good — Polish Needed" : "Needs Practice" });
  } catch (e) { res.status(500).json({ error: String(e.message || e) }); }
});

// ---------- Privacy: export my data / delete my account ----------
app.get("/api/me/export", auth, async (req, res) => res.json(await store.exportUserData(String(req.user.id))));
app.delete("/api/me", auth, async (req, res) => {
  await store.deleteAccount(String(req.user.id));
  res.json({ ok: true, deleted: true });
});

// ---------- Applications tracker (Track Applications pipeline) ----------
app.post("/api/applications", auth, async (req, res) => {
  try { res.json(await store.createApplication({ userId: String(req.user.id), ...req.body })); }
  catch (e) { res.status(500).json({ error: String(e.message || e) }); }
});
app.get("/api/applications", auth, async (req, res) => res.json({ items: await store.listApplications(String(req.user.id)), statuses: store.STATUSES }));
app.patch("/api/applications/:id", auth, async (req, res) => {
  const a = await store.updateApplication(req.params.id, String(req.user.id), req.body || {});
  if (!a) return res.status(404).json({ error: "Not found" });
  res.json(a);
});
app.delete("/api/applications/:id", auth, async (req, res) => {
  if (!(await store.deleteApplication(req.params.id, String(req.user.id)))) return res.status(404).json({ error: "Not found" });
  res.json({ ok: true });
});

// ---------- PDF (Puppeteer → pdfkit fallback) ----------
app.post("/api/pdf", async (req, res) => {
  try {
    const { title = "Resume", text = "" } = req.body || {};
    const { buffer, mime, engine } = await makePDF(String(title).slice(0, 120), String(text).slice(0, 30000));
    res.setHeader("Content-Type", mime);
    res.setHeader("X-PDF-Engine", engine);
    res.setHeader("Content-Disposition", 'attachment; filename="resume.pdf"');
    res.send(buffer);
  } catch (e) { res.status(500).json({ error: "PDF failed: " + String(e.message || e) }); }
});

// ---------- CVs (Phase 1): save/list/get — CVs{userId,personalInfo,education,experience,skills,projects,template} ----------
app.post("/api/cvs", auth, async (req, res) => {
  try {
    const b = req.body || {};
    const saved = await store.createCV({
      userId: String(req.user.id),
      personalInfo: { name: String(b.name || "").slice(0, 80), email: String(b.email || "").slice(0, 120), phone: String(b.phone || "").slice(0, 40), location: String(b.location || "").slice(0, 120), linkedin: String(b.linkedin || "").slice(0, 200), github: String(b.github || "").slice(0, 200), summary: String(b.summary || "").slice(0, 2000) },
      education: String(b.education || "").slice(0, 5000),
      experience: String(b.experience || "").slice(0, 8000),
      skills: String(b.skills || "").slice(0, 3000),
      projects: String(b.projects || "").slice(0, 8000),
      template: ["modern", "minimal", "professional", "tech", "fresher", "classic", "neon"].includes(b.template) ? b.template : "modern",
      role: String(b.role || "").slice(0, 120), generatedText: String(b.generatedText || "").slice(0, 20000),
    });
    res.json(saved);
  } catch (e) { res.status(500).json({ error: String(e.message || e) }); }
});
app.get("/api/cvs", auth, async (req, res) => res.json({ items: await store.listCVs(String(req.user.id)) }));
app.get("/api/cvs/:id", auth, async (req, res) => {
  const c = await store.getCV(req.params.id, String(req.user.id));
  if (!c) return res.status(404).json({ error: "CV not found" });
  res.json(c);
});

// ---------- DOCX export (real .docx via `docx` lib) ----------
app.post("/api/docx", rateLimit(30), async (req, res) => {
  try {
    const { Document, Packer, Paragraph, TextRun, HeadingLevel } = require("docx");
    const title = String(req.body?.title || "Resume").slice(0, 120);
    const text = String(req.body?.text || "").slice(0, 30000);
    const kids = [new Paragraph({ heading: HeadingLevel.TITLE, children: [new TextRun(title)] })];
    for (const line of text.split("\n")) {
      const s = line.trim();
      if (!s) continue;
      if (s === s.toUpperCase() && s.length < 40) kids.push(new Paragraph({ heading: HeadingLevel.HEADING_2, children: [new TextRun(s)] }));
      else if (/^[•-]/.test(s)) kids.push(new Paragraph({ text: s.replace(/^[•-]\s*/, "• "), bullet: { level: 0 } }));
      else kids.push(new Paragraph({ text: s }));
    }
    const buf = await Packer.toBuffer(new Document({ sections: [{ children: kids }] }));
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.wordprocessingml.document");
    res.setHeader("Content-Disposition", 'attachment; filename="resume.docx"');
    res.send(Buffer.from(buf));
  } catch (e) { res.status(500).json({ error: "DOCX failed: " + String(e.message || e) }); }
});

// ---------- History (JWT): Analyses{userId,cvId,scoreData,missingKeywords,suggestions} ----------
app.post("/api/history", auth, async (req, res) => {
  const { cv_text = "", jd_text = "", cvId = null } = req.body || {};
  const { analysis } = await ai.analyzeWithAI(cv_text || scoring.DEMO_CV, jd_text || scoring.DEMO_JD);
  const d = analysis.detailed || scoring.detailedFeedback(cv_text || scoring.DEMO_CV, jd_text || scoring.DEMO_JD, analysis);
  const saved = await store.saveAnalysis({
    userId: String(req.user.id), cvId,
    scoreData: analysis.scores, missingKeywords: d.keywords.missing, suggestions: d.suggestions,
    overall: analysis.scores.overall, verdict: analysis.scores.verdict,
    cvText: cv_text, jdText: jd_text, resultJson: JSON.stringify(analysis),
  });
  res.json({ id: saved.id, analysis });
});
app.get("/api/history", auth, async (req, res) => res.json({ items: await store.listAnalyses(String(req.user.id)) }));

app.get("/api/health", (req, res) => res.json({ ok: true, mongo: store.isMongo(), llm: llm.hasKey(), time: new Date().toISOString() }));

// Architecture map (mirrors requested diagram)
app.get("/api/architecture", (req, res) => res.json({
  layers: [
    { box: "React UI (CV Creator/Upload)", files: ["frontend/src/App.jsx", "frontend/src/main.jsx"], routes: ["/", "/login", "/dashboard", "/create", "/preview", "/analyzer", "/match", "/profile"] },
    { box: "REST API", files: ["backend/server.js"], endpoints: ["POST /api/auth/*", "POST /api/analyze (+fresher mode)", "POST /api/quickfix", "POST /api/build", "POST /api/enhance", "POST /api/cover-letter", "POST /api/mock-interview", "POST /api/practice(+/evaluate)", "POST /api/match", "POST /api/pdf", "POST /api/docx", "POST /api/grammar", "GET/POST/PATCH/DELETE /api/applications", "GET/POST /api/cvs", "POST/DELETE /api/cvs/:id/share", "GET /api/share/:token", "GET/POST /api/history", "GET/DELETE /api/me"] },
    { box: "Node.js/Express", files: ["backend/server.js", "backend/middleware/auth.js"] },
    { box: "MongoDB", files: ["backend/models/store.js"], mode: store.isMongo() ? "atlas" : "in-memory-fallback", collections: ["Users", "CVs", "Analyses", "Applications"] },
    { box: "AI Service", files: ["backend/services/aiService.js", "backend/lib/llm.js", "backend/lib/scoring.js"], engine: ai.engine() },
    { box: "PDF/DOCX Parser", files: ["backend/services/parserService.js", "backend/lib/parse.js"], libs: ["pdf-parse", "mammoth"] },
  ],
}));

store.initDB().catch((e) => console.log("DB init:", e.message));

// JSON errors for uploads/rate-limits (never HTML pages to the UI)
app.use((err, req, res, next) => {
  if (!err) return next();
  if (err.code === "LIMIT_FILE_SIZE") return res.status(413).json({ error: "File too large — max 5MB (PDF/DOCX/TXT/MD)" });
  if (err.code === "LIMIT_FILE_COUNT") return res.status(400).json({ error: "Max 2 files per request" });
  return res.status(400).json({ error: err.message || "Upload failed" });
});

// ---------- Single-origin frontend (fixes deployed API communication) ----------
// The built React app is served by Express itself, so the browser calls the API
// on the SAME origin — no 127.0.0.1, no CORS, one Cloudflare tunnel for all.
const path = require("path");
const DIST = path.join(__dirname, "..", "frontend", "dist");
try {
  if (require("fs").existsSync(path.join(DIST, "index.html"))) {
    // Hashed assets (JS/CSS) are immutable → cache 1y. index.html must NEVER
    // cache — it points to the hashed files, and a stale copy serves a build
    // whose CSS/JS no longer exists (unstyled / dark-on-dark page).
    app.use(express.static(DIST, {
      maxAge: "1y",
      immutable: true,
      setHeaders: (res, p) => { if (p.endsWith("index.html")) res.setHeader("Cache-Control", "no-store"); },
    }));
    app.get("*", (req, res, next) => {
      if (req.path.startsWith("/api/")) return next();
      res.setHeader("Cache-Control", "no-store");
      res.sendFile(path.join(DIST, "index.html"));
    });
    console.log("✅ Serving frontend dist from", DIST);
  } else {
    console.log("ℹ️  frontend/dist missing — API-only mode (run `npm run build` in frontend)");
  }
} catch (e) { console.log("static:", e.message); }

app.listen(PORT, "0.0.0.0", () => console.log(`✅ CVForge → http://127.0.0.1:${PORT}  (mongo=${!!process.env.MONGO_URI} llm=${llm.hasKey()})`));
