// ── Rate Limiting ──────────────────────────────────────────────────────────
// In-memory rate limiter with separate buckets for auth, AI, upload, export.
const rateLimit = require("express-rate-limit");

const stores = new Map();

function getStore(name) {
  if (!stores.has(name)) {
    stores.set(name, new Map());
  }
  return stores.get(name);
}

function cleanup(store) {
  const now = Date.now();
  for (const [key, val] of store.entries()) {
    if (val.resetTime < now) store.delete(key);
  }
}

function keyGenerator(req) {
  return req.ip || req.connection.remoteAddress || "unknown";
}

function createLimiter(options = {}) {
  const {
    windowMs = 60 * 1000,
    max = 100,
    message = "Too many requests, please try again later.",
    skipFailedRequests = false,
    keyByUser = false,
  } = options;
  const store = getStore(options.name || "default");

  return (req, res, next) => {
    if (process.env.RATE_LIMIT_ENABLED === "false") {
      return next();
    }

    // Per-user buckets when the limiter runs after requireAuth and opts in;
    // anonymous/IP-based otherwise.
    const key = keyByUser && req.user?.id ? `u:${req.user.id}` : keyGenerator(req);
    const now = Date.now();
    cleanup(store);

    let record = store.get(key);
    if (!record || record.resetTime < now) {
      record = { count: 0, resetTime: now + windowMs };
      store.set(key, record);
    }

    record.count++;
    const remaining = Math.max(0, max - record.count);

    res.setHeader("X-RateLimit-Limit", max);
    res.setHeader("X-RateLimit-Remaining", remaining);
    res.setHeader("X-RateLimit-Reset", Math.ceil(record.resetTime / 1000));

    if (record.count > max) {
      return res.status(429).json({ error: message });
    }

    next();
  };
}

const globalLimiter = createLimiter({
  name: "global",
  windowMs: 60 * 1000,
  max: 300,
  message: "API rate limit exceeded",
});

const authLimiter = createLimiter({
  name: "auth",
  windowMs: 60 * 1000,
  max: 10,
  message: "Too many auth attempts, please try again later",
});

const aiLimiter = createLimiter({
  name: "ai",
  windowMs: 60 * 1000,
  max: 20,
  message: "AI request rate limit exceeded",
});

const uploadLimiter = createLimiter({
  name: "upload",
  windowMs: 60 * 1000,
  max: 30,
  message: "Upload rate limit exceeded",
});

const exportLimiter = createLimiter({
  name: "export",
  windowMs: 60 * 1000,
  max: 10,
  message: "Export rate limit exceeded",
});

const shareLimiter = createLimiter({
  name: "share",
  windowMs: 60 * 1000,
  max: 30,
  message: "Share link rate limit exceeded",
});

// Gemini features are free-tier sensitive: 10 requests/minute per user.
const geminiLimiter = createLimiter({
  name: "gemini",
  windowMs: 60 * 1000,
  max: 10,
  keyByUser: true,
  message: "Gemini AI rate limit exceeded — max 10 requests per minute",
});

module.exports = {
  globalLimiter,
  authLimiter,
  aiLimiter,
  uploadLimiter,
  exportLimiter,
  shareLimiter,
  geminiLimiter,
  createLimiter,
};