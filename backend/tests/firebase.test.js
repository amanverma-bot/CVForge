// Firebase Google sign-in route tests with an injected token verifier.
// No real Firebase credentials or network calls are used.
import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";
import { createRequire } from "node:module";
import app from "../app.js";

const require = createRequire(import.meta.url);
const express = require("express");
const { createRouter } = require("../routes/firebaseAuth.js");
const { errorHandler } = require("../middleware/error.js");
const store = require("../models/store.js");
const firebaseAdmin = require("../lib/firebaseAdmin.js");
const { FirebaseAuthError } = firebaseAdmin;

const api = request(app);
const uniq = () => Math.random().toString(36).slice(2, 9);

function decoded(overrides = {}) {
  return {
    uid: `uid-${uniq()}`,
    name: `fb${uniq()}`,
    email: `fb-${uniq()}@example.com`,
    email_verified: true,
    picture: "https://lh3.googleusercontent.com/a/test",
    firebase: { sign_in_provider: "google.com" },
    ...overrides,
  };
}

function makeApi(verifyToken) {
  const testApp = express();
  testApp.use(express.json());
  testApp.use("/api/auth", createRouter({ verifyToken }));
  testApp.use(errorHandler);
  return request(testApp);
}

async function post(verifyToken, decodedToken) {
  verifyToken.mockResolvedValueOnce(decodedToken);
  return makeApi(verifyToken).post("/api/auth/firebase").send({ idToken: "test-id-token" });
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("POST /api/auth/firebase", () => {
  it("rejects missing and oversized tokens at validation", async () => {
    const verify = vi.fn();
    const testApi = makeApi(verify);
    expect((await testApi.post("/api/auth/firebase").send({})).status).toBe(400);
    const long = await testApi.post("/api/auth/firebase").send({ idToken: "x".repeat(9000) });
    expect(long.status).toBe(400);
    expect(verify).not.toHaveBeenCalled();
  });

  it("creates a new Google user and returns a usable CVForge JWT", async () => {
    const verify = vi.fn();
    const token = decoded();
    const res = await post(verify, token);
    expect(res.status).toBe(200);
    expect(res.headers["cache-control"]).toBe("no-store");
    expect(res.body.token).toBeTruthy();
    expect(res.body.user.email).toBe(token.email);
    expect(verify).toHaveBeenCalledWith("test-id-token");

    const user = await store.findUser(res.body.user.name);
    expect(user.email).toBe(token.email);
    expect(user.passwordHash).toBe("");
    expect(user.tokenVersion).toBe(0);
    expect((await store.findUserByProvider("firebase", token.uid)).id).toBe(res.body.user.id);

    const me = await api.get("/api/auth/me").set("Authorization", `Bearer ${res.body.token}`);
    expect(me.status).toBe(200);
    expect(me.body.user.id).toBe(res.body.user.id);
  });

  it("links an existing verified-email account without resetting its password state", async () => {
    const email = `link-${uniq()}@example.com`;
    const name = `link${uniq()}`;
    const created = await store.createUser({ name, email, passwordHash: "legacy-hash" });
    await store.incrementTokenVersion(created.id);
    await store.incrementTokenVersion(created.id);

    const uid = `uid-${uniq()}`;
    const res = await post(vi.fn(), decoded({ uid, email, name: `Google ${uniq()}` }));
    expect(res.status).toBe(200);
    expect(res.body.user.id).toBe(created.id);
    expect(res.body.user.email).toBe(email);

    const user = await store.findUser(name);
    expect((await store.findUserByProvider("firebase", uid)).id).toBe(created.id);
    expect(user.passwordHash).toBe("legacy-hash");
    expect(user.tokenVersion).toBe(2);
  });

  it("rejects an email linked to a different Firebase UID with 409", async () => {
    const email = `conflict-${uniq()}@example.com`;
    const name = `conflict${uniq()}`;
    const uidA = `uid-${uniq()}`;
    const uidB = `uid-${uniq()}`;
    const created = await store.createOAuthUser({
      name,
      email,
      provider: "firebase",
      providerId: uidA,
      avatar: null,
    });

    const res = await post(vi.fn(), decoded({ uid: uidB, email }));
    expect(res.status).toBe(409);
    expect(res.body.code).toBe("account_conflict");
    expect((await store.findUserByProvider("firebase", uidA)).id).toBe(created.id);
    expect(await store.findUserByProvider("firebase", uidB)).toBeNull();
  });

  it("does not link an unverified email to an existing password account", async () => {
    const email = `unverified-${uniq()}@example.com`;
    const name = `unverified${uniq()}`;
    const created = await store.createUser({ name, email, passwordHash: "legacy-hash" });

    const token = decoded({ uid: `uid-${uniq()}`, email, name: `Unverified ${uniq()}`, email_verified: false });
    const res = await post(vi.fn(), token);
    expect(res.status).toBe(200);
    expect(res.body.user.id).not.toBe(created.id);
    expect(res.body.user.email).toBeNull();

    const incoming = await store.findUser(res.body.user.name);
    const linked = await store.findUserByProvider("firebase", token.uid);
    expect(linked).toMatchObject({ id: incoming.id });
    expect(incoming.email).toBeNull();
    expect((await store.findUser(name)).email).toBe(email);
  });

  it("signs in an existing Firebase user without creating a duplicate", async () => {
    const uid = `uid-${uniq()}`;
    const email = `existing-${uniq()}@example.com`;
    const name = `existing${uniq()}`;
    const created = await store.createOAuthUser({ name, email, provider: "firebase", providerId: uid, avatar: null });

    const res = await post(vi.fn(), decoded({ uid, email, name }));
    expect(res.status).toBe(200);
    expect(res.body.user.id).toBe(created.id);
    expect((await store.findUserByProvider("firebase", uid)).id).toBe(created.id);
  });

  it("returns 401 for an invalid token without creating a user", async () => {
    const verify = vi.fn().mockRejectedValueOnce(new FirebaseAuthError("invalid_token"));
    const email = `invalid-${uniq()}@example.com`;
    const res = await makeApi(verify).post("/api/auth/firebase").send({ idToken: "bad-token" });
    expect(res.status).toBe(401);
    expect(res.body.code).toBe("invalid_firebase_token");
    expect(await store.findUserByEmail(email)).toBeNull();
  });

  it("returns 503 from the real app when Firebase Admin is not configured", async () => {
    const verify = vi.fn().mockRejectedValue(new FirebaseAuthError("firebase_not_configured"));
    const testApi = makeApi(verify);
    const res = await testApi.post("/api/auth/firebase").send({ idToken: "test-id-token" });
    expect(res.status).toBe(503);
    expect(res.body.code).toBe("firebase_not_configured");
  });

  it("reports Firebase provider status without exposing credentials", async () => {
    vi.spyOn(firebaseAdmin, "isConfigured").mockReturnValue(false);
    const res = await api.get("/api/auth/providers");
    expect(res.status).toBe(200);
    expect(res.body.providers.firebase).toEqual({ label: "Google", configured: false });
    expect(JSON.stringify(res.body)).not.toMatch(/service.?account|private.?key|client.?secret/i);
  });
});
