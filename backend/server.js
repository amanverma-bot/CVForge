// ── Server Entry Point ─────────────────────────────────────────────────────
// Creates the Express app, connects to MongoDB, and starts listening.
require("dotenv").config({ path: require("path").join(__dirname, ".env") });

const env = require("./config/env");
const { logger } = require("./lib/logger");
const app = require("./app");
const { connect, isMongo: isMongoConnected, storage } = require("./models/store");

const PORT = env.PORT;

async function start() {
  // Connect to MongoDB. With no URI — or REQUIRE_MONGO=false and an
  // unreachable URI — the file-backed local store is used (persists across
  // restarts); REQUIRE_MONGO=true fails fast instead of falling back.
  await connect(env.MONGO_URI);

  const server = app.listen(PORT, "0.0.0.0", () => {
    logger.info({ port: PORT, env: env.NODE_ENV, mongo: isMongoConnected(), storage: storage() }, "CVForge server started");
    console.log(`CVForge backend running on http://0.0.0.0:${PORT}`);
    console.log(`Environment: ${env.NODE_ENV}`);
    console.log(
      `Database: ${isMongoConnected() ? "MongoDB" : storage() === "file" ? "file-backed store (persists across restarts)" : "in-memory (demo)"}`
    );
  });

  process.on("unhandledRejection", (err) => {
    logger.error({ err }, "Unhandled rejection");
    console.error("Unhandled rejection:", err);
  });

  process.on("uncaughtException", (err) => {
    logger.fatal({ err }, "Uncaught exception");
    console.error("Uncaught exception:", err);
    process.exit(1);
  });

  return server;
}

start().catch((err) => {
  logger.fatal({ err }, "Failed to start server");
  console.error("Failed to start server:", err);
  process.exit(1);
});

module.exports = app;