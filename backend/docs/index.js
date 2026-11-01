// Serves the OpenAPI spec + Swagger UI at /api/docs (spec at /api/openapi.json).
// The docs page gets a slightly relaxed CSP (swagger-ui injects an inline bootstrap script);
// the rest of the app keeps the strict policy from middleware/security.js.
const swaggerUi = require("swagger-ui-express");
const openapi = require("./openapi.json");

const DOCS_CSP = [
  "default-src 'self'",
  "img-src 'self' data:",
  "style-src 'self' 'unsafe-inline'",
  "script-src 'self' 'unsafe-inline'",
  "connect-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
].join("; ");

function serveApiDocs(app) {
  app.get("/api/openapi.json", (_req, res) => res.json(openapi));
  app.use(
    "/api/docs",
    (req, res, next) => {
      res.setHeader("Content-Security-Policy", DOCS_CSP);
      next();
    },
    swaggerUi.serve,
    swaggerUi.setup(openapi, { customSiteTitle: "CVForge API Docs" })
  );
}

module.exports = { serveApiDocs };
