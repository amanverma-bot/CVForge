// Firebase Google sign-in. The client obtains a Google ID token from the
// Firebase Web SDK; this route verifies it server-side and issues the same
// CVForge JWT used by password and legacy OAuth sign-in.
const express = require("express");
const { authLimiter } = require("../middleware/rateLimit");
const { validate } = require("../middleware/validate");
const { firebaseLogin } = require("../schemas");
const { asyncHandler } = require("../middleware/error");
const { authResponse } = require("../middleware/auth");
const { auditEvent } = require("../middleware/audit");
const store = require("../models/store");
const { verifyGoogleIdToken } = require("../lib/firebaseAdmin");
const { resolveUser } = require("../lib/firebaseAuth");

const UNAVAILABLE = new Set(["firebase_not_configured", "firebase_admin_init_failed", "firebase_project_mismatch"]);
const INVALID = new Set(["invalid_token", "wrong_project", "wrong_provider"]);

function sendFirebaseError(res, err) {
  if (UNAVAILABLE.has(err.code)) {
    return res.status(503).json({
      error: "Google sign-in is not configured yet.",
      code: "firebase_not_configured",
    });
  }
  if (INVALID.has(err.code)) {
    return res.status(401).json({
      error: "Google sign-in could not be verified. Please try again.",
      code: "invalid_firebase_token",
    });
  }
  if (err.code === "account_conflict") {
    return res.status(409).json({
      error: "That email is already linked to a different sign-in method. Use your password or contact support.",
      code: "account_conflict",
    });
  }
  return null;
}

function createRouter({ verifyToken = verifyGoogleIdToken, resolve = resolveUser, getUser = store.getUserById } = {}) {
  const router = express.Router();

  router.post(
    "/firebase",
    authLimiter,
    validate({ body: firebaseLogin }),
    asyncHandler(async (req, res) => {
      try {
        const decoded = await verifyToken(req.body.idToken);
        const result = await resolve(decoded);
        const user = await getUser(result.user.id);
        if (!user) {
          return res.status(401).json({
            error: "Google sign-in could not be completed. Please try again.",
            code: "invalid_firebase_token",
          });
        }

        auditEvent(result.created ? "firebase_register" : result.linked ? "firebase_account_linked" : "firebase_login", req, {
          userId: user.id,
        });
        res.setHeader("Cache-Control", "no-store");
        return res.json(authResponse(user));
      } catch (err) {
        auditEvent("firebase_login_failed", req, {
          reason: typeof err?.code === "string" ? err.code.slice(0, 64) : "unknown",
        });
        const response = sendFirebaseError(res, err);
        if (response) return response;
        throw err;
      }
    })
  );

  return router;
}

const router = createRouter();

module.exports = router;
module.exports.createRouter = createRouter;
module.exports.sendFirebaseError = sendFirebaseError;
