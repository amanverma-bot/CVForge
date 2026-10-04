// Collections (exact schema):
//   Users        {_id, name, email, passwordHash, createdAt}
//   CVs          {_id, userId, personalInfo, education, experience, skills, projects, template, shareToken, createdAt}
//   Analyses     {_id, userId, cvId, scoreData, missingKeywords, suggestions, createdAt}
//   Applications {_id, userId, title, company, status, notes, createdAt}
const STATUSES = ["wishlist", "applied", "screening", "interview", "offer", "rejected"];
const memory = { users: new Map(), cvs: new Map(), analyses: [], applications: new Map(), seq: 1 };
let useMongo = false;
let User, CV, Analysis, Application;
const newToken = () => require("crypto").randomBytes(12).toString("hex");

async function initDB() {
  const uri = process.env.MONGO_URI;
  if (!uri) { console.log("ℹ️  No MONGO_URI — in-memory Users/CVs/Analyses (set MONGO_URI for Atlas)"); return { useMongo: false }; }
  const mongoose = require("mongoose");
  await mongoose.connect(uri);
  useMongo = true;
  User = mongoose.models.User || mongoose.model("User", new mongoose.Schema({
    name: { type: String, unique: true }, email: { type: String, unique: true, sparse: true },
    passwordHash: String, createdAt: { type: Date, default: Date.now },
  }));
  CV = mongoose.models.CV || mongoose.model("CV", new mongoose.Schema({
    userId: String, personalInfo: Object, education: String, experience: String,
    skills: String, projects: String, template: { type: String, default: "modern" },
    role: { type: String, default: "" }, generatedText: { type: String, default: "" },
    shareToken: { type: String, unique: true, sparse: true },
    createdAt: { type: Date, default: Date.now },
  }));
  Application = mongoose.models.Application || mongoose.model("Application", new mongoose.Schema({
    userId: String, title: String, company: String,
    status: { type: String, default: "wishlist" }, notes: String,
    remindAt: { type: String, default: null }, // ISO date for follow-up reminders
    createdAt: { type: Date, default: Date.now },
  }));
  Analysis = mongoose.models.Analysis || mongoose.model("Analysis", new mongoose.Schema({
    userId: String, cvId: { type: String, default: null },
    scoreData: Object, missingKeywords: [String], suggestions: [String],
    overall: Number, verdict: String, cvText: String, jdText: String, resultJson: String,
    createdAt: { type: Date, default: Date.now },
  }));
  console.log("✅ MongoDB connected (Users/CVs/Analyses)");
  return { useMongo: true };
}

// ---- Users (login id = name; email unique) ----
async function findUser(identifier) {
  const id = String(identifier || "").trim();
  if (useMongo) return User.findOne({ $or: [{ name: id }, { email: id }] });
  return memory.users.get(id.toLowerCase()) || [...memory.users.values()].find(u => (u.email || "").toLowerCase() === id.toLowerCase()) || null;
}
// New signature: {name, email, passwordHash}. Legacy {username, password} also accepted.
async function createUser({ name, username, email, password, passwordHash }) {
  const nm = String(name || username || "").trim();
  const em = String(email || "").trim();
  const hash = passwordHash || password || "";
  if (!nm) { const e = new Error("name required"); e.code = 400; throw e; }
  if (useMongo) {
    // bcrypt hashes start with $2 — store as-is
    return User.create({ name: nm, email: em || undefined, passwordHash: hash });
  }
  if (memory.users.has(nm.toLowerCase())) { const e = new Error("exists"); e.code = 11000; throw e; }
  const u = { _id: String(memory.seq++), id: String(memory.seq - 1), name: nm, username: nm, email: em, password: hash, passwordHash: hash, createdAt: new Date().toISOString() };
  memory.users.set(nm.toLowerCase(), u);
  return u;
}

// ---- CVs ----
async function createCV({ userId, personalInfo = {}, education = "", experience = "", skills = "", projects = "", template = "modern", role = "", generatedText = "" }) {
  if (useMongo) { const c = await CV.create({ userId: String(userId), personalInfo, education, experience, skills, projects, template, role: String(role).slice(0,120), generatedText: String(generatedText).slice(0, 20000) }); return { id: c._id }; }
  const id = memory.seq++;
  const c = { _id: String(id), id, userId: String(userId), personalInfo, education, experience, skills, projects, template, role: String(role).slice(0,120), generatedText: String(generatedText).slice(0, 20000), createdAt: new Date().toISOString() };
  memory.cvs.set(String(id), c);
  return { id };
}
async function listCVs(userId, limit = 20) {
  if (useMongo) return CV.find({ userId: String(userId) }).sort({ createdAt: -1 }).limit(limit);
  return [...memory.cvs.values()].filter(c => c.userId === String(userId)).slice(-limit).reverse();
}
async function getCV(id, userId) {
  if (useMongo) return CV.findOne({ _id: id, userId: String(userId) });
  const c = memory.cvs.get(String(id));
  return c && c.userId === String(userId) ? c : null;
}
// Shareable read-only link: POST /api/cvs/:id/share → {token}; GET /api/share/:token (public)
async function shareCV(id, userId) {
  if (useMongo) {
    const c = await CV.findOne({ _id: id, userId: String(userId) });
    if (!c) return null;
    if (!c.shareToken) { c.shareToken = newToken(); await c.save(); }
    return { token: c.shareToken };
  }
  const c = memory.cvs.get(String(id));
  if (!c || c.userId !== String(userId)) return null;
  if (!c.shareToken) c.shareToken = newToken();
  return { token: c.shareToken };
}
async function getShared(token) {
  if (useMongo) return CV.findOne({ shareToken: String(token) });
  return [...memory.cvs.values()].find(c => c.shareToken === String(token)) || null;
}

// ---- Privacy: revoke share, export everything, delete account ----
async function revokeShare(id, userId) {
  if (useMongo) { const c = await CV.findOneAndUpdate({ _id: id, userId: String(userId) }, { $unset: { shareToken: 1 } }, { new: true }); return !!c; }
  const c = memory.cvs.get(String(id));
  if (!c || c.userId !== String(userId)) return false;
  delete c.shareToken;
  return true;
}
async function exportUserData(userId) {
  const uid = String(userId);
  const user = await findUser(uid) || [...(useMongo ? [] : memory.users.values())].find(u => String(u._id || u.id) === uid);
  const cvs = await listCVs(uid, 100);
  const analyses = await listAnalyses(uid, 100);
  const applications = await listApplications(uid);
  const safeUser = user ? { name: user.name || user.username, email: user.email, createdAt: user.createdAt } : null;
  return { exportedAt: new Date().toISOString(), user: safeUser, cvs, analyses, applications };
}
async function deleteAccount(userId) {
  const uid = String(userId);
  if (useMongo) {
    const u = await User.findOne({ $or: [{ name: uid }, { email: uid }, { _id: uid }] }).catch(() => null);
    const key = u ? u._id : uid;
    await CV.deleteMany({ userId: String(key) });
    await Analysis.deleteMany({ userId: String(key) });
    await Application.deleteMany({ userId: String(key) });
    if (u) await User.deleteOne({ _id: u._id });
    return true;
  }
  for (const [k, c] of [...memory.cvs]) if (c.userId === uid) memory.cvs.delete(k);
  memory.analyses = memory.analyses.filter(a => a.userId !== uid);
  for (const [k, a] of [...memory.applications]) if (a.userId === uid) memory.applications.delete(k);
  for (const [k, u] of [...memory.users]) if (String(u._id || u.id) === uid || (u.name || u.username) === uid) memory.users.delete(k);
  return true;
}
async function createApplication({ userId, title = "", company = "", status = "wishlist", notes = "", remindAt = null }) {
  if (!STATUSES.includes(status)) status = "wishlist";
  if (remindAt) remindAt = String(remindAt).slice(0, 16);
  if (useMongo) { const a = await Application.create({ userId: String(userId), title: String(title).slice(0, 120), company: String(company).slice(0, 120), status, notes: String(notes).slice(0, 2000), remindAt: remindAt || null }); return { id: a._id }; }
  const id = memory.seq++;
  const a = { _id: String(id), id, userId: String(userId), title: String(title).slice(0, 120), company: String(company).slice(0, 120), status, notes: String(notes).slice(0, 2000), remindAt: remindAt || null, createdAt: new Date().toISOString() };
  memory.applications.set(String(id), a);
  return { id };
}
async function listApplications(userId) {
  if (useMongo) return Application.find({ userId: String(userId) }).sort({ createdAt: -1 });
  return [...memory.applications.values()].filter(a => a.userId === String(userId)).reverse();
}
async function updateApplication(id, userId, patch = {}) {
  const allowed = {};
  if (patch.title !== undefined) allowed.title = String(patch.title).slice(0, 120);
  if (patch.company !== undefined) allowed.company = String(patch.company).slice(0, 120);
  if (patch.notes !== undefined) allowed.notes = String(patch.notes).slice(0, 2000);
  if (patch.remindAt !== undefined) allowed.remindAt = patch.remindAt ? String(patch.remindAt).slice(0, 16) : null;
  if (patch.status !== undefined && STATUSES.includes(patch.status)) allowed.status = patch.status;
  if (useMongo) return Application.findOneAndUpdate({ _id: id, userId: String(userId) }, allowed, { new: true });
  const a = memory.applications.get(String(id));
  if (!a || a.userId !== String(userId)) return null;
  Object.assign(a, allowed);
  return a;
}
async function deleteApplication(id, userId) {
  if (useMongo) { const r = await Application.deleteOne({ _id: id, userId: String(userId) }); return r.deletedCount > 0; }
  const a = memory.applications.get(String(id));
  if (!a || a.userId !== String(userId)) return false;
  memory.applications.delete(String(id));
  return true;
}

// ---- Analyses (new shape + legacy compat) ----
async function saveAnalysis({ userId, cvId = null, scoreData = {}, missingKeywords = [], suggestions = [], overall, verdict, cvText = "", jdText = "", resultJson = "" }) {
  if (!Object.keys(scoreData).length && resultJson) { try { scoreData = JSON.parse(resultJson).scores || {}; } catch {} }
  if (useMongo) { const a = await Analysis.create({ userId: String(userId), cvId, scoreData, missingKeywords, suggestions, overall, verdict, cvText: String(cvText).slice(0, 8000), jdText: String(jdText).slice(0, 8000), resultJson: String(resultJson).slice(0, 30000) }); return { id: a._id }; }
  const a = { id: memory.seq++, _id: String(memory.seq - 1), userId: String(userId), cvId, scoreData, missingKeywords, suggestions, overall, verdict, cvText: String(cvText).slice(0, 8000), jdText: String(jdText).slice(0, 8000), resultJson: String(resultJson).slice(0, 30000), createdAt: new Date().toISOString() };
  memory.analyses.push(a);
  return { id: a.id };
}
async function listAnalyses(userId, limit = 20) {
  if (useMongo) return Analysis.find({ userId: String(userId) }).sort({ createdAt: -1 }).limit(limit);
  return memory.analyses.filter(a => a.userId === String(userId)).slice(-limit).reverse();
}

module.exports = { initDB, findUser, createUser, createCV, listCVs, getCV, shareCV, getShared, revokeShare, createApplication, listApplications, updateApplication, deleteApplication, STATUSES, exportUserData, deleteAccount, saveAnalysis, listAnalyses, isMongo: () => useMongo };
