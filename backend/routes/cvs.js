// CV routes: create/list/get, share links (create/revoke/public read), analysis history.
// Ownership is enforced in every store call — user A can never touch user B's data (no IDOR).
const express = require("express");
const scoring = require("../lib/scoring");
const ai = require("../services/aiService");
const store = require("../models/store");
const schemas = require("../schemas");
const { validate } = require("../middleware/validate");
const { requireAuth } = require("../middleware/auth");
const { asyncHandler, AppError } = require("../middleware/error");
const { shareLimiter } = require("../middleware/rateLimit");
const { auditEvent } = require("../middleware/audit");

const router = express.Router();

router.post(
  "/cvs",
  requireAuth,
  validate({ body: schemas.createCV }),
  asyncHandler(async (req, res) => {
    const b = req.body;
    const saved = await store.createCV({
      userId: String(req.user.id),
      personalInfo: {
        name: b.name || "",
        email: b.email || "",
        phone: b.phone || "",
        location: b.location || "",
        linkedin: b.linkedin || "",
        github: b.github || "",
        summary: b.summary || "",
      },
      education: b.education || "",
      experience: b.experience || "",
      skills: b.skills || "",
      projects: b.projects || "",
      template: b.template || "modern",
      role: b.role || "",
      generatedText: b.generatedText || "",
    });
    res.status(201).json(saved);
  })
);

router.get(
  "/cvs",
  requireAuth,
  asyncHandler(async (req, res) => {
    res.json({ items: await store.listCVs(String(req.user.id)) });
  })
);

router.get(
  "/cvs/:id",
  requireAuth,
  validate({ params: schemas.idParam }),
  asyncHandler(async (req, res) => {
    const c = await store.getCV(req.params.id, String(req.user.id));
    if (!c) throw new AppError(404, "CV not found");
    res.json(c);
  })
);

const PROFILE_KEYS = ["name", "email", "phone", "location", "linkedin", "github", "summary"];
const TEXT_KEYS = ["education", "experience", "skills", "projects", "role", "generatedText", "template"];

router.patch(
  "/cvs/:id",
  requireAuth,
  validate({ params: schemas.idParam, body: schemas.updateCV }),
  asyncHandler(async (req, res) => {
    const userId = String(req.user.id);
    const existing = await store.getCV(req.params.id, userId);
    if (!existing) throw new AppError(404, "CV not found");

    const b = req.body;
    const data = {};
    const personal = { ...(existing.personalInfo || {}) };
    let personalChanged = false;
    for (const k of PROFILE_KEYS) {
      if (b[k] !== undefined) {
        personal[k] = b[k];
        personalChanged = true;
      }
    }
    if (personalChanged) data.personalInfo = personal;
    for (const k of TEXT_KEYS) if (b[k] !== undefined) data[k] = b[k];

    const updated = await store.updateCV(req.params.id, userId, data);
    res.json(updated);
  })
);

router.post(
  "/cvs/:id/share",
  requireAuth,
  validate({ params: schemas.idParam }),
  asyncHandler(async (req, res) => {
    const r = await store.shareCV(req.params.id, String(req.user.id));
    if (!r) throw new AppError(404, "CV not found");
    auditEvent("share_created", req, { cvId: req.params.id });
    res.json({ ...r, url: `/s/${r.token}` });
  })
);

router.delete(
  "/cvs/:id/share",
  requireAuth,
  validate({ params: schemas.idParam }),
  asyncHandler(async (req, res) => {
    if (!(await store.revokeShare(req.params.id, String(req.user.id)))) throw new AppError(404, "CV not found");
    auditEvent("share_revoked", req, { cvId: req.params.id });
    res.json({ ok: true, revoked: true });
  })
);

// Public read-only share (random unguessable token; user data stripped).
router.get(
  "/share/:token",
  shareLimiter,
  validate({ params: schemas.tokenParam }),
  asyncHandler(async (req, res) => {
    const c = await store.getShared(req.params.token);
    if (!c) throw new AppError(404, "Link invalid or revoked");
    const { userId, shareToken, ...pub } = c.toObject ? c.toObject() : c;
    res.json(pub);
  })
);

router.post(
  "/history",
  requireAuth,
  validate({ body: schemas.createHistory }),
  asyncHandler(async (req, res) => {
    const { cv_text = "", jd_text = "", cvId = null } = req.body;
    if (cvId) {
      const owned = await store.getCV(cvId, String(req.user.id));
      if (!owned) throw new AppError(404, "CV not found");
    }
    const { analysis } = await ai.analyzeWithAI(cv_text || scoring.DEMO_CV, jd_text || scoring.DEMO_JD);
    const d = analysis.detailed || scoring.detailedFeedback(cv_text || scoring.DEMO_CV, jd_text || scoring.DEMO_JD, analysis);
    const saved = await store.saveAnalysis({
      userId: String(req.user.id),
      cvId,
      scoreData: analysis.scores,
      missingKeywords: d.keywords.missing,
      suggestions: d.suggestions,
      overall: analysis.scores.overall,
      verdict: analysis.scores.verdict,
      cvText: cv_text,
      jdText: jd_text,
      resultJson: JSON.stringify(analysis),
    });
    res.status(201).json({ id: saved.id, analysis });
  })
);

router.get(
  "/history",
  requireAuth,
  asyncHandler(async (req, res) => {
    res.json({ items: await store.listAnalyses(String(req.user.id)) });
  })
);

module.exports = router;
