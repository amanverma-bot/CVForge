// ── Audit Middleware ───────────────────────────────────────────────────────
// Logs security-relevant events for audit trail.

function auditEvent(action, req, meta = {}) {
  const entry = {
    timestamp: new Date().toISOString(),
    action,
    ip: req.ip || req.connection.remoteAddress || "unknown",
    userAgent: req.headers["user-agent"] || "unknown",
    path: req.path,
    method: req.method,
    userId: req.user?.id || null,
    ...meta,
  };

  // In production, this would be written to a secure audit log
  // For now, log via pino at warn level for security events
  const { logger } = require("../lib/logger");
  logger.warn({ audit: entry }, `AUDIT: ${action}`);
}

module.exports = { auditEvent };