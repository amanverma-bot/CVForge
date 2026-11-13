// ── Data Store ─────────────────────────────────────────────────────────────
// MongoDB-backed store with in-memory fallback for demo/development.
// All queries are scoped by userId — no IDOR possible.

const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const mongoose = require("mongoose");
const env = require("../config/env");

// ── Optional file-backed persistence when MongoDB is not configured ──
// Keeps the in-memory fallback useful across restarts (local/dev/demo).
const DATA_DIR = path.join(__dirname, "..", "data");
const DATA_FILE = path.join(DATA_DIR, "store.json");
let fileStore = false;

function persist() {
  if (!fileStore || isMongo) return;
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    const tmp = DATA_FILE + ".tmp";
    fs.writeFileSync(
      tmp,
      JSON.stringify({
        users: memoryStore.users,
        cvs: memoryStore.cvs,
        analyses: memoryStore.analyses,
        applications: memoryStore.applications,
      })
    );
    fs.renameSync(tmp, DATA_FILE);
  } catch (err) {
    console.error("⚠️  Could not persist local store:", err.message);
  }
}

function loadFileStore() {
  fileStore = true;
  try {
    const raw = JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));
    memoryStore.users = Array.isArray(raw.users) ? raw.users : [];
    memoryStore.cvs = Array.isArray(raw.cvs) ? raw.cvs : [];
    memoryStore.analyses = Array.isArray(raw.analyses) ? raw.analyses : [];
    memoryStore.applications = Array.isArray(raw.applications) ? raw.applications : [];
    console.log(
      `💾 Loaded file store (${memoryStore.users.length} users, ${memoryStore.cvs.length} CVs) from ${DATA_FILE}`
    );
  } catch {
    /* first run — nothing persisted yet */
  }
}

let isMongo = false;
let db = null;
let client = null;

// ── Mongoose models (defined once per process) ──
const { Schema } = mongoose;

const userSchema = new Schema(
  {
    name: { type: String, required: true, unique: true, index: true },
    email: { type: String, unique: true, sparse: true },
    passwordHash: { type: String, default: "" },
    googleId: { type: String, unique: true, sparse: true },
    githubId: { type: String, unique: true, sparse: true },
    firebaseUid: { type: String, unique: true, sparse: true },
    tokenVersion: { type: Number, default: 0 },
    avatar: { type: String, maxlength: 500 },
    role: { type: String, default: "free" },
  },
  { timestamps: true }
);

const cvSchema = new Schema(
  {
    userId: { type: String, required: true, index: true },
    personalInfo: { type: Schema.Types.Mixed, default: {} },
    education: String,
    experience: String,
    skills: String,
    projects: String,
    template: { type: String, default: "modern" },
    role: String,
    generatedText: String,
    shareToken: { type: String, index: true, sparse: true },
    sharedAt: Date,
  },
  { timestamps: true, strict: false }
);

const analysisSchema = new Schema(
  {
    userId: { type: String, required: true, index: true },
    cvId: { type: String, default: null },
    scoreData: Schema.Types.Mixed,
    missingKeywords: [String],
    suggestions: [String],
    overall: Number,
    verdict: String,
    cvText: String,
    jdText: String,
    resultJson: String,
  },
  { timestamps: true }
);

const applicationSchema = new Schema(
  {
    userId: { type: String, required: true, index: true },
    title: String,
    company: String,
    status: {
      type: String,
      enum: ["wishlist", "applied", "screening", "interview", "offer", "rejected"],
      default: "wishlist",
    },
    notes: String,
    remindAt: String,
  },
  { timestamps: true, strict: false }
);

const User = mongoose.models.User || mongoose.model("User", userSchema);
const CV = mongoose.models.CV || mongoose.model("CV", cvSchema);
const Analysis = mongoose.models.Analysis || mongoose.model("Analysis", analysisSchema);
const Application = mongoose.models.Application || mongoose.model("Application", applicationSchema);

// ObjectId guard: route ids are generic strings, so invalid values must 404, not throw CastError.
const oid = (id) => (mongoose.isValidObjectId(id) ? id : null);

// Normalize Mongo documents so routes always get both `id` and `_id`.
const withId = (doc) => {
  if (!doc) return doc;
  const o = doc.toObject ? doc.toObject() : doc;
  if (o._id && !o.id) o.id = o._id.toString();
  return o;
};

const OAUTH_PROVIDER_FIELDS = Object.freeze({ google: "googleId", github: "githubId", firebase: "firebaseUid" });

function providerField(provider) {
  const field = OAUTH_PROVIDER_FIELDS[provider];
  if (!field) throw Object.assign(new Error("Unsupported OAuth provider"), { code: "unsupported_oauth_provider" });
  return field;
}

// Public user projection: never expose password hashes or provider identifiers.
function publicUser(doc) {
  if (!doc) return null;
  const o = withId(doc);
  return {
    id: o.id,
    name: o.name,
    email: o.email || null,
    avatar: o.avatar || null,
    role: o.role || "free",
    createdAt: o.createdAt,
  };
}

const newShareToken = () => crypto.randomBytes(8).toString("hex");

// In-memory fallback
const memoryStore = {
  users: [],
  cvs: [],
  analyses: [],
  applications: [],
  captchas: [],
};

async function connect(mongoUri) {
  if (!mongoUri) {
    isMongo = false;
    loadFileStore();
    console.log("💾 No MONGO_URI — file-backed store (data persists across restarts)");
    return;
  }
  try {
    await mongoose.connect(mongoUri, {
      serverSelectionTimeoutMS: 5000,
      ...(process.env.NODE_ENV === "production" ? { autoIndex: false } : {}),
    });
    isMongo = true;
    console.log("✓ Connected to MongoDB");
  } catch (err) {
    isMongo = false;
    // Surface only the driver message — never echo the URI (it contains credentials).
    const reason = err && err.message ? err.message : "unknown error";
    if (env.REQUIRE_MONGO) {
      console.error(
        "✗ MongoDB connection failed — REQUIRE_MONGO is enabled, so the server will not start on the fallback store."
      );
      throw err;
    }
    console.warn(
      `⚠️  MongoDB connection failed (${reason}). Falling back to the file-backed store; set REQUIRE_MONGO=true to fail fast instead.`
    );
    if (!fileStore) loadFileStore();
  }
}

function isMongoConnected() {
  return isMongo;
}

// ── User operations ──
async function createUser({ name, email, passwordHash }) {
  const normalizedEmail = email ? String(email).trim().toLowerCase() : undefined;
  if (isMongo) {
    const existing = await User.findOne({ $or: [{ name }, ...(normalizedEmail ? [{ email: normalizedEmail }] : [])] });
    if (existing) throw Object.assign(new Error("Name/email already exists"), { code: 11000 });
    const user = new User({ name, email: normalizedEmail, passwordHash });
    await user.save();
    return publicUser(user);
  }
  // In-memory
  const existing = memoryStore.users.find(
    (u) => u.name === name || (normalizedEmail && u.email === normalizedEmail)
  );
  if (existing) throw Object.assign(new Error("Name/email already exists"), { code: 11000 });
  const id = Math.random().toString(36).slice(2, 11);
  const user = { id, name, email: normalizedEmail, passwordHash, role: "free", tokenVersion: 0, createdAt: new Date().toISOString() };
  memoryStore.users.push(user);
  persist();
  return publicUser(user);
}

async function findUser(name) {
  if (isMongo) {
    const user = await User.findOne({ name }) || (name.includes('@') ? await User.findOne({ email: name }) : null);
    if (!user) return null;
    return { ...publicUser(user), passwordHash: user.passwordHash || "", tokenVersion: Number(user.tokenVersion || 0) };
  }
  const user = memoryStore.users.find((u) => u.name === name || (name.includes('@') && u.email === name)) || null;
  return user ? { ...publicUser(user), passwordHash: user.passwordHash || "", tokenVersion: Number(user.tokenVersion || 0) } : null;
}

async function getUserById(id) {
  if (isMongo) {
    if (!oid(id)) return null;
    const user = await User.findById(id);
    if (!user) return null;
    return { ...publicUser(user), tokenVersion: Number(user.tokenVersion || 0) };
  }
  const user = memoryStore.users.find((u) => u.id === id) || null;
  return user ? { ...publicUser(user), tokenVersion: Number(user.tokenVersion || 0) } : null;
}

async function incrementTokenVersion(userId) {
  if (isMongo) {
    if (!oid(userId)) return false;
    const result = await User.updateOne({ _id: userId }, { $inc: { tokenVersion: 1 } });
    return result.matchedCount > 0;
  }
  const user = memoryStore.users.find((u) => u.id === userId);
  if (!user) return false;
  user.tokenVersion = Number(user.tokenVersion || 0) + 1;
  persist();
  return true;
}

async function findUserByEmail(email) {
  if (!email) return null;
  const needle = String(email).trim().toLowerCase();
  if (isMongo) {
    const escaped = needle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const user = await User.findOne({ email: { $regex: `^${escaped}$`, $options: "i" } });
    return publicUser(user);
  }
  const user = memoryStore.users.find((u) => u.email && String(u.email).toLowerCase() === needle) || null;
  return publicUser(user);
}

async function findUserByProvider(provider, providerId) {
  if (!providerId) return null;
  const field = providerField(provider);
  const value = String(providerId);
  if (isMongo) {
    const user = await User.findOne({ [field]: value });
    return publicUser(user);
  }
  const user = memoryStore.users.find((u) => String(u[field] || "") === value) || null;
  return publicUser(user);
}

async function linkOAuthAccount(userId, { provider, providerId, avatar }) {
  if (!providerId) return null;
  const field = providerField(provider);
  const value = String(providerId);

  if (isMongo) {
    if (!oid(userId)) return null;
    const [user, other] = await Promise.all([
      User.findById(userId),
      User.findOne({ [field]: value }),
    ]);
    if (!user) return null;
    if (other && String(other._id) !== String(user._id)) {
      throw Object.assign(new Error("OAuth account is already linked"), { code: "oauth_account_conflict" });
    }
    const current = user.get(field);
    if (current && String(current) !== value) {
      throw Object.assign(new Error("Account is already linked to another provider identity"), { code: "oauth_account_conflict" });
    }
    user.set(field, value);
    if (avatar && !user.avatar) user.avatar = String(avatar).slice(0, 500);
    await user.save();
    return publicUser(user);
  }

  const user = memoryStore.users.find((u) => u.id === userId);
  if (!user) return null;
  const other = memoryStore.users.find((u) => u.id !== userId && String(u[field] || "") === value);
  if (other || (user[field] && String(user[field]) !== value)) {
    throw Object.assign(new Error("OAuth account is already linked"), { code: "oauth_account_conflict" });
  }
  user[field] = value;
  if (avatar && !user.avatar) user.avatar = String(avatar).slice(0, 500);
  persist();
  return publicUser(user);
}

async function createOAuthUser({ name, email, provider, providerId, avatar }) {
  const field = providerField(provider);
  const value = String(providerId);
  const normalizedEmail = email ? String(email).trim().toLowerCase() : undefined;

  if (isMongo) {
    const emailFilter = normalizedEmail
      ? { email: { $regex: `^${normalizedEmail.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, $options: "i" } }
      : null;
    const existing = await User.findOne({
      $or: [{ name }, { [field]: value }, ...(emailFilter ? [emailFilter] : [])],
    });
    if (existing) throw Object.assign(new Error("Name/email/provider already exists"), { code: 11000 });
    const user = new User({
      name,
      email: normalizedEmail,
      [field]: value,
      avatar: avatar ? String(avatar).slice(0, 500) : undefined,
      role: "free",
    });
    await user.save();
    return publicUser(user);
  }

  const existing = memoryStore.users.find(
    (u) => u.name === name || String(u[field] || "") === value || (normalizedEmail && u.email && String(u.email).toLowerCase() === normalizedEmail)
  );
  if (existing) throw Object.assign(new Error("Name/email/provider already exists"), { code: 11000 });
  const id = Math.random().toString(36).slice(2, 11);
  const user = {
    id,
    name,
    email: normalizedEmail,
    [field]: value,
    avatar: avatar ? String(avatar).slice(0, 500) : null,
    role: "free",
    tokenVersion: 0,
    createdAt: new Date().toISOString(),
  };
  memoryStore.users.push(user);
  persist();
  return publicUser(user);
}

// ── CV operations ──
async function createCV({ userId, ...data }) {
  if (isMongo) {
    const cv = new CV({ userId, ...data });
    await cv.save();
    return withId(cv);
  }
  const id = Math.random().toString(36).slice(2, 11);
  const cv = { id, userId, ...data, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
  memoryStore.cvs.push(cv);
  persist();
  return cv;
}

async function listCVs(userId) {
  if (isMongo) {
    return (await CV.find({ userId }).sort({ createdAt: -1 }).lean()).map(withId);
  }
  return memoryStore.cvs.filter((c) => c.userId === userId).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
}

async function getCV(id, userId) {
  if (isMongo) {
    if (!oid(id)) return null;
    return withId(await CV.findOne({ _id: id, userId }).lean());
  }
  return memoryStore.cvs.find((c) => c.id === id && c.userId === userId) || null;
}

async function updateCV(id, userId, data) {
  if (isMongo) {
    if (!oid(id)) return null;
    const cv = await CV.findOneAndUpdate(
      { _id: id, userId },
      { $set: { ...data, updatedAt: new Date() } },
      { new: true, runValidators: true }
    ).lean();
    return withId(cv);
  }
  const cv = memoryStore.cvs.find((c) => c.id === id && c.userId === userId);
  if (!cv) return null;
  Object.assign(cv, data, { updatedAt: new Date().toISOString() });
  persist();
  return cv;
}

async function shareCV(id, userId) {
  if (isMongo) {
    if (!oid(id)) return null;
    const cv = await CV.findOne({ _id: id, userId });
    if (!cv) return null;
    const token = newShareToken();
    cv.shareToken = token;
    cv.sharedAt = new Date();
    await cv.save();
    return { token, url: `/s/${token}` };
  }
  const cv = memoryStore.cvs.find((c) => c.id === id && c.userId === userId);
  if (!cv) return null;
  const token = newShareToken();
  cv.shareToken = token;
  cv.sharedAt = new Date().toISOString();
  persist();
  return { token, url: `/s/${token}` };
}

async function revokeShare(id, userId) {
  if (isMongo) {
    if (!oid(id)) return false;
    const cv = await CV.findOneAndUpdate({ _id: id, userId }, { $unset: { shareToken: 1, sharedAt: 1 } });
    return !!cv;
  }
  const cv = memoryStore.cvs.find((c) => c.id === id && c.userId === userId);
  if (!cv) return false;
  delete cv.shareToken;
  delete cv.sharedAt;
  persist();
  return true;
}

async function getShared(token) {
  if (isMongo) {
    return withId(await CV.findOne({ shareToken: token }).lean());
  }
  return memoryStore.cvs.find((c) => c.shareToken === token) || null;
}

// ── Analysis operations ──
async function saveAnalysis({ userId, cvId, scoreData, missingKeywords, suggestions, overall, verdict, cvText, jdText, resultJson }) {
  if (isMongo) {
    const analysis = new Analysis({ userId, cvId, scoreData, missingKeywords, suggestions, overall, verdict, cvText, jdText, resultJson });
    await analysis.save();
    return withId(analysis);
  }
  const id = Math.random().toString(36).slice(2, 11);
  const analysis = { id, userId, cvId, scoreData, missingKeywords, suggestions, overall, verdict, cvText, jdText, resultJson, createdAt: new Date().toISOString() };
  memoryStore.analyses.push(analysis);
  persist();
  return analysis;
}

async function listAnalyses(userId) {
  if (isMongo) {
    return (await Analysis.find({ userId }).sort({ createdAt: -1 }).lean()).map(withId);
  }
  return memoryStore.analyses.filter((a) => a.userId === userId).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
}

// ── Application operations ──
const STATUSES = ["wishlist", "applied", "screening", "interview", "offer", "rejected"];

async function createApplication({ userId, ...data }) {
  if (isMongo) {
    const app = new Application({ userId, ...data });
    await app.save();
    return withId(app);
  }
  const id = Math.random().toString(36).slice(2, 11);
  const app = { id, userId, ...data, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
  memoryStore.applications.push(app);
  persist();
  return app;
}

async function listApplications(userId) {
  if (isMongo) {
    return (await Application.find({ userId }).sort({ createdAt: -1 }).lean()).map(withId);
  }
  return memoryStore.applications.filter((a) => a.userId === userId).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
}

async function updateApplication(id, userId, data) {
  if (isMongo) {
    if (!oid(id)) return null;
    return withId(await Application.findOneAndUpdate({ _id: id, userId }, { $set: { ...data, updatedAt: new Date() } }, { new: true }).lean());
  }
  const app = memoryStore.applications.find((a) => a.id === id && a.userId === userId);
  if (!app) return null;
  Object.assign(app, data, { updatedAt: new Date().toISOString() });
  persist();
  return app;
}

async function deleteApplication(id, userId) {
  if (isMongo) {
    if (!oid(id)) return false;
    const res = await Application.deleteOne({ _id: id, userId });
    return res.deletedCount > 0;
  }
  const idx = memoryStore.applications.findIndex((a) => a.id === id && a.userId === userId);
  if (idx === -1) return false;
  memoryStore.applications.splice(idx, 1);
  persist();
  return true;
}

// ── Privacy operations ──
async function exportUserData(userId) {
  if (isMongo) {
    if (!oid(userId)) return { user: null, cvs: [], analyses: [], applications: [] };
    const [user, cvs, analyses, apps] = await Promise.all([
      User.findById(userId).lean(),
      CV.find({ userId }).lean(),
      Analysis.find({ userId }).lean(),
      Application.find({ userId }).lean(),
    ]);
    if (user) delete user.passwordHash;
    if (user) delete user.tokenVersion;
    return { user, cvs: cvs.map(withId), analyses: analyses.map(withId), applications: apps.map(withId) };
  }
  const found = memoryStore.users.find((u) => u.id === userId);
  const user = found ? { ...found } : null;
  if (user) delete user.passwordHash;
  if (user) delete user.tokenVersion;
  return {
    user,
    cvs: memoryStore.cvs.filter((c) => c.userId === userId),
    analyses: memoryStore.analyses.filter((a) => a.userId === userId),
    applications: memoryStore.applications.filter((a) => a.userId === userId),
  };
}

async function deleteAccount(userId) {
  if (isMongo) {
    if (!oid(userId)) return false;
    await Promise.all([
      User.deleteOne({ _id: userId }),
      CV.deleteMany({ userId }),
      Analysis.deleteMany({ userId }),
      Application.deleteMany({ userId }),
    ]);
    return true;
  }
  memoryStore.users = memoryStore.users.filter((u) => u.id !== userId);
  memoryStore.cvs = memoryStore.cvs.filter((c) => c.userId !== userId);
  memoryStore.analyses = memoryStore.analyses.filter((a) => a.userId !== userId);
  memoryStore.applications = memoryStore.applications.filter((a) => a.userId !== userId);
  persist();
  return true;
}

module.exports = {
  connect,
  isMongo: isMongoConnected,
  storage: () => (isMongo ? "mongo" : fileStore ? "file" : "memory"),
  createUser,
  findUser,
  getUserById,
  incrementTokenVersion,
  findUserByEmail,
  findUserByProvider,
  linkOAuthAccount,
  createOAuthUser,
  createCV,
  listCVs,
  getCV,
  updateCV,
  shareCV,
  revokeShare,
  getShared,
  saveAnalysis,
  listAnalyses,
  createApplication,
  listApplications,
  updateApplication,
  deleteApplication,
  exportUserData,
  deleteAccount,
  STATUSES,
};
