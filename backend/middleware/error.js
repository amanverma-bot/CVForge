// ── Error Handling Middleware ──────────────────────────────────────────────
// Centralized error handling with consistent JSON responses.

class AppError extends Error {
  constructor(statusCode, message) {
    super(message);
    this.statusCode = statusCode;
    this.status = `${statusCode}`.startsWith("4") ? "fail" : "error";
    this.isOperational = true;
    Error.captureStackTrace(this, this.constructor);
  }
}

function asyncHandler(fn) {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

function notFoundHandler(req, res, next) {
  next(new AppError(404, "Not found"));
}

function errorHandler(err, req, res, next) {
  let statusCode = err.statusCode || 500;
  let message = err.message || "Internal server error";
  let details = err.details;

  // Don't leak stack traces in production
  const isProd = process.env.NODE_ENV === "production";

  // Zod validation errors
  if (err.name === "ZodError") {
    statusCode = 400;
    message = "Validation failed";
    details = err.issues.map((i) => ({
      path: i.path.join("."),
      message: i.message,
    }));
  }

  // JSON parse errors
  if (err.type === "entity.parse.failed" || err.message === "Unexpected token") {
    statusCode = 400;
    message = "Malformed JSON body";
    details = undefined;
  }

  // Multer errors
  if (err.name === "MulterError" || err.code?.startsWith("LIMIT_")) {
    statusCode = err.code === "LIMIT_FILE_SIZE" ? 413 : 400;
    message =
      err.code === "LIMIT_FILE_SIZE"
        ? "File too large"
        : err.code === "LIMIT_UNEXPECTED_FILE"
          ? "Unexpected file field"
          : "Invalid file upload";
  }

  // CastError / invalid ObjectId → 404 (hide existence)
  if (err.name === "CastError" || err.kind === "ObjectId") {
    statusCode = 404;
    message = "Not found";
  }

  // Never leak internal error details (driver/stack messages) in production.
  if (isProd && statusCode >= 500 && !err.isOperational) {
    message = "Internal server error";
    details = undefined;
  }

  res.status(statusCode).json({
    error: message,
    ...(details ? { details } : {}),
    ...(!isProd && { stack: err.stack }),
  });
}

module.exports = { AppError, asyncHandler, notFoundHandler, errorHandler };