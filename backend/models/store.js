// ── Data Store ─────────────────────────────────────────────────────────────
// MongoDB-backed store with in-memory fallback for demo/development.
// All queries are scoped by userId — no IDOR possible.

const crypto = require("crypto");
const mongoose = require("mongoose");

let isMongo = false;
let db = null;
let client = null;

// ── Mongoose models (defined once per process) ──
const { Schema } = mongoose;

const userSchema = new Schema(
  {
    name: { type: String, required: true, unique: true, index: true },
    email: { type: String, unique: true, sparse: true },
    passwordHash: { type: String, required: true },
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
    return;
  }
  try {
    await mongoose.connect(mongoUri, {
      serverSelectionTimeoutMS: 5000,
    });
    isMongo = true;
    console.log("✓ Connected to MongoDB");
  } catch (err) {
    console.warn("⚠️  MongoDB connection failed, using in-memory store:", err.message);
    isMongo = false;
  }
}

function isMongoConnected() {
  return isMongo;
}

// ── User operations ──
async function createUser({ name, email, passwordHash }) {
  if (isMongo) {
    const existing = await User.findOne({ $or: [{ name }, ...(email ? [{ email }] : [])] });
    if (existing) throw Object.assign(new Error("Name/email already exists"), { code: 11000 });
    const user = new User({ name, email, passwordHash });
    await user.save();
    return { id: user._id.toString(), name, email, role: "free", createdAt: user.createdAt };
  }
  // In-memory
  const existing = memoryStore.users.find(
    (u) => u.name === name || (email && u.email === email)
  );
  if (existing) throw Object.assign(new Error("Name/email already exists"), { code: 11000 });
  const id = Math.random().toString(36).slice(2, 11);
  const user = { id, name, email, passwordHash, role: "free", createdAt: new Date().toISOString() };
  memoryStore.users.push(user);
  return { id, name, email, role: "free", createdAt: user.createdAt };
}

async function findUser(name) {
  if (isMongo) {
    const user = await User.findOne({ name });
    if (!user) return null;
    return { id: user._id.toString(), name: user.name, email: user.email, passwordHash: user.passwordHash, role: user.role, createdAt: user.createdAt };
  }
  return memoryStore.users.find((u) => u.name === name) || null;
}

async function getUserById(id) {
  if (isMongo) {
    if (!oid(id)) return null;
    const user = await User.findById(id);
    if (!user) return null;
    return { id: user._id.toString(), name: user.name, email: user.email, role: user.role, createdAt: user.createdAt };
  }
  return memoryStore.users.find((u) => u.id === id) || null;
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
    return { user, cvs: cvs.map(withId), analyses: analyses.map(withId), applications: apps.map(withId) };
  }
  const found = memoryStore.users.find((u) => u.id === userId);
  const user = found ? { ...found } : null;
  if (user) delete user.passwordHash;
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
  return true;
}

module.exports = {
  connect,
  isMongo: isMongoConnected,
  createUser,
  findUser,
  getUserById,
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
