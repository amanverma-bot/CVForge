// Environment configuration — loaded once, validated with Zod, fail-fast in production.
// This is the ONLY place process.env is read. Everything else imports `env`.
const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "..", ".env") });
const { z } = require("zod");

const isTest = process.env.NODE_ENV === "test";

const bool = (def) =>
  z.preprocess((v) => (v === undefined || v === "" ? def : ["1", "true", "yes", "on"].includes(String(v).toLowerCase())), z.boolean());

const schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().min(1).max(65535).default(5001),
  JWT_SECRET: z.string().min(1).default("dev-secret"),
  MONGO_URI: z.string().trim().default(""),
  OPENAI_API_KEY: z.string().trim().default(""),
  OPENAI_MODEL: z.string().trim().default("gpt-4o-mini"),
  OPENAI_BASE_URL: z.string().trim().default("https://api.openai.com/v1"),
  FRONTEND_URL: z.string().trim().default(""),
  ADMIN_PASSWORD: z.string().default(""),
  LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"]).default(isTest ? "silent" : "info"),
  TRUST_PROXY: z.string().trim().default("loopback"),
  ALLOW_TUNNEL_ORIGINS: bool(false),
  FORCE_HTTPS: bool(false),
  RATE_LIMIT_ENABLED: bool(!isTest),
});

const parsed = schema.safeParse(process.env);
if (!parsed.success) {
  // eslint-disable-next-line no-console
  console.error("[env] Invalid environment configuration:");
  for (const issue of parsed.error.issues) {
    // eslint-disable-next-line no-console
    console.error(`  - ${issue.path.join(".") || "(root)"}: ${issue.message}`);
  }
  process.exit(1);
}

const env = parsed.data;
env.isProd = env.NODE_ENV === "production";
env.isTest = env.NODE_ENV === "test";

const FATAL = [];

// Never allow a weak secret (or the dev default) in production.
if (env.isProd && (env.JWT_SECRET === "dev-secret" || env.JWT_SECRET.length < 32)) {
  FATAL.push("JWT_SECRET must be a random value of at least 32 chars in production (openssl rand -hex 32)");
}
if (env.isProd && env.MONGO_URI && !/^mongodb(\+srv)?:\/\//.test(env.MONGO_URI)) {
  FATAL.push("MONGO_URI must be a mongodb:// or mongodb+srv:// URI");
}
if (env.ADMIN_PASSWORD && env.ADMIN_PASSWORD.length < 12) {
  FATAL.push("ADMIN_PASSWORD must be at least 12 characters (or unset it to disable admin seeding)");
}
if (FATAL.length) {
  // eslint-disable-next-line no-console
  console.error("[env] Fatal configuration errors:");
  FATAL.forEach((m) => {
    // eslint-disable-next-line no-console
    console.error(`  - ${m}`);
  });
  process.exit(1);
}

// Express `trust proxy`: accept "loopback" / "linklocal" / boolean words, or a hop count.
env.TRUST_PROXY = /^\d+$/.test(env.TRUST_PROXY) ? Number(env.TRUST_PROXY) : env.TRUST_PROXY === "false" ? false : env.TRUST_PROXY;

module.exports = env;
