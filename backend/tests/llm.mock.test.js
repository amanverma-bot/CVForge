// Local OpenAI-compatible mock server tests.
// No external network calls and no paid API usage: every request is sent to a
// loopback HTTP server created by this test file.
import { describe, it, expect, afterEach, beforeEach } from "vitest";
import http from "node:http";
import llm from "../lib/llm.js";

const SECRET = "sk-test-mock-secret-123";

function startServer(handler) {
  return new Promise((resolve, reject) => {
    const server = http.createServer(handler);
    server.on("error", reject);
    server.listen(0, "127.0.0.1", () => resolve(server));
  });
}

function baseUrl(server) {
  return `http://127.0.0.1:${server.address().port}/v1`;
}

async function stopServer(server) {
  if (!server) return;
  server.closeAllConnections?.();
  await new Promise((resolve) => server.close(resolve));
}

function json(res, status, payload) {
  res.writeHead(status, { "content-type": "application/json" });
  res.end(JSON.stringify(payload));
}

let server;

beforeEach(() => {
  llm.configure("", "gpt-4o-mini", "https://api.openai.com/v1");
});

afterEach(async () => {
  await stopServer(server);
  server = null;
  llm.configure("", "gpt-4o-mini", "https://api.openai.com/v1");
});

describe("OpenAI-compatible mock server", () => {
  it("sends the bearer key and parses a successful completion", async () => {
    let observed = null;
    server = await startServer((req, res) => {
      let body = "";
      req.on("data", (chunk) => (body += chunk));
      req.on("end", () => {
        observed = { url: req.url, auth: req.headers.authorization, body: JSON.parse(body) };
        json(res, 200, {
          model: "mock-model",
          choices: [{ message: { content: "  Enhanced CV text  " } }],
          usage: { total_tokens: 12 },
        });
      });
    });
    llm.configure(SECRET, "mock-model", baseUrl(server));

    const result = await llm.chat([{ role: "user", content: "hello" }]);

    expect(result).toEqual({
      content: "Enhanced CV text",
      usage: { total_tokens: 12 },
      model: "mock-model",
    });
    expect(observed.url).toBe("/v1/chat/completions");
    expect(observed.auth).toBe(`Bearer ${SECRET}`);
    expect(observed.body.model).toBe("mock-model");
    expect(JSON.stringify(result)).not.toContain(SECRET);
  });

  it("returns a sanitized authentication error for invalid credentials", async () => {
    server = await startServer((req, res) => {
      json(res, 401, { error: `Incorrect API key provided: ${SECRET}` });
    });
    llm.configure(SECRET, "mock-model", baseUrl(server));

    const result = await llm.chat([{ role: "user", content: "hello" }]);

    expect(result.content).toBeNull();
    expect(result.error).toMatch(/authentication failed \(401\)/i);
    expect(result.error).not.toContain(SECRET);
    expect(result.error).not.toContain("Incorrect API key");
  });

  it("maps provider outages to a stable error", async () => {
    server = await startServer((req, res) => {
      json(res, 503, { error: "upstream unavailable", request_id: "req_x" });
    });
    llm.configure(SECRET, "mock-model", baseUrl(server));

    const result = await llm.chat([{ role: "user", content: "hello" }]);

    expect(result.content).toBeNull();
    expect(result.error).toMatch(/service unavailable \(503\)/i);
    expect(result.error).not.toContain("upstream unavailable");
  });

  it("times out requests without hanging the caller", async () => {
    server = await startServer((req, res) => {
      setTimeout(() => {
        if (!res.destroyed) json(res, 200, { choices: [{ message: { content: "late" } }] });
      }, 500);
    });
    llm.configure(SECRET, "mock-model", baseUrl(server));

    const started = Date.now();
    const result = await llm.chat([{ role: "user", content: "hello" }], { timeoutMs: 40 });
    const elapsed = Date.now() - started;

    expect(result.content).toBeNull();
    expect(result.error).toMatch(/timed out after 40ms/i);
    expect(elapsed).toBeLessThan(400);
  });

  it("rejects malformed and empty provider responses", async () => {
    server = await startServer((req, res) => {
      res.writeHead(200, { "content-type": "application/json" });
      res.end("this is not json");
    });
    llm.configure(SECRET, "mock-model", baseUrl(server));
    expect((await llm.chat([{ role: "user", content: "x" }])).error).toMatch(/invalid response/i);

    await stopServer(server);
    server = await startServer((req, res) => {
      json(res, 200, { choices: [{ message: { content: "   " } }] });
    });
    llm.configure(SECRET, "mock-model", baseUrl(server));
    expect((await llm.chat([{ role: "user", content: "x" }])).error).toMatch(/empty response/i);
  });

  it("reports a clear error when no key is configured and never calls the network", async () => {
    let calls = 0;
    server = await startServer((req, res) => {
      calls++;
      json(res, 200, { choices: [{ message: { content: "should not run" } }] });
    });
    llm.configure("", "mock-model", baseUrl(server));

    const result = await llm.chat([{ role: "user", content: "hello" }]);

    expect(result).toEqual({ content: null, error: "No LLM API key configured" });
    expect(calls).toBe(0);
    expect(llm.hasKey()).toBe(false);
  });

  it("preserves offline fallbacks for enhance, cover letter, and mock questions", async () => {
    server = await startServer((req, res) => {
      json(res, 401, { error: "bad key" });
    });
    llm.configure(SECRET, "mock-model", baseUrl(server));
    const cv = "Python developer with 3 years experience";
    const jd = "Python React role";

    const enhanced = await llm.aiEnhance(cv, jd);
    expect(enhanced.enhanced).toBe(cv);
    expect(enhanced.error).toMatch(/authentication failed/i);

    const cover = await llm.aiCoverLetter(cv, jd, "Test User");
    expect(cover.coverLetter).toBeNull();
    expect(cover.error).toMatch(/authentication failed/i);

    const mock = await llm.aiMockQuestions(cv, jd);
    expect(mock.questions).toHaveLength(7);
    expect(mock.questions[0]).toMatchObject({ q: expect.any(String), keywords: expect.any(Array) });
    expect(mock.error).toMatch(/authentication failed/i);
  });

  it("parses fenced JSON interview questions from a successful response", async () => {
    server = await startServer((req, res) => {
      json(res, 200, {
        choices: [
          {
            message: {
              content: '```json\n[{"q":"Explain closures","type":"technical","tip":"Example","keywords":["closure"]},{"q":"Tell me about a project","keywords":"not-an-array"}]\n```',
            },
          },
        ],
      });
    });
    llm.configure(SECRET, "mock-model", baseUrl(server));

    const result = await llm.aiMockQuestions("JS", "Frontend");
    expect(result.error).toBeUndefined();
    expect(result.questions).toHaveLength(2);
    expect(result.questions[0].q).toBe("Explain closures");
    expect(result.questions[1].keywords).toEqual([]);
  });

  it("clamps parsed interview evaluation scores", async () => {
    server = await startServer((req, res) => {
      json(res, 200, {
        choices: [{ message: { content: '{"score":42,"level":"Unknown","feedback":"  Good answer.  "}' } }],
      });
    });
    llm.configure(SECRET, "mock-model", baseUrl(server));

    const result = await llm.evaluateAnswer("Q?", "A sufficiently long answer with details.");
    expect(result.score).toBe(10);
    expect(result.level).toBe("Excellent");
    expect(result.feedback).toBe("Good answer.");
  });
});
