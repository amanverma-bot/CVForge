// API-level integration with a local OpenAI-compatible mock server.
// Proves route wiring and graceful fallbacks without external calls.
// The mock URL and key are installed before the app is imported so the real
// config/env -> lib/llm path is exercised (no module-state shortcuts).
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import http from "node:http";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

const SECRET = "sk-integration-mock-secret";
let mode = "success";
let server;
let api;
let token;

function solve(question) {
  const [, a, b] = question.match(/(\d+)\s*\+\s*(\d+)/) || [0, 0, 0];
  return Number(a) + Number(b);
}

function start(handler) {
  return new Promise((resolve, reject) => {
    const s = http.createServer(handler);
    s.on("error", reject);
    s.listen(0, "127.0.0.1", () => resolve(s));
  });
}

function mockCompletion(req, res) {
  let body = "";
  req.on("data", (chunk) => (body += chunk));
  req.on("end", () => {
    if (mode === "auth-fail") {
      res.writeHead(401, { "content-type": "application/json" });
      res.end(JSON.stringify({ error: `bad key ${SECRET}` }));
      return;
    }
    const payload = JSON.parse(body || "{}");
    const system = payload.messages?.[0]?.content || "";
    const content = system.includes("interview coach")
      ? JSON.stringify([
          { q: "Explain the event loop", type: "technical", tip: "Be specific", keywords: ["event loop"] },
        ])
      : "Enhanced CV from mock";
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ model: "mock", choices: [{ message: { content } }] }));
  });
}

server = await start(mockCompletion);
process.env.OPENAI_API_KEY = SECRET;
process.env.OPENAI_MODEL = "mock";
process.env.OPENAI_BASE_URL = `http://127.0.0.1:${server.address().port}/v1`;
// Hermetic guard: ambient backend/.env may contain a live GEMINI_API_KEY;
// blank it so these OpenAI-mock tests never reach the real Gemini API.
// (Same native env instance the app loads — the require cache is shared.)
const env = require("../config/env.js");
env.GEMINI_API_KEY = "";
const { default: app } = await import("../app.js");
const llm = require("../lib/llm.js");
api = request(app);

beforeAll(async () => {
  const cap = await api.get("/api/captcha");
  const n = `aimock${Math.random().toString(36).slice(2, 8)}`;
  const reg = await api.post("/api/auth/register").send({
    name: n,
    email: `${n}@example.com`,
    password: "Passw0rd!123",
    confirm_password: "Passw0rd!123",
    captcha_token: cap.body.token,
    captcha_answer: solve(cap.body.question),
  });
  expect(reg.status).toBe(201);
  token = reg.body.token;
});

afterAll(async () => {
  delete process.env.OPENAI_API_KEY;
  delete process.env.OPENAI_MODEL;
  delete process.env.OPENAI_BASE_URL;
  llm.configureLocal("");
  server.closeAllConnections?.();
  await new Promise((resolve) => server.close(resolve));
});

describe("AI routes against a local OpenAI-compatible mock", () => {
  it("returns a real LLM completion from /api/enhance", async () => {
    mode = "success";
    const res = await api
      .post("/api/enhance")
      .set("Authorization", `Bearer ${token}`)
      .send({ cv_text: "Original CV text", jd_text: "Job description text" });

    expect(res.status).toBe(200);
    expect(res.body.engine).toBe("llm");
    expect(res.body.enhanced).toBe("Enhanced CV from mock");
    expect(JSON.stringify(res.body)).not.toContain(SECRET);

    const health = await api.get("/api/health");
    expect(health.body.llm).toBe(true);
    expect(health.body.ai.active).toBe("openai");
  });

  it("parses interview questions from a mocked JSON completion", async () => {
    mode = "success";
    const res = await api
      .post("/api/mock-interview")
      .set("Authorization", `Bearer ${token}`)
      .send({ cv_text: "JavaScript CV", jd_text: "Frontend job" });

    expect(res.status).toBe(200);
    expect(res.body.engine).toBe("llm");
    expect(res.body.questions).toHaveLength(1);
    expect(res.body.questions[0].q).toBe("Explain the event loop");
  });

  it("keeps the offline enhance fallback when the provider rejects the key", async () => {
    mode = "auth-fail";
    const res = await api
      .post("/api/enhance")
      .set("Authorization", `Bearer ${token}`)
      .send({ cv_text: "Original CV text", jd_text: "Job description text" });

    expect(res.status).toBe(200);
    expect(res.body.enhanced).toBe("Original CV text");
    expect(res.body.error).toMatch(/authentication failed/i);
    expect(JSON.stringify(res.body)).not.toContain(SECRET);

    const health = await api.get("/api/health");
    expect(health.body.llm).toBe(false);
    expect(health.body.ai.active).toBe("offline");
  });

  it("falls back to a local OpenAI-compatible provider when OpenAI fails", async () => {
    mode = "auth-fail";
    const localServer = await start((req, res) => {
      let body = "";
      req.on("data", (chunk) => (body += chunk));
      req.on("end", () => {
        res.writeHead(200, { "content-type": "application/json" });
        res.end(JSON.stringify({ model: "local", choices: [{ message: { content: "Local enhanced CV" } }] }));
      });
    });
    llm.configureLocal(`http://127.0.0.1:${localServer.address().port}/v1`, "local");
    try {
      const res = await api
        .post("/api/enhance")
        .set("Authorization", `Bearer ${token}`)
        .send({ cv_text: "Original CV text", jd_text: "Job description text" });

      expect(res.status).toBe(200);
      expect(res.body.engine).toBe("llm");
      expect(res.body.provider).toBe("local");
      expect(res.body.enhanced).toBe("Local enhanced CV");

      const health = await api.get("/api/health");
      expect(health.body.llm).toBe(true);
      expect(health.body.ai.active).toBe("local");
    } finally {
      llm.configureLocal("");
      localServer.closeAllConnections?.();
      await new Promise((resolve) => localServer.close(resolve));
      mode = "success";
    }
  });
});
