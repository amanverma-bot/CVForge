// MongoDB integration test for Firebase UID indexing and account linking.
// Gated by TEST_MONGO_URI and never connects to the production database:
// a fresh cvforge_test_* database is created and dropped in this run.
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const mongoose = require("mongoose");
const store = require("../models/store.js");
const { resolveUser, FirebaseLinkError } = require("../lib/firebaseAuth.js");

const baseUri = process.env.TEST_MONGO_URI || "";
const run = baseUri ? describe : describe.skip;
const stamp = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
const dbName = `cvforge_test_${stamp}`;
let uri = "";
let connected = false;

function decoded(overrides = {}) {
  return {
    uid: `uid-${stamp}-${Math.random().toString(36).slice(2, 8)}`,
    name: `Mongo Firebase ${stamp}`,
    email: `mongo-${stamp}-${Math.random().toString(36).slice(2, 8)}@example.com`,
    email_verified: true,
    picture: null,
    firebase: { sign_in_provider: "google.com" },
    ...overrides,
  };
}

async function rawUser(name) {
  return mongoose.connection.db.collection("users").findOne({ name });
}

beforeAll(async () => {
  if (!baseUri) return;
  const parsed = new URL(baseUri);
  parsed.pathname = `/${dbName}`;
  uri = parsed.toString();
  await store.connect(uri);
  connected = store.isMongo();
  expect(connected).toBe(true);
  expect(mongoose.connection.name).toBe(dbName);
  expect(dbName).not.toBe("cvforge");
  await mongoose.models.User.init();
});

afterAll(async () => {
  if (!connected) return;
  expect(mongoose.connection.name).toBe(dbName);
  await mongoose.connection.dropDatabase();
  await mongoose.disconnect();
});

run("Firebase MongoDB integration", () => {
  it("creates a unique sparse index on firebaseUid", async () => {
    const indexes = await mongoose.connection.db.collection("users").indexes();
    const index = indexes.find((entry) => entry.key.firebaseUid === 1);
    expect(index).toBeTruthy();
    expect(index.unique).toBe(true);
    expect(index.sparse).toBe(true);
  });

  it("links a verified email account in MongoDB without changing password state", async () => {
    const name = `mongo-link-${stamp}`;
    const email = `mongo-link-${stamp}@example.com`;
    const created = await store.createUser({ name, email, passwordHash: "mongo-legacy-hash" });
    await store.incrementTokenVersion(created.id);
    await store.incrementTokenVersion(created.id);

    const uid = `uid-link-${stamp}`;
    const result = await resolveUser(decoded({ uid, email, name: "Different Google Name" }));
    expect(result.user.id).toBe(created.id);
    expect(result.linked).toBe(true);

    const raw = await rawUser(name);
    expect(raw.firebaseUid).toBe(uid);
    expect(raw.passwordHash).toBe("mongo-legacy-hash");
    expect(raw.tokenVersion).toBe(2);
    expect(raw.name).toBe(name);
  });

  it("rejects a second Firebase UID for the same email", async () => {
    const name = `mongo-conflict-${stamp}`;
    const email = `mongo-conflict-${stamp}@example.com`;
    const uidA = `uid-a-${stamp}`;
    const uidB = `uid-b-${stamp}`;
    const created = await store.createOAuthUser({ name, email, provider: "firebase", providerId: uidA, avatar: null });

    await expect(resolveUser(decoded({ uid: uidB, email }))).rejects.toMatchObject({ code: "account_conflict" });
    expect(await mongoose.connection.db.collection("users").countDocuments({ email })).toBe(1);
    const raw = await rawUser(name);
    expect(raw._id.toString()).toBe(created.id);
    expect(raw.firebaseUid).toBe(uidA);
  });

  it("does not link an unverified email in MongoDB", async () => {
    const name = `mongo-unverified-${stamp}`;
    const email = `mongo-unverified-${stamp}@example.com`;
    const created = await store.createUser({ name, email, passwordHash: "mongo-legacy-hash" });

    const token = decoded({ email, email_verified: false });
    const result = await resolveUser(token);
    expect(result.user.id).not.toBe(created.id);

    const rawNew = await rawUser(result.user.name);
    expect(rawNew.firebaseUid).toBe(token.uid);
    expect(rawNew.email).toBeUndefined();
    const rawExisting = await rawUser(name);
    expect(rawExisting.firebaseUid).toBeUndefined();
    expect(await mongoose.connection.db.collection("users").countDocuments({ email })).toBe(1);
  });

  it("signs in an existing Firebase UID without duplicating the account", async () => {
    const name = `mongo-existing-${stamp}`;
    const email = `mongo-existing-${stamp}@example.com`;
    const uid = `uid-existing-${stamp}`;
    const created = await store.createOAuthUser({ name, email, provider: "firebase", providerId: uid, avatar: null });

    const result = await resolveUser(decoded({ uid, email, name: "Renamed by Google" }));
    expect(result.user.id).toBe(created.id);
    expect(result.created).toBe(false);
    expect(await mongoose.connection.db.collection("users").countDocuments({ firebaseUid: uid })).toBe(1);
    expect((await rawUser(name)).name).toBe(name);
  });
});

describe("Firebase MongoDB integration safety", () => {
  it("uses a dedicated test database and the expected error type", () => {
    expect(baseUri || "skipped").toBeTruthy();
    expect(dbName.startsWith("cvforge_test_")).toBe(true);
    expect(dbName).not.toBe("cvforge");
    expect(new FirebaseLinkError("account_conflict").code).toBe("account_conflict");
  });
});
