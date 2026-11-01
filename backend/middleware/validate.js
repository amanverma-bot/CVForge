// ── Validation Middleware ──────────────────────────────────────────────────
// Zod schema validation for request bodies, params, and queries.

function validate(options = {}) {
  const schemas = options.schemas || options;
  const { body, params, query } = schemas;

  return (req, res, next) => {
    const errors = [];

    if (body) {
      const result = body.safeParse(req.body);
      if (!result.success) {
        errors.push(...result.error.issues.map((i) => ({
          path: i.path.join("."),
          message: i.message,
        })));
      } else {
        req.body = result.data;
      }
    }

    if (params) {
      const result = params.safeParse(req.params);
      if (!result.success) {
        errors.push(...result.error.issues.map((i) => ({
          path: i.path.join("."),
          message: i.message,
        })));
      } else {
        req.params = result.data;
      }
    }

    if (query) {
      const result = query.safeParse(req.query);
      if (!result.success) {
        errors.push(...result.error.issues.map((i) => ({
          path: i.path.join("."),
          message: i.message,
        })));
      } else {
        req.query = result.data;
      }
    }

    if (errors.length > 0) {
      const err = new Error("Validation failed");
      err.statusCode = 400;
      err.details = errors;
      return next(err);
    }

    next();
  };
}

module.exports = { validate };