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

function buildCors() {
  return (req, res, next) => {
    const origin = req.headers.origin;
    const isAllowed = !origin || ALLOWED_ORIGINS.has(origin) || origin === "null";

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
    return res.redirect(301, `https://${req.header("host")}${req.url}`);
  }
  next();
}

function configureCors(env) {
  const frontend = env.FRONTEND_URL || "";
  const additional = env.ALLOW_TUNNEL_ORIGINS === "true" ? [".trycloudflare.com"] : [];
  [frontend, ...additional].forEach((o) => {
    if (o) addOrigin(o.trim());
  });
}

module.exports = { securityHeaders, buildCors, httpsRedirect, configureCors, addOrigin, ALLOWED_ORIGINS };