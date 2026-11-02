// Express app factory — the testable half of the server (server.js only listens).
// Middleware order matters: logging → security → CORS → HTTPS → body → rate limits → routes → static → 404 → errors.
const express = require("express");
const path = require("path");
const fs = require("fs");
const pinoHttp = require("pino-http");
const env = require("./config/env");
const { logger } = require("./lib/logger");
const { securityHeaders, buildCors, httpsRedirect, configureCors } = require("./middleware/security");
const { globalLimiter } = require("./middleware/rateLimit");
const { notFoundHandler, errorHandler } = require("./middleware/error");
const { serveApiDocs } = require("./docs");

const app = express();

// Populate the CORS allow-list from the environment (FRONTEND_URL + tunnel opt-in).
configureCors(env);

app.disable("x-powered-by");
app.set("trust proxy", env.TRUST_PROXY);

// Structured request logging (health checks stay quiet).
app.use(
  pinoHttp({
    logger,
    autoLogging: { ignore: (req) => req.url === "/api/health" },
    customLogLevel: (req, res, err) => (err || res.statusCode >= 500 ? "error" : res.statusCode >= 400 ? "warn" : "info"),
  })
);

app.use(securityHeaders());
app.use(buildCors());
app.use(httpsRedirect);
app.use(express.json({ limit: "1mb" }));

// Rate limiting on the whole API surface (fine-grained limits live inside routes).
app.use("/api", globalLimiter);

// ---------- API routes ----------
app.use("/api/auth", require("./routes/auth"));
app.use("/api/applications", require("./routes/applications"));
app.use("/api", require("./routes/cvs"));
app.use("/api", require("./routes/ai"));
app.use("/api", require("./routes/misc"));

// ---------- API documentation (Swagger UI at /api/docs, spec at /api/openapi.json) ----------
serveApiDocs(app);

// ---------- Single-origin frontend (LIVE ONLY in production builds) ----------
// Hashed assets (JS/CSS) are immutable → cache 1y. index.html must NEVER cache:
// a stale copy would point at hashed files that no longer exist.
const DIST = path.join(__dirname, "..", "frontend", "dist");
try {
  if (fs.existsSync(path.join(DIST, "index.html"))) {
    app.use(
      express.static(DIST, {
        maxAge: "1y",
        immutable: true,
        setHeaders: (res, p) => {
          if (p.endsWith("index.html")) res.setHeader("Cache-Control", "no-store");
        },
      })
    );
    app.use((req, res, next) => {
      if (req.path.startsWith("/api/")) return next();
      res.setHeader("Cache-Control", "no-store");
      res.sendFile(path.join(DIST, "index.html"));
    });
    logger.info({ dist: DIST }, "Serving frontend build");
  } else {
    logger.info("frontend/dist missing — API-only mode (run `npm run build` in frontend)");
  }
} catch (e) {
  logger.warn({ err: e }, "Static serving setup failed");
}

// ---------- 404 + centralized error handling (always JSON) ----------
app.use(notFoundHandler);
app.use(errorHandler);

module.exports = app;
