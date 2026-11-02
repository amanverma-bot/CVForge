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
    { id: user.id, name: user.name, email: user.email, role: user.role },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRY, issuer: ISSUER, subject: user.id }
  );
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

  req.user = {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role || "free",
    createdAt: user.createdAt,
  };
  next();
}

function optionalAuth(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return next();
  }
  const token = authHeader.slice(7);
  try {
    const decoded = verifyToken(token);
    req.user = {
      id: decoded.sub || decoded.id,
      name: decoded.name,
      email: decoded.email,
      role: decoded.role || "free",
    };
  } catch {
    // ignore invalid tokens in optional mode
  }
  next();
}

module.exports = { signToken, verifyToken, requireAuth, optionalAuth, JWT_SECRET, JWT_EXPIRY, ISSUER };