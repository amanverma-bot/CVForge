// Stateless OAuth 2.0 helpers for Google and GitHub.
// State and short-lived session values are signed JWTs in HttpOnly cookies, so no
// server-side session table is required and no token ever appears in a URL.
const crypto = require("crypto");
const jwt = require("jsonwebtoken");
const env = require("../config/env");
const store = require("../models/store");

const OAUTH_ISSUER = "cvforge:oauth";
const STATE_PURPOSE = "oauth_state";
const SESSION_PURPOSE = "oauth_session";
const STATE_TTL_MS = 10 * 60 * 1000;
const SESSION_TTL_MS = 2 * 60 * 1000;
const STATE_COOKIE_PREFIX = "cvforge_oauth_state_";
const SESSION_COOKIE = "cvforge_oauth_session";

const PROVIDERS = Object.freeze({
  google: {
    label: "Google",
    authorizeUrl: "https://accounts.google.com/o/oauth2/v2/auth",
    tokenUrl: "https://oauth2.googleapis.com/token",
    userInfoUrl: "https://openidconnect.googleapis.com/v1/userinfo",
    callbackPath: "/api/auth/google/callback",
    scope: "openid email profile",
    pkce: true,
  },
  github: {
    label: "GitHub",
    authorizeUrl: "https://github.com/login/oauth/authorize",
    tokenUrl: "https://github.com/login/oauth/access_token",
    userInfoUrl: "https://api.github.com/user",
    emailsUrl: "https://api.github.com/user/emails",
    callbackPath: "/api/auth/github/callback",
    scope: "read:user user:email",
    pkce: false,
  },
});

class OAuthError extends Error {
  constructor(code, message = code, cause) {
    super(message);
    this.name = "OAuthError";
    this.code = code;
    if (cause) this.cause = cause;
  }
}

function providerConfig(provider) {
  const definition = PROVIDERS[provider];
  if (!definition) throw new OAuthError("unsupported_provider", "Unsupported OAuth provider");

  const prefix = provider.toUpperCase();
  const clientId = env[`${prefix}_CLIENT_ID`] || "";
  const clientSecret = env[`${prefix}_CLIENT_SECRET`] || "";
  const callbackUrl = env[`${prefix}_CALLBACK_URL`] || "";

  return {
    ...definition,
    provider,
    clientId,
    clientSecret,
    callbackUrl,
    configured: Boolean(clientId && clientSecret && callbackUrl),
  };
}

function isProviderConfigured(provider) {
  try {
    return providerConfig(provider).configured;
  } catch {
    return false;
  }
}

function base64url(buffer) {
  return buffer.toString("base64url");
}

function createPkcePair() {
  const verifier = base64url(crypto.randomBytes(48));
  const challenge = base64url(crypto.createHash("sha256").update(verifier).digest());
  return { verifier, challenge };
}

function safeEqual(a, b) {
  const left = Buffer.from(String(a));
  const right = Buffer.from(String(b));
  if (left.length !== right.length) return false;
  return crypto.timingSafeEqual(left, right);
}

function isSecureRequest(req) {
  return env.isProd ? true : Boolean(req.secure);
}

function readCookie(req, name) {
  const header = req.headers.cookie;
  if (!header) return null;
  for (const part of String(header).split(";")) {
    const index = part.indexOf("=");
    if (index < 0) continue;
    const key = part.slice(0, index).trim();
    if (key !== name) continue;
    try {
      return decodeURIComponent(part.slice(index + 1).trim());
    } catch {
      return null;
    }
  }
  return null;
}

function stateCookieName(provider) {
  return `${STATE_COOKIE_PREFIX}${provider}`;
}

function cookieOptions(req, maxAge) {
  return {
    httpOnly: true,
    sameSite: "lax",
    secure: isSecureRequest(req),
    path: "/api/auth",
    maxAge,
  };
}

function clearCookieOptions(req) {
  return {
    httpOnly: true,
    sameSite: "lax",
    secure: isSecureRequest(req),
    path: "/api/auth",
  };
}

function clearStateCookie(provider, req, res) {
  res.clearCookie(stateCookieName(provider), clearCookieOptions(req));
}

function clearSessionCookie(req, res) {
  res.clearCookie(SESSION_COOKIE, clearCookieOptions(req));
}

function frontendUrl(path) {
  const configured = String(env.FRONTEND_URL || "").split(",")[0].trim();
  if (!configured) return path;
  try {
    const base = configured.endsWith("/") ? configured : `${configured}/`;
    return new URL(String(path).replace(/^\//, ""), base).toString();
  } catch {
    return path;
  }
}

function noStore(res) {
  res.setHeader("Cache-Control", "no-store");
}

function redirectToFrontend(res, path) {
  noStore(res);
  return res.redirect(302, frontendUrl(path));
}

function redirectOAuthError(provider, req, res, code) {
  const params = new URLSearchParams({ oauth_error: code });
  return redirectToFrontend(res, `/login?${params.toString()}`);
}

function publicErrorCode(err) {
  if (err && err.code === "oauth_account_conflict") return "account_conflict";
  if (!(err instanceof OAuthError)) return "provider_error";
  if (err.code === "cancelled" || err.code === "invalid_state" || err.code === "account_conflict") return err.code;
  if (err.code.endsWith("_not_configured")) return err.code;
  if (err.code === "callback_invalid") return "callback_invalid";
  return "provider_error";
}

function startOAuth(provider, req, res) {
  const config = providerConfig(provider);
  if (!config.configured) {
    throw new OAuthError(`${provider}_not_configured`, `${config.label} OAuth is not configured`);
  }

  let callback;
  try {
    callback = new URL(config.callbackUrl);
  } catch {
    throw new OAuthError("callback_invalid", "OAuth callback URL is not a valid URL");
  }
  if (!["http:", "https:"].includes(callback.protocol)) {
    throw new OAuthError("callback_invalid", "OAuth callback URL must be HTTP(S)");
  }
  if (env.isProd && callback.protocol !== "https:") {
    throw new OAuthError("callback_invalid", "OAuth callback URL must use HTTPS in production");
  }

  const state = base64url(crypto.randomBytes(32));
  const pkce = config.pkce ? createPkcePair() : null;
  const stateToken = jwt.sign(
    {
      purpose: STATE_PURPOSE,
      provider,
      state,
      codeVerifier: pkce ? pkce.verifier : undefined,
    },
    env.JWT_SECRET,
    {
      expiresIn: "10m",
      issuer: OAUTH_ISSUER,
      audience: `oauth_state:${provider}`,
      subject: provider,
    }
  );

  res.cookie(stateCookieName(provider), stateToken, cookieOptions(req, STATE_TTL_MS));

  const authorization = new URL(config.authorizeUrl);
  authorization.searchParams.set("response_type", "code");
  authorization.searchParams.set("client_id", config.clientId);
  authorization.searchParams.set("redirect_uri", config.callbackUrl);
  authorization.searchParams.set("scope", config.scope);
  authorization.searchParams.set("state", state);
  if (pkce) {
    authorization.searchParams.set("code_challenge", pkce.challenge);
    authorization.searchParams.set("code_challenge_method", "S256");
  }
  if (provider === "google") {
    authorization.searchParams.set("access_type", "online");
    authorization.searchParams.set("prompt", "select_account");
  } else if (provider === "github") {
    authorization.searchParams.set("allow_signup", "true");
  }

  noStore(res);
  return res.redirect(302, authorization.toString());
}

function parseCallback(provider, req) {
  const config = providerConfig(provider);
  if (!config.configured) {
    throw new OAuthError(`${provider}_not_configured`, `${config.label} OAuth is not configured`);
  }
  const queryError = typeof req.query.error === "string" ? req.query.error : "";
  if (queryError) {
    throw new OAuthError(queryError === "access_denied" ? "cancelled" : "provider_error");
  }

  const code = typeof req.query.code === "string" ? req.query.code : "";
  const state = typeof req.query.state === "string" ? req.query.state : "";
  if (!code || code.length > 4096 || !state || state.length > 512) {
    throw new OAuthError("invalid_state", "Missing or oversized OAuth callback values");
  }

  const cookie = readCookie(req, stateCookieName(provider));
  if (!cookie) throw new OAuthError("invalid_state", "OAuth state cookie is missing");

  let payload;
  try {
    payload = jwt.verify(cookie, env.JWT_SECRET, {
      issuer: OAUTH_ISSUER,
      audience: `oauth_state:${provider}`,
    });
  } catch (err) {
    throw new OAuthError("invalid_state", "OAuth state is invalid or expired", err);
  }

  if (
    payload.purpose !== STATE_PURPOSE ||
    payload.provider !== provider ||
    !payload.state ||
    !safeEqual(payload.state, state)
  ) {
    throw new OAuthError("invalid_state", "OAuth state did not match");
  }
  if (config.pkce && !payload.codeVerifier) {
    throw new OAuthError("invalid_state", "OAuth PKCE verifier is missing");
  }

  return { config, code, codeVerifier: payload.codeVerifier || "" };
}

async function fetchJson(url, options, errorCode = "provider_error") {
  let response;
  try {
    response = await fetch(url, {
      ...options,
      signal: AbortSignal.timeout(15000),
    });
  } catch (err) {
    throw new OAuthError(errorCode, "OAuth provider request failed", err);
  }

  const text = await response.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = null;
  }

  if (!response.ok) {
    throw new OAuthError(errorCode, `OAuth provider returned HTTP ${response.status}`);
  }
  return data;
}

async function exchangeCode(config, code, codeVerifier) {
  const body = new URLSearchParams({
    client_id: config.clientId,
    client_secret: config.clientSecret,
    code,
    redirect_uri: config.callbackUrl,
  });
  if (config.pkce) {
    body.set("grant_type", "authorization_code");
    body.set("code_verifier", codeVerifier);
  }

  const token = await fetchJson(
    config.tokenUrl,
    {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/x-www-form-urlencoded",
        "User-Agent": "CVForge",
      },
      body: body.toString(),
    },
    "token_exchange_failed"
  );

  if (!token || typeof token.access_token !== "string" || !token.access_token) {
    throw new OAuthError("token_exchange_failed", "OAuth provider did not return an access token");
  }
  return token.access_token;
}

function normalizeEmail(email) {
  if (typeof email !== "string") return null;
  const value = email.trim().toLowerCase();
  if (value.length > 120 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) return null;
  return value;
}

async function googleProfile(accessToken) {
  const profile = await fetchJson(
    PROVIDERS.google.userInfoUrl,
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: "application/json",
        "User-Agent": "CVForge",
      },
    },
    "profile_fetch_failed"
  );

  if (!profile || !profile.sub) {
    throw new OAuthError("profile_fetch_failed", "Google profile is missing a stable subject");
  }
  const emailVerified = profile.email_verified === true || profile.email_verified === "true";
  return {
    providerId: String(profile.sub),
    email: emailVerified ? normalizeEmail(profile.email) : null,
    emailVerified,
    login: profile.email ? String(profile.email).split("@")[0] : "",
    displayName: profile.name || "",
    avatar: profile.picture || null,
  };
}

async function githubProfile(accessToken) {
  const headers = {
    Authorization: `Bearer ${accessToken}`,
    Accept: "application/vnd.github+json",
    "User-Agent": "CVForge",
    "X-GitHub-Api-Version": "2022-11-28",
  };
  const profile = await fetchJson(
    PROVIDERS.github.userInfoUrl,
    { headers },
    "profile_fetch_failed"
  );

  if (!profile || profile.id === undefined || profile.id === null) {
    throw new OAuthError("profile_fetch_failed", "GitHub profile is missing a stable id");
  }

  // GitHub's /user email can be private or unverified. Only a verified address
  // from /user/emails is safe to use for account linking.
  let verifiedEmail = null;
  try {
    const emails = await fetchJson(PROVIDERS.github.emailsUrl, { headers }, "profile_fetch_failed");
    if (Array.isArray(emails)) {
      const selected = emails.find((entry) => entry && entry.primary && entry.verified) ||
        emails.find((entry) => entry && entry.verified);
      if (selected) verifiedEmail = normalizeEmail(selected.email);
    }
  } catch {
    // Scope denial or a transient email lookup failure must not create a
    // linkable identity from an unverified address.
    verifiedEmail = null;
  }

  return {
    providerId: String(profile.id),
    email: verifiedEmail,
    emailVerified: Boolean(verifiedEmail),
    login: profile.login || "",
    displayName: profile.name || profile.login || "",
    avatar: profile.avatar_url || null,
  };
}

function profileForProvider(provider, accessToken) {
  if (provider === "google") return googleProfile(accessToken);
  if (provider === "github") return githubProfile(accessToken);
  throw new OAuthError("unsupported_provider", "Unsupported OAuth provider");
}

function nameBase(profile) {
  const source = profile.login || (profile.email ? profile.email.split("@")[0] : "") || profile.displayName || "user";
  const ascii = String(source)
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9_-]/g, "")
    .toLowerCase()
    .slice(0, 24);
  const withMinimum = ascii.length >= 3 ? ascii : `${ascii || "user"}user`;
  return withMinimum.slice(0, 24);
}

async function availableName(profile) {
  const base = nameBase(profile);
  if (!(await store.findUser(base))) return base;

  for (let attempt = 1; attempt <= 50; attempt += 1) {
    const suffix = attempt <= 20 ? String(attempt) : base64url(crypto.randomBytes(3));
    const candidate = `${base.slice(0, 32 - suffix.length)}${suffix}`;
    if (!(await store.findUser(candidate))) return candidate;
  }
  throw new OAuthError("account_creation_failed", "Could not find a unique account name");
}

async function linkExisting(user, profile, provider) {
  const linked = await store.linkOAuthAccount(user.id, {
    provider,
    providerId: profile.providerId,
    avatar: profile.avatar,
  });
  if (!linked) throw new OAuthError("account_creation_failed", "OAuth account could not be linked");
  return { user: linked, created: false, linked: true };
}

async function resolveUser(provider, profile) {
  const existingProviderUser = await store.findUserByProvider(provider, profile.providerId);
  if (existingProviderUser) {
    const user = await store.linkOAuthAccount(existingProviderUser.id, {
      provider,
      providerId: profile.providerId,
      avatar: profile.avatar,
    });
    return { user: user || existingProviderUser, created: false, linked: false };
  }

  if (profile.email && profile.emailVerified) {
    const existingEmailUser = await store.findUserByEmail(profile.email);
    if (existingEmailUser) return linkExisting(existingEmailUser, profile, provider);
  }

  let lastError;
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const name = await availableName(profile);
    try {
      const user = await store.createOAuthUser({
        name,
        email: profile.email,
        provider,
        providerId: profile.providerId,
        avatar: profile.avatar,
      });
      return { user, created: true, linked: false };
    } catch (err) {
      lastError = err;
      if (err.code !== 11000) throw err;

      const racedProvider = await store.findUserByProvider(provider, profile.providerId);
      if (racedProvider) return { user: racedProvider, created: false, linked: false };

      if (profile.email && profile.emailVerified) {
        const racedEmail = await store.findUserByEmail(profile.email);
        if (racedEmail) return linkExisting(racedEmail, profile, provider);
      }
    }
  }

  throw new OAuthError("account_creation_failed", "Could not create a unique OAuth account name", lastError);
}

async function completeOAuth(provider, req) {
  const { config, code, codeVerifier } = parseCallback(provider, req);
  const accessToken = await exchangeCode(config, code, codeVerifier);
  const profile = await profileForProvider(provider, accessToken);
  return resolveUser(provider, profile);
}

function setSessionCookie(userId, provider, req, res) {
  const token = jwt.sign(
    { purpose: SESSION_PURPOSE, uid: userId, provider },
    env.JWT_SECRET,
    {
      expiresIn: "2m",
      issuer: OAUTH_ISSUER,
      audience: "oauth_session",
      subject: String(userId),
    }
  );
  res.cookie(SESSION_COOKIE, token, cookieOptions(req, SESSION_TTL_MS));
}

function verifySessionCookie(req) {
  const token = readCookie(req, SESSION_COOKIE);
  if (!token) throw new OAuthError("session_expired", "OAuth session cookie is missing");
  let payload;
  try {
    payload = jwt.verify(token, env.JWT_SECRET, {
      issuer: OAUTH_ISSUER,
      audience: "oauth_session",
    });
  } catch (err) {
    throw new OAuthError("session_expired", "OAuth session is invalid or expired", err);
  }
  if (payload.purpose !== SESSION_PURPOSE || !payload.uid) {
    throw new OAuthError("session_expired", "OAuth session is invalid");
  }
  return payload;
}

function normalizeOrigin(value) {
  try {
    return new URL(String(value)).origin;
  } catch {
    return null;
  }
}

// The session-exchange POST is the only step that turns a short-lived OAuth
// cookie into a JWT. Require a browser Origin that is either this API's own
// origin or an explicitly configured frontend origin. Requests without an
// Origin header (non-browser clients) remain supported by the signed cookie.
function assertTrustedOrigin(req) {
  const header = req.headers.origin;
  if (!header) return;

  const origin = normalizeOrigin(header);
  if (!origin) throw new OAuthError("invalid_origin", "OAuth session origin is invalid");

  const proto = String(req.headers["x-forwarded-proto"] || req.protocol || "")
    .split(",")[0]
    .trim()
    .toLowerCase();
  const host = String(req.headers["x-forwarded-host"] || req.headers.host || "")
    .split(",")[0]
    .trim();

  const allowed = new Set();
  if (host && (proto === "http" || proto === "https")) allowed.add(`${proto}://${host}`);
  for (const value of String(env.FRONTEND_URL || "").split(",")) {
    const configured = normalizeOrigin(value.trim());
    if (configured) allowed.add(configured);
  }

  if (!allowed.has(origin)) {
    throw new OAuthError("invalid_origin", "OAuth session origin is not allowed");
  }
}

module.exports = {
  OAuthError,
  PROVIDERS,
  isProviderConfigured,
  providerConfig,
  startOAuth,
  completeOAuth,
  clearStateCookie,
  clearSessionCookie,
  setSessionCookie,
  verifySessionCookie,
  assertTrustedOrigin,
  redirectOAuthError,
  redirectToFrontend,
  publicErrorCode,
  stateCookieName,
  SESSION_COOKIE,
  STATE_TTL_MS,
  SESSION_TTL_MS,
};
