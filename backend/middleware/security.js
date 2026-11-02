// ── Security Middleware ────────────────────────────────────────────────────
// Helmet headers, CORS allow-list, HTTPS redirect.
const helmet = require("helmet");

const ALLOWED_ORIGINS = new Set();
function addOrigin(origin) {
  if (origin) ALLOWED_ORIGINS.add(origin);
}

function securityHeaders() {
  return helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
        fontSrc: ["'self'", "https://fonts.gstatic.com"],
        imgSrc: ["'self'", "data:", "https:"],
        connectSrc: ["'self'"],
        scriptSrc: ["'self'"],
        objectSrc: ["'none'"],
        baseUri: ["'self'"],
        frameAncestors: ["'none'"],
      },
    },
    crossOriginEmbedderPolicy: false,
    hsts: {
      maxAge: 31536000,
      includeSubDomains: true,
      preload: true,
    },
    referrerPolicy: { policy: "strict-origin-when-cross-origin" },
    frameguard: { action: "deny" },
  });
}

// Public tunnel providers used for demos (dynamic subdomains can't be allow-listed).
const TUNNEL_SUFFIXES = ["ngrok-free.dev", "ngrok-free.app", "ngrok.app", "ngrok.io", "trycloudflare.com"];

function isTunnelOrigin(origin) {
  if (!origin) return false;
  try {
    const u = new URL(origin);
    if (u.protocol !== "https:") return false;
    return TUNNEL_SUFFIXES.some((s) => u.hostname === s || u.hostname.endsWith(`.${s}`));
  } catch {
    return false;
  }
}

function buildCors() {
  return (req, res, next) => {
    const origin = req.headers.origin;
    const host = req.headers.host;
    const forwardedHost = String(req.headers["x-forwarded-host"] || "")
      .split(",")[0]
      .trim();
    const sameOrigin =
      origin &&
      ((host && (origin === `http://${host}` || origin === `https://${host}`)) ||
        (forwardedHost && (origin === `http://${forwardedHost}` || origin === `https://${forwardedHost}`)));
    const tunnelAllowed = process.env.ALLOW_TUNNEL_ORIGINS === "true" && isTunnelOrigin(origin);
    const isAllowed = !origin || ALLOWED_ORIGINS.has(origin) || origin === "null" || sameOrigin || tunnelAllowed;

    if (!isAllowed) {
      return res.status(403).json({ error: "Origin not allowed" });
    }

    if (origin) {
      res.header("Access-Control-Allow-Origin", origin);
    }
    res.header("Access-Control-Allow-Credentials", "true");
    res.header(
      "Access-Control-Allow-Headers",
      "Origin, X-Requested-With, Content-Type, Accept, Authorization"
    );
    res.header("Access-Control-Allow-Methods", "GET, POST, PUT, PATCH, DELETE, OPTIONS");

    if (req.method === "OPTIONS") {
      return res.status(204).end();
    }
    next();
  };
}

function httpsRedirect(req, res, next) {
  if (process.env.FORCE_HTTPS === "true" && req.header("x-forwarded-proto") !== "https") {
    const code = req.method === "GET" || req.method === "HEAD" ? 301 : 308;
    return res.redirect(code, `https://${req.header("host")}${req.url}`);
  }
  next();
}

function configureCors(env) {
  const frontend = env.FRONTEND_URL || "";
  if (frontend) addOrigin(frontend.trim());
}

module.exports = { securityHeaders, buildCors, httpsRedirect, configureCors, addOrigin, ALLOWED_ORIGINS };