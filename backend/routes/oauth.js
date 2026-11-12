// Google/GitHub OAuth routes. All provider exchanges happen server-side.
const express = require("express");
const store = require("../models/store");
const oauth = require("../lib/oauth");
const { authLimiter } = require("../middleware/rateLimit");
const { authResponse } = require("../middleware/auth");
const { asyncHandler } = require("../middleware/error");
const { auditEvent } = require("../middleware/audit");
const { logger } = require("../lib/logger");
const firebaseAdmin = require("../lib/firebaseAdmin");

const router = express.Router();

function logFailure(provider, err, stage) {
  logger.warn(
    {
      provider,
      stage,
      code: err instanceof oauth.OAuthError ? err.code : "unexpected",
      message: err?.message,
    },
    "OAuth flow failed"
  );
}

function begin(provider) {
  return (req, res) => {
    try {
      oauth.startOAuth(provider, req, res);
    } catch (err) {
      const code = oauth.publicErrorCode(err);
      logFailure(provider, err, "start");
      oauth.redirectOAuthError(provider, req, res, code);
    }
  };
}

router.get("/google", begin("google"));
router.get("/github", begin("github"));

// Public capability status for the sign-in UI. Never exposes client IDs/secrets.
router.get("/providers", (req, res) => {
  const providers = {};
  for (const [id, definition] of Object.entries(oauth.PROVIDERS)) {
    providers[id] = { label: definition.label, configured: oauth.isProviderConfigured(id) };
  }
  providers.firebase = { label: "Google", configured: firebaseAdmin.isConfigured() };
  res.setHeader("Cache-Control", "no-store");
  res.json({ providers });
});

function callback(provider) {
  return asyncHandler(async (req, res) => {
    try {
      const result = await oauth.completeOAuth(provider, req);
      oauth.clearStateCookie(provider, req, res);
      oauth.setSessionCookie(result.user.id, provider, req, res);
      auditEvent(result.created ? "oauth_register" : result.linked ? "oauth_account_linked" : "oauth_login", req, {
        provider,
        userId: result.user.id,
      });
      return oauth.redirectToFrontend(res, "/login?oauth=success");
    } catch (err) {
      oauth.clearStateCookie(provider, req, res);
      const code = oauth.publicErrorCode(err);
      logFailure(provider, err, "callback");
      auditEvent("oauth_login_failed", req, { provider, reason: code });
      return oauth.redirectOAuthError(provider, req, res, code);
    }
  });
}

router.get("/google/callback", callback("google"));
router.get("/github/callback", callback("github"));

router.post(
  "/oauth/session",
  authLimiter,
  asyncHandler(async (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    try {
      oauth.assertTrustedOrigin(req);
      const payload = oauth.verifySessionCookie(req);
      oauth.clearSessionCookie(req, res);

      const user = await store.getUserById(payload.uid);
      if (!user) {
        auditEvent("oauth_session_failed", req, { reason: "account_missing" });
        return res.status(401).json({ error: "Sign-in session is no longer valid. Please try again." });
      }

      auditEvent("oauth_session_exchanged", req, { provider: payload.provider, userId: user.id });
      return res.json(authResponse(user));
    } catch (err) {
      oauth.clearSessionCookie(req, res);
      if (err instanceof oauth.OAuthError && err.code === "invalid_origin") {
        logFailure("session", err, "origin");
        auditEvent("oauth_session_failed", req, { reason: "invalid_origin" });
        return res.status(403).json({ error: "Cross-origin sign-in sessions are not allowed." });
      }
      const code = oauth.publicErrorCode(err);
      logFailure("session", err, "exchange");
      auditEvent("oauth_session_failed", req, { reason: code });
      return res.status(401).json({ error: "Sign-in session expired. Please try again." });
    }
  })
);

module.exports = router;
