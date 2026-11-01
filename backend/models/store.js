// ── Data Store ─────────────────────────────────────────────────────────────
// MongoDB-backed store with in-memory fallback for demo/development.
// All queries are scoped by userId — no IDOR possible.

let isMongo = false;
let db = null;
let client = null;

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
    const { MongoClient } = require("mongoose");
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
    const User = mongoose.model("User");
    const existing = await User.findOne({ $or: [{ name }, ...(email ? [{ email }] : [])] });
    if (existing) throw Object.assign(new Error("Name/email already exists"), { code: 11000 });
    const user = new User({ name, email, passwordHash });
    await user.save();
    return { id: user._id.toString(), name, email, role: "free" };
  }
  // In-memory
  const existing = memoryStore.users.find(
    (u) => u.name === name || (email && u.email === email)
  );
  if (existing) throw Object.assign(new Error("Name/email already exists"), { code: 11000 });
  const id = Math.random().toString(36).slice(2, 11);
  const user = { id, name, email, passwordHash, role: "free", createdAt: new Date().toISOString() };
  memoryStore.users.push(user);
  return { id, name, email, role: "free" };
}

async function findUser(name) {
  if (isMongo) {
    const User = mongoose.model("User");
    const user = await User.findOne({ name });
    if (!user) return null;
    return { id: user._id.toString(), name: user.name, email: user.email, passwordHash: user.passwordHash, role: user.role };
  }
  return memoryStore.users.find((u) => u.name === name) || null;
}

async function getUserById(id) {
  if (isMongo) {
    const User = mongoose.model("User");
    const user = await User.findById(id);
    if (!user) return null;
    return { id: user._id.toString(), name: user.name, email: user.email, role: user.role };
  }
  return memoryStore.users.find((u) => u.id === id) || null;
}

// ── CV operations ──
async function createCV({ userId, ...data }) {
  if (isMongo) {
    const CV = mongoose.model("CV");
    const cv = new CV({ userId, ...data });
    await cv.save();
    return cv.toObject ? cv.toObject() : cv;
  }
  const id = Math.random().toString(36).slice(2, 11);
  const cv = { id, userId, ...data, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
  memoryStore.cvs.push(cv);
  return cv;
}

async function listCVs(userId) {
  if (isMongo) {
    const CV = mongoose.model("CV");
    return CV.find({ userId }).sort({ createdAt: -1 }).lean();
  }
  return memoryStore.cvs.filter((c) => c.userId === userId).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
}

async function getCV(id, userId) {
  if (isMongo) {
    const CV = mongoose.model("CV");
    return CV.findOne({ _id: id, userId }).lean();
  }
  return memoryStore.cvs.find((c) => c.id === id && c.userId === userId) || null;
}

async function shareCV(id, userId) {
  if (isMongo) {
    const CV = mongoose.model("CV");
    const cv = await CV.findOne({ _id: id, userId });
    if (!cv) return null;
    const token = Math.random().toString(36).slice(2, 14);
    cv.shareToken = token;
    cv.sharedAt = new Date();
    await cv.save();
    return { token, url: `/s/${token}` };
  }
  const cv = memoryStore.cvs.find((c) => c.id === id && c.userId === userId);
  if (!cv) return null;
  const token = Math.random().toString(36).slice(2, 14);
  cv.shareToken = token;
  cv.sharedAt = new Date().toISOString();
  return { token, url: `/s/${token}` };
}

async function revokeShare(id, userId) {
  if (isMongo) {
    const CV = mongoose.model("CV");
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
    const CV = mongoose.model("CV");
    return CV.findOne({ shareToken: token }).lean();
  }
  return memoryStore.cvs.find((c) => c.shareToken === token) || null;
}

// ── Analysis operations ──
async function saveAnalysis({ userId, cvId, scoreData, missingKeywords, suggestions, overall, verdict, cvText, jdText, resultJson }) {
  if (isMongo) {
    const Analysis = mongoose.model("Analysis");
    const analysis = new Analysis({ userId, cvId, scoreData, missingKeywords, suggestions, overall, verdict, cvText, jdText, resultJson });
    await analysis.save();
    return analysis.toObject ? analysis.toObject() : analysis;
  }
  const id = Math.random().toString(36).slice(2, 11);
  const analysis = { id, userId, cvId, scoreData, missingKeywords, suggestions, overall, verdict, cvText, jdText, resultJson, createdAt: new Date().toISOString() };
  memoryStore.analyses.push(analysis);
  return analysis;
}

async function listAnalyses(userId) {
  if (isMongo) {
    const Analysis = mongoose.model("Analysis");
    return Analysis.find({ userId }).sort({ createdAt: -1 }).lean();
  }
  return memoryStore.analyses.filter((a) => a.userId === userId).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
}

// ── Application operations ──
const STATUSES = ["wishlist", "applied", "screening", "interview", "offer", "rejected"];

async function createApplication({ userId, ...data }) {
  if (isMongo) {
    const Application = mongoose.model("Application");
    const app = new Application({ userId, ...data });
    await app.save();
    return app.toObject ? app.toObject() : app;
  }
  const id = Math.random().toString(36).slice(2, 11);
  const app = { id, userId, ...data, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
  memoryStore.applications.push(app);
  return app;
}

async function listApplications(userId) {
  if (isMongo) {
    const Application = mongoose.model("Application");
    return Application.find({ userId }).sort({ createdAt: -1 }).lean();
  }
  return memoryStore.applications.filter((a) => a.userId === userId).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
}

async function updateApplication(id, userId, data) {
  if (isMongo) {
    const Application = mongoose.model("Application");
    const app = await Application.findOneAndUpdate({ _id: id, userId }, { $set: { ...data, updatedAt: new Date() } }, { new: true }).lean();
    return app;
  }
  const app = memoryStore.applications.find((a) => a.id === id && a.userId === userId);
  if (!app) return null;
  Object.assign(app, data, { updatedAt: new Date().toISOString() });
  return app;
}

async function deleteApplication(id, userId) {
  if (isMongo) {
    const Application = mongoose.model("Application");
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
    const User = mongoose.model("User");
    const CV = mongoose.model("CV");
    const Analysis = mongoose.model("Analysis");
    const Application = mongoose.model("Application");
    const [user, cvs, analyses, apps] = await Promise.all([
      User.findById(userId).lean(),
      CV.find({ userId }).lean(),
      Analysis.find({ userId }).lean(),
      Application.find({ userId }).lean(),
    ]);
    return { user, cvs, analyses, applications: apps };
  }
  return {
    user: memoryStore.users.find((u) => u.id === userId),
    cvs: memoryStore.cvs.filter((c) => c.userId === userId),
    analyses: memoryStore.analyses.filter((a) => a.userId === userId),
    applications: memoryStore.applications.filter((a) => a.userId === userId),
  };
}

async function deleteAccount(userId) {
  if (isMongo) {
    const User = mongoose.model("User");
    const CV = mongoose.model("CV");
    const Analysis = mongoose.model("Analysis");
    const Application = mongoose.model("Application");
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