// Account resolution for verified Firebase Google identities.
// A Firebase UID is kept separate from legacy Google OAuth IDs. Existing
// accounts are linked only through a verified email address; conflicts are
// rejected instead of merging accounts.
const crypto = require("crypto");
const store = require("../models/store");

class FirebaseLinkError extends Error {
  constructor(code, message = code, cause) {
    super(message);
    this.name = "FirebaseLinkError";
    this.code = code;
    if (cause) this.cause = cause;
  }
}

function normalizeVerifiedEmail(decoded) {
  if (decoded?.email_verified !== true || typeof decoded.email !== "string") return null;
  const email = decoded.email.trim().toLowerCase();
  if (email.length < 3 || email.length > 120) return null;
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return null;
  return email;
}

function avatarFrom(decoded) {
  return typeof decoded?.picture === "string" ? decoded.picture.slice(0, 500) : null;
}

function nameBase(decoded) {
  const source = decoded?.name || (typeof decoded?.email === "string" ? decoded.email.split("@")[0] : "") || "user";
  const ascii = String(source)
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9_-]/g, "")
    .toLowerCase()
    .slice(0, 24);
  const withMinimum = ascii.length >= 3 ? ascii : `${ascii || "user"}user`;
  return withMinimum.slice(0, 24);
}

async function availableName(decoded) {
  const base = nameBase(decoded);
  if (!(await store.findUser(base))) return base;

  for (let attempt = 1; attempt <= 50; attempt += 1) {
    const suffix = attempt <= 20 ? String(attempt) : crypto.randomBytes(3).toString("base64url");
    const candidate = `${base.slice(0, 32 - suffix.length)}${suffix}`;
    if (!(await store.findUser(candidate))) return candidate;
  }
  throw new FirebaseLinkError("account_creation_failed", "Could not find a unique account name");
}

async function linkExisting(user, decoded) {
  try {
    const linked = await store.linkOAuthAccount(user.id, {
      provider: "firebase",
      providerId: decoded.uid,
      avatar: avatarFrom(decoded),
    });
    if (!linked) throw new FirebaseLinkError("account_creation_failed", "Firebase account could not be linked");
    return { user: linked, created: false, linked: true };
  } catch (err) {
    if (err.code === "oauth_account_conflict") {
      throw new FirebaseLinkError("account_conflict", "Account is already linked to another sign-in method", err);
    }
    throw err;
  }
}

async function resolveUser(decoded) {
  const email = normalizeVerifiedEmail(decoded);
  const avatar = avatarFrom(decoded);

  const existingProviderUser = await store.findUserByProvider("firebase", decoded.uid);
  if (existingProviderUser) {
    try {
      const user = await store.linkOAuthAccount(existingProviderUser.id, {
        provider: "firebase",
        providerId: decoded.uid,
        avatar,
      });
      return { user: user || existingProviderUser, created: false, linked: false };
    } catch (err) {
      if (err.code === "oauth_account_conflict") {
        throw new FirebaseLinkError("account_conflict", "Account is already linked to another sign-in method", err);
      }
      throw err;
    }
  }

  if (email) {
    const existingEmailUser = await store.findUserByEmail(email);
    if (existingEmailUser) return linkExisting(existingEmailUser, decoded);
  }

  let lastError;
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const name = await availableName(decoded);
    try {
      const user = await store.createOAuthUser({
        name,
        email: email || undefined,
        provider: "firebase",
        providerId: decoded.uid,
        avatar,
      });
      return { user, created: true, linked: false };
    } catch (err) {
      lastError = err;
      if (err.code !== 11000) throw err;

      const racedProvider = await store.findUserByProvider("firebase", decoded.uid);
      if (racedProvider) return { user: racedProvider, created: false, linked: false };

      if (email) {
        const racedEmail = await store.findUserByEmail(email);
        if (racedEmail) return linkExisting(racedEmail, decoded);
      }
    }
  }

  throw new FirebaseLinkError("account_creation_failed", "Could not create a unique account", lastError);
}

module.exports = {
  FirebaseLinkError,
  normalizeVerifiedEmail,
  nameBase,
  resolveUser,
};
