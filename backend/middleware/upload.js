// ── Upload Middleware ──────────────────────────────────────────────────────
// Multer memory storage with file type validation and size limits.
const multer = require("multer");
const { isAllowedExtension, MAX_FILE_SIZE } = require("../lib/parse");
const { AppError } = require("./error");

const storage = multer.memoryStorage();

const fileFilter = (req, file, cb) => {
  if (!isAllowedExtension(file.originalname)) {
    return cb(new AppError(415, `Unsupported file type: ${file.originalname}`), false);
  }
  cb(null, true);
};

const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: MAX_FILE_SIZE,
    files: 2,
  },
});

function verifyUploads(req, res, next) {
  // Check if any files exceeded size limits
  if (req.fileValidationError) {
    return next(new AppError(415, req.fileValidationError));
  }
  next();
}

module.exports = { upload, verifyUploads };