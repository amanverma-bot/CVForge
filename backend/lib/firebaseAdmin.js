// Firebase Admin verification for Google ID tokens.
// Credentials are loaded lazily from a file outside the repository and are
// never logged or included in API responses.
const fs = require("fs");
const { initializeApp, getApps, cert } = require("firebase-admin/app");
const { getAuth } = require("firebase-admin/auth");
const env = require("../config/env");
const { logger } = require("./logger");

const APP_NAME = "cvforge-firebase";
const PROJECT_ID = env.FIREBASE_PROJECT_ID || "cvforge-ca97c";

class FirebaseAuthError extends Error {
  constructor(code, message = code) {
    super(message);
    this.name = "FirebaseAuthError";
    this.code = code;
  }
}

let cachedAuth = null;
let initFailure = null;

function isConfigured() {
  if (cachedAuth) return true;
  if (initFailure) return false;
  if (!env.FIREBASE_PROJECT_ID || !env.FIREBASE_SERVICE_ACCOUNT_PATH) return false;
  try {
    getFirebaseAuth();
    return true;
  } catch {
    return false;
  }
}

function getFirebaseAuth() {
  if (cachedAuth) return cachedAuth;
  if (initFailure) throw initFailure;
  if (!env.FIREBASE_PROJECT_ID || !env.FIREBASE_SERVICE_ACCOUNT_PATH) {
    throw new FirebaseAuthError("firebase_not_configured", "Firebase Auth is not configured");
  }

  try {
    const serviceAccount = JSON.parse(fs.readFileSync(env.FIREBASE_SERVICE_ACCOUNT_PATH, "utf8"));
    if (!serviceAccount || serviceAccount.project_id !== PROJECT_ID) {
      throw new FirebaseAuthError("firebase_project_mismatch", "Firebase Admin project mismatch");
    }

    const existing = getApps().find((app) => app.name === APP_NAME);
    const app = existing || initializeApp({ credential: cert(serviceAccount), projectId: PROJECT_ID }, APP_NAME);
    cachedAuth = getAuth(app);
    return cachedAuth;
  } catch (err) {
    const safeCode = err instanceof FirebaseAuthError ? err.code : err?.code || "firebase_admin_init_failed";
    logger.error({ code: safeCode }, "Firebase Admin initialization failed");
    initFailure = err instanceof FirebaseAuthError ? err : new FirebaseAuthError("firebase_admin_init_failed", "Firebase Admin initialization failed");
    throw initFailure;
  }
}

function validateDecodedToken(decoded) {
  if (!decoded || typeof decoded !== "object") {
    throw new FirebaseAuthError("invalid_token", "Invalid Firebase token");
  }
  if (decoded.aud !== PROJECT_ID) {
    throw new FirebaseAuthError("wrong_project", "Firebase token audience mismatch");
  }
  if (decoded.iss !== `https://securetoken.google.com/${PROJECT_ID}`) {
    throw new FirebaseAuthError("wrong_project", "Firebase token issuer mismatch");
  }
  if (typeof decoded.uid !== "string" || !decoded.uid || decoded.uid.length > 128) {
    throw new FirebaseAuthError("invalid_token", "Invalid Firebase token");
  }
  if (decoded.firebase?.sign_in_provider !== "google.com") {
    throw new FirebaseAuthError("wrong_provider", "Only Google sign-in is accepted");
  }
  return decoded;
}

async function verifyGoogleIdToken(idToken) {
  if (typeof idToken !== "string" || idToken.length < 1 || idToken.length > 8192) {
    throw new FirebaseAuthError("invalid_token", "Invalid Firebase token");
  }

  const auth = getFirebaseAuth();
  let decoded;
  try {
    decoded = await auth.verifyIdToken(idToken, true);
  } catch (err) {
    logger.warn({ code: typeof err?.code === "string" ? err.code : "firebase_token_invalid" }, "Firebase token verification failed");
    throw new FirebaseAuthError("invalid_token", "Invalid Firebase token");
  }
  return validateDecodedToken(decoded);
}

module.exports = {
  FirebaseAuthError,
  PROJECT_ID,
  isConfigured,
  getFirebaseAuth,
  validateDecodedToken,
  verifyGoogleIdToken,
};
