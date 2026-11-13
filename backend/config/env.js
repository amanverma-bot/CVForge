// Environment configuration — loaded once, validated with Zod, fail-fast in production.
// This is the ONLY place process.env is read. Everything else imports `env`.
const fs = require("fs");
const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "..", ".env") });

const REALPATH_ERROR = "FIREBASE_SERVICE_ACCOUNT_PATH must point to an existing readable file";
const { z } = require("zod");

const isTest = process.env.NODE_ENV === "test";
const FIREBASE_PROJECT_ID = "cvforge-ca97c";

const bool = (def) =>
  z.preprocess((v) => (v === undefined || v === "" ? def : ["1", "true", "yes", "on"].includes(String(v).toLowerCase())), z.boolean());

const schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().min(1).max(65535).default(5001),
  JWT_SECRET: z.string().min(1).default("dev-secret"),
  MONGO_URI: z.string().trim().default(""),
  REQUIRE_MONGO: bool(false),
  OPENAI_API_KEY: z.string().trim().default(""),
  OPENAI_MODEL: z.string().trim().default("gpt-4o-mini"),
  OPENAI_BASE_URL: z.string().trim().default("https://api.openai.com/v1"),
  LOCAL_LLM_ENABLED: bool(true),
  LOCAL_LLM_BASE_URL: z.string().trim().default("http://127.0.0.1:11434/v1"),
  LOCAL_LLM_MODEL: z.string().trim().default("llama3.2"),
  LOCAL_LLM_API_KEY: z.string().trim().default(""),
  LLM_TIMEOUT_MS: z.coerce.number().int().min(1000).max(120000).default(30000),
  LOCAL_LLM_TIMEOUT_MS: z.coerce.number().int().min(1000).max(300000).default(60000),
  LLM_HEALTH_TIMEOUT_MS: z.coerce.number().int().min(250).max(30000).default(30000),
  LLM_HEALTH_CACHE_MS: z.coerce.number().int().min(0).max(300000).default(30000),
  GEMINI_API_KEY: z.string().trim().default(""),
  GEMINI_MODEL: z.string().trim().default("gemini-3.8-flash"),
  GEMINI_FALLBACK_MODEL: z.string().trim().default("gemini-3.5-flash-lite"),
  GEMINI_TIMEOUT_MS: z.coerce.number().int().min(1000).max(120000).default(30000),
  GEMINI_BASE_URL: z.string().trim().default(""),
  GEMINI_ENABLED: bool(true),
  GEMINI_MAX_OUTPUT_TOKENS: z.coerce.number().int().min(256).max(8192).default(2048),
  FRONTEND_URL: z.string().trim().default(""),
  GOOGLE_CLIENT_ID: z.string().trim().default(""),
  GOOGLE_CLIENT_SECRET: z.string().trim().default(""),
  GOOGLE_CALLBACK_URL: z.string().trim().default(""),
  GITHUB_CLIENT_ID: z.string().trim().default(""),
  GITHUB_CLIENT_SECRET: z.string().trim().default(""),
  GITHUB_CALLBACK_URL: z.string().trim().default(""),
  FIREBASE_PROJECT_ID: z.string().trim().default(""),
  FIREBASE_SERVICE_ACCOUNT_PATH: z.string().trim().default(""),
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
if (
  env.isProd &&
  (env.JWT_SECRET.length < 32 ||
    env.JWT_SECRET === "dev-secret" ||
    env.JWT_SECRET.startsWith("change-me") ||
    env.JWT_SECRET.startsWith("replace-with"))
) {
  FATAL.push("JWT_SECRET must be a random value of at least 32 chars in production (openssl rand -hex 32)");
}
if (env.isProd && env.MONGO_URI && !/^mongodb(\+srv)?:\/\//.test(env.MONGO_URI)) {
  FATAL.push("MONGO_URI must be a mongodb:// or mongodb+srv:// URI");
}
if (env.ADMIN_PASSWORD && env.ADMIN_PASSWORD.length < 12) {
  FATAL.push("ADMIN_PASSWORD must be at least 12 characters (or unset it to disable admin seeding)");
}

// Frontend/CORS origins: comma-separated absolute http(s) URLs. The first entry is
// also the post-OAuth redirect target, so it must be the canonical app origin.
let frontendOrigin = null;
if (env.FRONTEND_URL) {
  const first = env.FRONTEND_URL.split(",")[0].trim();
  try {
    const url = new URL(first);
    if (!["http:", "https:"].includes(url.protocol)) throw new Error("bad protocol");
    frontendOrigin = url.origin;
  } catch {
    FATAL.push("FRONTEND_URL must contain absolute http(s) URLs");
  }
}

// OAuth configuration is optional. Empty credentials mean the provider is
// simply disabled; callback URLs may be staged in advance. Once credentials
// are present, require the complete set so sign-in cannot fail mid-flow.
for (const [label, prefix] of [
  ["Google", "GOOGLE"],
  ["GitHub", "GITHUB"],
]) {
  const credentialKeys = [`${prefix}_CLIENT_ID`, `${prefix}_CLIENT_SECRET`];
  const callbackKey = `${prefix}_CALLBACK_URL`;
  const presentCredentials = credentialKeys.filter((key) => env[key]);
  if (presentCredentials.length === 0) {
    if (env[callbackKey]) {
      try {
        const staged = new URL(env[callbackKey]);
        if (!["http:", "https:"].includes(staged.protocol)) {
          FATAL.push(`${callbackKey} must use HTTP(S)`);
        }
      } catch {
        FATAL.push(`${callbackKey} must be an absolute URL`);
      }
    }
    continue;
  }
  if (presentCredentials.length < credentialKeys.length) {
    FATAL.push(`${label} OAuth is partially configured — set ${credentialKeys.join(", ")} together`);
    continue;
  }
  if (!env[callbackKey]) {
    FATAL.push(`${label} OAuth is enabled but ${callbackKey} is missing`);
    continue;
  }

  let callback;
  try {
    callback = new URL(env[`${prefix}_CALLBACK_URL`]);
  } catch {
    FATAL.push(`${prefix}_CALLBACK_URL must be an absolute URL`);
    continue;
  }
  if (!["http:", "https:"].includes(callback.protocol)) {
    FATAL.push(`${prefix}_CALLBACK_URL must use HTTP(S)`);
  } else if (env.isProd) {
    if (callback.protocol !== "https:") {
      FATAL.push(`${prefix}_CALLBACK_URL must use HTTPS in production`);
    }
    if (!frontendOrigin) {
      FATAL.push(`FRONTEND_URL must be set to the public HTTPS origin when ${label} OAuth is enabled in production`);
    } else if (callback.origin !== frontendOrigin) {
      // Same-origin keeps OAuth cookies first-party and makes the session
      // exchange CSRF-safe without weakening SameSite.
      FATAL.push(`${label} OAuth callback and FRONTEND_URL must share the same public origin in production`);
    }
  }
}

// Firebase Google sign-in is optional. If either key is present, the full,
// exact project configuration is required and the Admin key must live outside
// this repository with no group/world permissions.
if (env.FIREBASE_PROJECT_ID || env.FIREBASE_SERVICE_ACCOUNT_PATH) {
  if (!env.FIREBASE_PROJECT_ID || !env.FIREBASE_SERVICE_ACCOUNT_PATH) {
    FATAL.push("Firebase Auth requires FIREBASE_PROJECT_ID and FIREBASE_SERVICE_ACCOUNT_PATH together");
  } else if (env.FIREBASE_PROJECT_ID !== FIREBASE_PROJECT_ID) {
    FATAL.push(`FIREBASE_PROJECT_ID must be ${FIREBASE_PROJECT_ID}`);
  } else if (!path.isAbsolute(env.FIREBASE_SERVICE_ACCOUNT_PATH)) {
    FATAL.push("FIREBASE_SERVICE_ACCOUNT_PATH must be an absolute path outside this repository");
    } else {
      const userPath = env.FIREBASE_SERVICE_ACCOUNT_PATH;
      const repoRoot = path.resolve(__dirname, "..", "..");
      const directKeyPath = path.resolve(userPath);

      const directRelative = path.relative(repoRoot, directKeyPath);
      const directInsideRepo =
        directRelative && !directRelative.startsWith("..") && !path.isAbsolute(directRelative);
      if (directKeyPath === repoRoot || directInsideRepo) {
        FATAL.push("FIREBASE_SERVICE_ACCOUNT_PATH must be outside this repository");
      } else {
        let resolvedKeyPath;
        try {
          resolvedKeyPath = fs.realpathSync(userPath);
        } catch {
          FATAL.push(REALPATH_ERROR);
        }

        if (resolvedKeyPath) {
          const resolvedRepoRoot = fs.realpathSync(repoRoot);
          const resolvedRelative = path.relative(resolvedRepoRoot, resolvedKeyPath);
          const resolvedInsideRepo =
            resolvedRelative && !resolvedRelative.startsWith("..") && !path.isAbsolute(resolvedRelative);
          if (resolvedKeyPath === resolvedRepoRoot || resolvedInsideRepo) {
            FATAL.push("FIREBASE_SERVICE_ACCOUNT_PATH must be outside this repository");
          } else {
            try {
              fs.accessSync(resolvedKeyPath, fs.constants.R_OK);
              const stat = fs.statSync(resolvedKeyPath);
              if (!stat.isFile()) {
                FATAL.push("FIREBASE_SERVICE_ACCOUNT_PATH must point to a regular file");
              } else if ((stat.mode & 0o077) !== 0) {
                FATAL.push("FIREBASE_SERVICE_ACCOUNT_PATH must not be group/world readable (chmod 600)");
              } else {
                env.FIREBASE_SERVICE_ACCOUNT_PATH = resolvedKeyPath;
              }
            } catch {
              FATAL.push(REALPATH_ERROR);
            }
          }
        }
      }
    }
}

if (FATAL.length) {
  console.error("[env] Fatal configuration errors:");
  FATAL.forEach((m) => {
    console.error(`  - ${m}`);
  });
  process.exit(1);
}

// Express `trust proxy`: accept "loopback" / "linklocal" / boolean words, or a hop count.
env.TRUST_PROXY = /^\d+$/.test(env.TRUST_PROXY) ? Number(env.TRUST_PROXY) : env.TRUST_PROXY === "false" ? false : env.TRUST_PROXY;

module.exports = env;
