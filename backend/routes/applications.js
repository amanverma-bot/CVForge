// Applications tracker routes — all auth-scoped to the requesting user.
const express = require("express");
const store = require("../models/store");
const schemas = require("../schemas");
const { validate } = require("../middleware/validate");
const { requireAuth } = require("../middleware/auth");
const { asyncHandler, AppError } = require("../middleware/error");

const router = express.Router();

router.post(
  "/",
  requireAuth,
  validate({ body: schemas.createApplication }),
  asyncHandler(async (req, res) => {
    const created = await store.createApplication({ userId: String(req.user.id), ...req.body });
    res.status(201).json(created);
  })
);

router.get(
  "/",
  requireAuth,
  asyncHandler(async (req, res) => {
    res.json({ items: await store.listApplications(String(req.user.id)), statuses: store.STATUSES });
  })
);

router.patch(
  "/:id",
  requireAuth,
  validate({ params: schemas.idParam, body: schemas.updateApplication }),
  asyncHandler(async (req, res) => {
    const a = await store.updateApplication(req.params.id, String(req.user.id), req.body);
    if (!a) throw new AppError(404, "Not found");
    res.json(a);
  })
);

router.delete(
  "/:id",
  requireAuth,
  validate({ params: schemas.idParam }),
  asyncHandler(async (req, res) => {
    if (!(await store.deleteApplication(req.params.id, String(req.user.id)))) throw new AppError(404, "Not found");
    res.json({ ok: true });
  })
);

module.exports = router;
