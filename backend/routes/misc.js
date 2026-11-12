// Misc routes: public health/demo, authenticated PDF/DOCX export, privacy (export/delete), architecture map.
const express = require("express");
const scoring = require("../lib/scoring");
const llm = require("../lib/llm");
const store = require("../models/store");
const schemas = require("../schemas");
const { makePDF } = require("../lib/pdf");
const { issueCaptcha } = require("../lib/captcha");
const { validate } = require("../middleware/validate");
const { requireAuth } = require("../middleware/auth");
const { asyncHandler } = require("../middleware/error");
const { exportLimiter } = require("../middleware/rateLimit");
const { auditEvent } = require("../middleware/audit");

const router = express.Router();

// Public: one-time math captcha for the register form (answer stays server-side, 5 min TTL).
router.get("/captcha", (req, res) => {
  const c = issueCaptcha();
  res.json({ question: c.question, token: c.token });
});

// Public: health check for Render / uptime monitors. Exposes provider availability, never credentials.
router.get("/health", asyncHandler(async (_req, res) => {
  const ai = await llm.healthStatus();
  res.json({
    ok: true,
    mongo: store.isMongo(),
    storage: store.storage(),
    llm: ai.available,
    ai,
    time: new Date().toISOString(),
    version: require("../package.json").version,
  });
}));

// Public: demo analysis with demo data (cheap, offline scoring).
router.get("/demo", (_req, res) => {
  const r = scoring.analyse(scoring.DEMO_CV, scoring.DEMO_JD);
  r.detailed = scoring.detailedFeedback(scoring.DEMO_CV, scoring.DEMO_JD, r);
  res.json(r);
});

router.post(
  "/pdf",
  requireAuth,
  exportLimiter,
  validate({ body: schemas.pdf }),
  asyncHandler(async (req, res) => {
    const { title, text } = req.body;
    const { buffer, mime, engine } = await makePDF(title.slice(0, 120), text);
    res.setHeader("Content-Type", mime);
    res.setHeader("X-PDF-Engine", engine);
    res.setHeader("Content-Disposition", 'attachment; filename="resume.pdf"');
    res.send(buffer);
  })
);

router.post(
  "/docx",
  requireAuth,
  exportLimiter,
  validate({ body: schemas.pdf }),
  asyncHandler(async (req, res) => {
    const { Document, Packer, Paragraph, TextRun, HeadingLevel } = require("docx");
    const title = req.body.title;
    const text = req.body.text;
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
  })
);

// Privacy: export everything / delete account + all data (audited).
router.get(
  "/me/export",
  requireAuth,
  asyncHandler(async (req, res) => {
    auditEvent("data_exported", req);
    res.json(await store.exportUserData(String(req.user.id)));
  })
);

router.delete(
  "/me",
  requireAuth,
  asyncHandler(async (req, res) => {
    auditEvent("account_deleted", req);
    await store.deleteAccount(String(req.user.id));
    res.json({ ok: true, deleted: true });
  })
);

// Architecture map (authenticated — not a public info-disclosure endpoint).
router.get("/architecture", requireAuth, (req, res) =>
  res.json({
    layers: [
      {
        box: "React UI (CV Creator/Upload)",
        files: ["frontend/src/App.jsx", "frontend/src/main.jsx"],
        routes: ["/", "/login", "/dashboard", "/create", "/preview", "/analyzer", "/match", "/profile"],
      },
      {
        box: "REST API",
        files: ["backend/app.js", "backend/routes/*.js"],
        endpoints: [
          "POST /api/auth/register (captcha)",
          "POST /api/auth/login",
          "GET /api/captcha",
          "POST /api/analyze (+fresher mode)",
          "POST /api/quickfix",
          "POST /api/build",
          "POST /api/enhance",
          "POST /api/cover-letter",
          "POST /api/mock-interview",
          "POST /api/practice(+/evaluate)",
          "POST /api/match",
          "POST /api/pdf",
          "POST /api/docx",
          "POST /api/grammar",
          "GET/POST/PATCH/DELETE /api/applications",
          "GET/POST /api/cvs",
          "POST/DELETE /api/cvs/:id/share",
          "GET /api/share/:token",
          "GET/POST /api/history",
          "GET/DELETE /api/me",
        ],
      },
      { box: "Node.js/Express", files: ["backend/app.js", "backend/middleware/*.js"] },
      {
        box: "MongoDB",
        files: ["backend/models/store.js"],
        mode: store.isMongo() ? "atlas" : "in-memory-fallback",
        collections: ["Users", "CVs", "Analyses", "Applications"],
      },
      { box: "AI Service", files: ["backend/services/aiService.js", "backend/lib/llm.js", "backend/lib/scoring.js"] },
      { box: "PDF/DOCX Parser", files: ["backend/services/parserService.js", "backend/lib/parse.js"], libs: ["pdf-parse", "mammoth"] },
    ],
  })
);

module.exports = router;
