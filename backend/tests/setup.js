// Test environment — runs BEFORE any app module import (dotenv never overrides existing vars).
process.env.NODE_ENV = "test";
process.env.JWT_SECRET = "test-secret-value-with-enough-length-1234567890";
process.env.MONGO_URI = "";
process.env.ADMIN_PASSWORD = "";
process.env.LOG_LEVEL = "silent";
process.env.RATE_LIMIT_ENABLED = "false";
process.env.LOCAL_LLM_ENABLED = "false";
process.env.LLM_HEALTH_TIMEOUT_MS = "500";
process.env.FRONTEND_URL = "https://app.test.local";
process.env.GOOGLE_CLIENT_ID = "test-google-client-id";
process.env.GOOGLE_CLIENT_SECRET = "test-google-client-secret";
process.env.GOOGLE_CALLBACK_URL = "https://api.test.local/api/auth/google/callback";
process.env.GITHUB_CLIENT_ID = "test-github-client-id";
process.env.GITHUB_CLIENT_SECRET = "test-github-client-secret";
process.env.GITHUB_CALLBACK_URL = "https://api.test.local/api/auth/github/callback";
