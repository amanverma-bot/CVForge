// Pure checks for Firebase ID-token claims. Signature verification itself is
// delegated to firebase-admin and is covered by mocked route tests.
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const envModule = require("../config/env.js");
const {
  validateDecodedToken,
  isConfigured,
  FirebaseAuthError,
} = require("../lib/firebaseAdmin.js");

const PROJECT_ID = "cvforge-ca97c";
const valid = () => ({
  aud: PROJECT_ID,
  iss: `https://securetoken.google.com/${PROJECT_ID}`,
  uid: "firebase-user-id",
  firebase: { sign_in_provider: "google.com" },
});

let originalProjectId;
let originalServiceAccountPath;

beforeEach(() => {
  originalProjectId = envModule.FIREBASE_PROJECT_ID;
  originalServiceAccountPath = envModule.FIREBASE_SERVICE_ACCOUNT_PATH;
  envModule.FIREBASE_PROJECT_ID = undefined;
  envModule.FIREBASE_SERVICE_ACCOUNT_PATH = undefined;
  vi.clearAllMocks();
});

afterEach(() => {
  envModule.FIREBASE_PROJECT_ID = originalProjectId;
  envModule.FIREBASE_SERVICE_ACCOUNT_PATH = originalServiceAccountPath;
});

function expectCode(fn, code) {
  try {
    fn();
  } catch (err) {
    expect(err).toBeInstanceOf(FirebaseAuthError);
    expect(err.code).toBe(code);
    return;
  }
  throw new Error("Expected FirebaseAuthError");
}

describe("Firebase token claim validation", () => {
  it("accepts a Google token for the CVForge project", () => {
    const token = valid();
    expect(validateDecodedToken(token)).toBe(token);
  });

  it("rejects a token for another project", () => {
    expectCode(() => validateDecodedToken({ ...valid(), aud: "other-project" }), "wrong_project");
    expectCode(
      () => validateDecodedToken({ ...valid(), iss: "https://securetoken.google.com/other-project" }),
      "wrong_project"
    );
  });

  it("rejects non-Google Firebase providers", () => {
    expectCode(
      () => validateDecodedToken({ ...valid(), firebase: { sign_in_provider: "password" } }),
      "wrong_provider"
    );
    expectCode(() => validateDecodedToken({ ...valid(), firebase: undefined }), "wrong_provider");
  });

  it("rejects malformed identities", () => {
    expectCode(() => validateDecodedToken(null), "invalid_token");
    expectCode(() => validateDecodedToken({ ...valid(), uid: "" }), "invalid_token");
  });

  it("reports unconfigured status when no Admin credentials are set", () => {
    expect(isConfigured()).toBe(false);
  });
});
