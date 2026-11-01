// ── Logger ─────────────────────────────────────────────────────────────────
// Structured JSON logging with pino. Logs to stdout; safe for containers.
const pino = require("pino");

let prettyTransport;
try {
  prettyTransport = require("pino-pretty");
} catch {
  prettyTransport = null;
}

const isProd = process.env.NODE_ENV === "production";
const isTest = process.env.NODE_ENV === "test";

const logger = pino({
  level: process.env.LOG_LEVEL || (isTest ? "silent" : isProd ? "info" : "debug"),
  transport:
    isTest || isProd || !prettyTransport
      ? undefined
      : {
          target: "pino-pretty",
          options: { colorize: true, translateTime: "HH:MM:ss", ignore: "pid,hostname" },
        },
  redact: ["req.headers.authorization", "res.headers.set-cookie"],
  serializers: {
    req: (req) => ({
      method: req.method,
      url: req.url,
      ip: req.ip,
      headers: req.headers,
    }),
    res: (res) => ({
      statusCode: res.statusCode,
      headers: res.headers,
    }),
  },
});

module.exports = { logger };