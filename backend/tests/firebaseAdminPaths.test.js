import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { execFileSync } from "child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const REPO = path.resolve(__dirname, "../..");
const BASE = path.join(os.tmpdir(), "cvforge-firebase-audit-paths");
const PROJECT_ID = "cvforge-ca97c";

vi.mock("../config/env", () => ({
  FIREBASE_PROJECT_ID: undefined,
  FIREBASE_SERVICE_ACCOUNT_PATH: undefined,
}));

function runEnvValidation(overrides = {}) {
  const env = { ...process.env };
  env.NODE_ENV = "test";
  env.FIREBASE_PROJECT_ID = "";
  env.FIREBASE_SERVICE_ACCOUNT_PATH = "";
  Object.assign(env, overrides);

  try {
    const stdout = execFileSync(
      "node",
      ["-e", "require('./backend/config/env'); console.log('env-validation-accepted');"],
      { cwd: REPO, env, encoding: "utf8", maxBuffer: 1024 * 1024, timeout: 10000 }
    );
    return { ok: true, stdout, stderr: "", status: 0 };
  } catch (err) {
    return {
      ok: false,
      stdout: err.stdout ?? "",
      stderr: err.stderr ?? "",
      status: err.status ?? 1,
    };
  }
}

function withTempDir(fn) {
  fs.rmSync(BASE, { recursive: true, force: true });
  fs.mkdirSync(BASE, { recursive: true, mode: 0o700 });
  try {
    return fn(BASE);
  } finally {
    fs.rmSync(BASE, { recursive: true, force: true });
  }
}

function writeFile(file, mode = 0o600) {
  fs.writeFileSync(file, JSON.stringify({ type: "service_account", project_id: PROJECT_ID }));
  fs.chmodSync(file, mode);
  return file;
}

beforeEach(() => {
  vi.restoreAllMocks();
});

afterEach(() => {
  fs.rmSync(BASE, { recursive: true, force: true });
});

describe("Firebase Admin service-account path validation", () => {
  it("accepts a valid outside-repo path with directory 700 and file 600", () => {
    const result = withTempDir((dir) => {
      const file = writeFile(path.join(dir, "valid.json"), 0o600);
      return runEnvValidation({
        FIREBASE_PROJECT_ID: PROJECT_ID,
        FIREBASE_SERVICE_ACCOUNT_PATH: file,
      });
    });
    expect(result.ok).toBe(true);
    expect(result.stdout).toContain("env-validation-accepted");
  });

  it("rejects a missing outside-repo path", () => {
    const result = withTempDir((dir) => {
      return runEnvValidation({
        FIREBASE_PROJECT_ID: PROJECT_ID,
        FIREBASE_SERVICE_ACCOUNT_PATH: path.join(dir, "missing.json"),
      });
    });
    expect(result.ok).toBe(false);
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("existing readable file");
  });

  it("rejects an unreadable outside-repo file", () => {
    const result = withTempDir((dir) => {
      const file = writeFile(path.join(dir, "unreadable.json"), 0o000);
      return runEnvValidation({
        FIREBASE_PROJECT_ID: PROJECT_ID,
        FIREBASE_SERVICE_ACCOUNT_PATH: file,
      });
    });
    expect(result.ok).toBe(false);
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("existing readable file");
  });

  it("rejects a group/world-readable outside-repo file", () => {
    const result = withTempDir((dir) => {
      const file = writeFile(path.join(dir, "world-readable.json"), 0o644);
      return runEnvValidation({
        FIREBASE_PROJECT_ID: PROJECT_ID,
        FIREBASE_SERVICE_ACCOUNT_PATH: file,
      });
    });
    expect(result.ok).toBe(false);
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("group/world readable");
  });

  it("rejects a directory instead of a file", () => {
    const result = withTempDir((dir) => {
      const dirPath = path.join(dir, "adir");
      fs.mkdirSync(dirPath, { mode: 0o700 });
      return runEnvValidation({
        FIREBASE_PROJECT_ID: PROJECT_ID,
        FIREBASE_SERVICE_ACCOUNT_PATH: dirPath,
      });
    });
    expect(result.ok).toBe(false);
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("regular file");
  });

  it("rejects a direct in-repo path", () => {
    const result = runEnvValidation({
      FIREBASE_PROJECT_ID: PROJECT_ID,
      FIREBASE_SERVICE_ACCOUNT_PATH: path.join(REPO, "backend", ".env"),
    });
    expect(result.ok).toBe(false);
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("outside this repository");
  });

  it("rejects a symlink whose resolved target is inside the repository", () => {
    const result = withTempDir((dir) => {
      const link = path.join(dir, "link-to-repo.json");
      fs.symlinkSync(path.join(REPO, "backend", ".env"), link);
      return runEnvValidation({
        FIREBASE_PROJECT_ID: PROJECT_ID,
        FIREBASE_SERVICE_ACCOUNT_PATH: link,
      });
    });
    expect(result.ok).toBe(false);
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("outside this repository");
  });

  it("rejects a symlink to the repository root", () => {
    const result = withTempDir((dir) => {
      const link = path.join(dir, "link-to-repo-root.json");
      fs.symlinkSync(REPO, link);
      return runEnvValidation({
        FIREBASE_PROJECT_ID: PROJECT_ID,
        FIREBASE_SERVICE_ACCOUNT_PATH: link,
      });
    });
    expect(result.ok).toBe(false);
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("outside this repository");
  });

  it("rejects a relative path", () => {
    const result = runEnvValidation({
      FIREBASE_PROJECT_ID: PROJECT_ID,
      FIREBASE_SERVICE_ACCOUNT_PATH: "backend/.env",
    });
    expect(result.ok).toBe(false);
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("absolute path");
  });

  it("rejects only one Firebase variable", () => {
    const withProjectOnly = runEnvValidation({ FIREBASE_PROJECT_ID: PROJECT_ID });
    expect(withProjectOnly.ok).toBe(false);
    expect(withProjectOnly.stderr).toContain("together");

    const withPathOnly = withTempDir((dir) => {
      const file = writeFile(path.join(dir, "path-only.json"), 0o600);
      return runEnvValidation({ FIREBASE_SERVICE_ACCOUNT_PATH: file });
    });
    expect(withPathOnly.ok).toBe(false);
    expect(withPathOnly.stderr).toContain("together");
  });

  it("rejects a wrong project ID", () => {
    const result = withTempDir((dir) => {
      const file = writeFile(path.join(dir, "wrong-project.json"), 0o600);
      return runEnvValidation({
        FIREBASE_PROJECT_ID: "wrong-project",
        FIREBASE_SERVICE_ACCOUNT_PATH: file,
      });
    });
    expect(result.ok).toBe(false);
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("must be cvforge-ca97c");
  });

  it("accepts an outside-repo symlink to an outside-repo valid file", () => {
    const result = withTempDir((dir) => {
      const target = writeFile(path.join(dir, "target.json"), 0o600);
      const link = path.join(dir, "link-to-valid.json");
      fs.symlinkSync(target, link);
      return runEnvValidation({
        FIREBASE_PROJECT_ID: PROJECT_ID,
        FIREBASE_SERVICE_ACCOUNT_PATH: link,
      });
    });
    expect(result.ok).toBe(true);
    expect(result.stdout).toContain("env-validation-accepted");
  });
});

describe("Firebase Admin unconfigured status", () => {
  let originalProjectId;
  let originalServiceAccountPath;
  const envModule = require("../config/env.js");

  beforeEach(() => {
    originalProjectId = envModule.FIREBASE_PROJECT_ID;
    originalServiceAccountPath = envModule.FIREBASE_SERVICE_ACCOUNT_PATH;
    envModule.FIREBASE_PROJECT_ID = undefined;
    envModule.FIREBASE_SERVICE_ACCOUNT_PATH = undefined;
  });

  afterEach(() => {
    envModule.FIREBASE_PROJECT_ID = originalProjectId;
    envModule.FIREBASE_SERVICE_ACCOUNT_PATH = originalServiceAccountPath;
  });

  it("reports unconfigured when no Admin credentials are set", () => {
    const { isConfigured } = require("../lib/firebaseAdmin.js");
    expect(isConfigured()).toBe(false);
  });
});
