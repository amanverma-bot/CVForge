// AI routes (auth required on every one): analyze, quickfix, build, JD breakdown,
// JD-tailored CV, enhance, cover letter, mock interview, matcher, grammar, practice.
const express = require("express");
const scoring = require("../lib/scoring");
const ai = require("../services/aiService");
const parser = require("../services/parserService");
const schemas = require("../schemas");
const { upload, verifyUploads } = require("../middleware/upload");
const { validate } = require("../middleware/validate");
const { requireAuth } = require("../middleware/auth");
const { asyncHandler, AppError } = require("../middleware/error");
const { aiLimiter, uploadLimiter } = require("../middleware/rateLimit");

const router = express.Router();

const cvFiles = upload.fields([{ name: "cv_file" }, { name: "jd_file" }]);
const jdFiles = upload.fields([{ name: "jd_file" }]);

async function bodyTexts(req) {
  let cv = req.body?.cv_text || "";
  let jd = req.body?.jd_text || "";
  if (req.files?.cv_file?.[0]) cv = await parser.extractCVText(req.files.cv_file[0].buffer, req.files.cv_file[0].originalname);
  if (req.files?.jd_file?.[0]) jd = await parser.extractCVText(req.files.jd_file[0].buffer, req.files.jd_file[0].originalname);
  if ((!jd || jd.length < 30) && req.body?.jd_url) jd = (await parser.fetchJDFromURL(req.body.jd_url)) || jd;
  return { cv: cv || scoring.DEMO_CV, jd: jd || scoring.DEMO_JD };
}

router.post(
  "/analyze",
  requireAuth,
  aiLimiter,
  uploadLimiter,
  cvFiles,
  verifyUploads,
  validate({ body: schemas.analyze }),
  asyncHandler(async (req, res) => {
    const { cv, jd } = await bodyTexts(req);
    const fresher = req.body.mode === "fresher" || req.body.fresher === true;
    const { analysis } = await ai.analyzeWithAI(cv, jd, { fresher });
    res.json(analysis);
  })
);

router.post(
  "/jd-import",
  requireAuth,
  aiLimiter,
  validate({ body: schemas.jdImport }),
  asyncHandler(async (req, res) => {
    const text = await parser.fetchJDFromURL(req.body.url);
    if (!text || !text.trim()) {
      throw new AppError(
        422,
        "Could not import a readable job description from that URL. The site may block automated requests, require login, or the URL may be invalid."
      );
    }
    res.json({ text: text.trim(), length: text.trim().length });
  })
);

router.post("/quickfix", requireAuth, aiLimiter, validate({ body: schemas.quickfix }), (req, res) => {
  const { cv_text } = req.body;
  res.json({ pairs: scoring.quickFixes(cv_text) });
});

router.post(
  "/build",
  requireAuth,
  aiLimiter,
  validate({ body: schemas.build }),
  asyncHandler(async (req, res) => {
    const built = scoring.buildCV(req.body);
    const jd = (req.body.jd || "").trim() || "Software Developer Python React SQL";
    const { analysis } = await ai.analyzeWithAI(built, jd);
    res.json({ cv_text: built, analysis });
  })
);

router.post(
  "/jd-breakdown",
  requireAuth,
  aiLimiter,
  uploadLimiter,
  jdFiles,
  verifyUploads,
  validate({ body: schemas.jdBreakdown }),
  asyncHandler(async (req, res) => {
    let jd = req.body.jd_text || "";
    if (req.files?.jd_file?.[0]) jd = await parser.extractCVText(req.files.jd_file[0].buffer, req.files.jd_file[0].originalname);
    if ((!jd || jd.length < 30) && req.body.jd_url) jd = (await parser.fetchJDFromURL(req.body.jd_url)) || jd;
    if (!jd.trim()) throw new AppError(400, "Paste the job requirements (or its URL)");
    res.json(scoring.analyzeJDRequirements(req.body.profile, jd, { fresher: !!req.body.fresher }));
  })
);

router.post(
  "/jd-cv",
  requireAuth,
  aiLimiter,
  validate({ body: schemas.jdCv }),
  asyncHandler(async (req, res) => {
    let jd = req.body.jd_text || "";
    if ((!jd || jd.length < 30) && req.body.jd_url) jd = (await parser.fetchJDFromURL(req.body.jd_url)) || jd;
    if (!jd.trim()) throw new AppError(400, "Paste a job description (or its URL)");
    const out = scoring.buildCVFromJD(req.body.profile, jd);
    const { analysis } = await ai.analyzeWithAI(out.cv_text, jd);
    res.json({ ...out, analysis });
  })
);

router.post(
  "/enhance",
  requireAuth,
  aiLimiter,
  validate({ body: schemas.cvJdPair }),
  asyncHandler(async (req, res) => {
    const { cv_text, jd_text } = req.body;
    res.json(await ai.enhanceWithAI(cv_text, jd_text));
  })
);

router.post(
  "/cover-letter",
  requireAuth,
  aiLimiter,
  validate({ body: schemas.coverLetter }),
  asyncHandler(async (req, res) => {
    const { cv_text, jd_text, name = "" } = req.body;
    res.json(await ai.coverLetterWithAI(cv_text, jd_text, name));
  })
);

router.post(
  "/mock-interview",
  requireAuth,
  aiLimiter,
  validate({ body: schemas.cvJdPair }),
  asyncHandler(async (req, res) => {
    const { cv_text, jd_text } = req.body;
    res.json(await ai.mockWithAI(cv_text, jd_text));
  })
);

router.post(
  "/match",
  requireAuth,
  aiLimiter,
  validate({ body: schemas.match }),
  asyncHandler(async (req, res) => {
    const { cv_text, jobs } = req.body;
    res.json(await ai.matchJobs(cv_text, jobs));
  })
);

router.post("/grammar", requireAuth, aiLimiter, validate({ body: schemas.grammar }), (req, res) => {
  res.json({ issues: scoring.grammarCheck(req.body.text) });
});

router.post(
  "/practice",
  requireAuth,
  aiLimiter,
  validate({ body: schemas.practice }),
  asyncHandler(async (req, res) => {
    const { cv_text, jd_text } = req.body;
    res.json(await ai.practiceWithAI(cv_text, jd_text));
  })
);

router.post(
  "/practice/evaluate",
  requireAuth,
  aiLimiter,
  validate({ body: schemas.evaluate }),
  asyncHandler(async (req, res) => {
    const { questions, answers } = req.body;
    const results = await Promise.all(
      questions.map(async (q, i) => ({
        q: typeof q === "string" ? q : q.q,
        ev: await ai.evaluateAnswer(q, answers[i] || ""),
      }))
    );
    const avg = Math.round((results.reduce((a, r) => a + r.ev.score, 0) / Math.max(results.length, 1)) * 10) / 10;
    res.json({ results, avg, level: avg >= 8 ? "Interview Ready 🌟" : avg >= 6 ? "Good — Polish Needed" : "Needs Practice" });
  })
);

module.exports = router;
