// Auth routes: register (with one-time captcha), login, me.
// The captcha issuing endpoint is public and lives at GET /api/captcha (routes/misc.js).
const express = require("express");
const bcrypt = require("bcryptjs");
const store = require("../models/store");
const schemas = require("../schemas");
const { validate } = require("../middleware/validate");
const { authLimiter } = require("../middleware/rateLimit");
const { requireAuth, authResponse } = require("../middleware/auth");
const { asyncHandler, AppError } = require("../middleware/error");
const { auditEvent } = require("../middleware/audit");
const { consumeCaptcha } = require("../lib/captcha");
const oauth = require("../lib/oauth");

const router = express.Router();

router.post(
  "/register",
  authLimiter,
  validate({ body: schemas.register }),
  asyncHandler(async (req, res) => {
    const { name, password, email, captcha_token, captcha_answer } = req.body;
    if (!consumeCaptcha(captcha_token, captcha_answer)) {
      auditEvent("register_captcha_failed", req, { name });
      throw new AppError(400, "Captcha answer is wrong or expired — try again");
    }
    const passwordHash = await bcrypt.hash(password, 12);
    let user;
    try {
      user = await store.createUser({ name, email, passwordHash });
    } catch (e) {
      if (e.code === 11000) throw new AppError(409, "Name/email already exists");
      throw e;
    }
    auditEvent("register", req, { name });
    res.status(201).json(authResponse(user));
  })
);

router.post(
  "/login",
  authLimiter,
  validate({ body: schemas.login }),
  asyncHandler(async (req, res) => {
    const { name, password } = req.body;
    const user = await store.findUser(name);
    const stored = user ? user.passwordHash || user.password || "" : "";
    const ok = user && stored ? await bcrypt.compare(password, stored).catch(() => false) : false;
    if (!ok) {
      auditEvent("login_failed", req, { name });
      throw new AppError(401, "Invalid credentials");
    }
    auditEvent("login_success", req, { name: user.name || user.username });
    res.json(authResponse(user));
  })
);

router.get("/me", requireAuth, (req, res) => res.json({ user: { ...req.user, username: req.user.name } }));

// Server-side sign-out: bump the account token version so every previously
// issued JWT for this account is rejected, and clear any pending OAuth cookies.
router.post(
  "/logout",
  requireAuth,
  asyncHandler(async (req, res) => {
    await store.incrementTokenVersion(req.user.id);
    for (const provider of Object.keys(oauth.PROVIDERS)) {
      oauth.clearStateCookie(provider, req, res);
    }
    oauth.clearSessionCookie(req, res);
    auditEvent("logout", req, { userId: req.user.id });
    res.setHeader("Cache-Control", "no-store");
    res.status(204).end();
  })
);

module.exports = router;
