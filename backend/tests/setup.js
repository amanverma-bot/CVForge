// Test environment — runs BEFORE any app module import (dotenv never overrides existing vars).
process.env.NODE_ENV = "test";
process.env.JWT_SECRET = "test-secret-value-with-enough-length-1234567890";
process.env.MONGO_URI = "";
process.env.ADMIN_PASSWORD = "";
process.env.LOG_LEVEL = "silent";
process.env.RATE_LIMIT_ENABLED = "false";
