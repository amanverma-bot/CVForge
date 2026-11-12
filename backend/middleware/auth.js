// ── Authentication Middleware ──────────────────────────────────────────────
// JWT verification with bcrypt password hashing support.
const jwt = require("jsonwebtoken");
const env = require("../config/env");
const store = require("../models/store");

const JWT_SECRET = env.JWT_SECRET;
const JWT_EXPIRY = "7d";
const ISSUER = "cvforge";

function signToken(user) {
  return jwt.sign(
    {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      ver: Number(user.tokenVersion || 0),
    },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRY, issuer: ISSUER, subject: user.id }
  );
}

function publicUser(user) {
  if (!user) return null;
  return {
    id: user.id,
    name: user.name,
    username: user.name,
    email: user.email || null,
    avatar: user.avatar || null,
    role: user.role || "free",
    createdAt: user.createdAt,
  };
}

function authResponse(user) {
  return {
    token: signToken(user),
    username: user.name,
    name: user.name,
    user: publicUser(user),
  };
}

function verifyToken(token) {
  return jwt.verify(token, JWT_SECRET, { issuer: ISSUER });
}

async function requireAuth(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    const err = new Error("Authentication required");
    err.statusCode = 401;
    return next(err);
  }

  const token = authHeader.slice(7);
  let decoded;
  try {
    decoded = verifyToken(token);
  } catch {
    const authErr = new Error("Invalid or expired token");
    authErr.statusCode = 401;
    return next(authErr);
  }

  let user;
  try {
    user = await store.getUserById(decoded.sub || decoded.id);
  } catch (err) {
    return next(err);
  }
  if (!user) {
    const err = new Error("Account no longer exists");
    err.statusCode = 401;
    return next(err);
  }
  if (Number(decoded.ver || 0) !== Number(user.tokenVersion || 0)) {
    const err = new Error("Session has been signed out");
    err.statusCode = 401;
    return next(err);
  }

  req.user = publicUser(user);
  next();
}

async function optionalAuth(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return next();
  }
  const token = authHeader.slice(7);
  try {
    const decoded = verifyToken(token);
    const user = await store.getUserById(decoded.sub || decoded.id);
    if (user && Number(decoded.ver || 0) === Number(user.tokenVersion || 0)) {
      req.user = publicUser(user);
    }
  } catch {
    // Ignore invalid, expired, revoked, or deleted-account tokens in optional mode.
  }
  next();
}

module.exports = { signToken, verifyToken, requireAuth, optionalAuth, publicUser, authResponse, JWT_SECRET, JWT_EXPIRY, ISSUER };