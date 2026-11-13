// Gemini integration tests: the REAL @google/genai SDK pointed at a local
// mock endpoint (GEMINI_BASE_URL) — no network. App modules are loaded with
// native require (createRequire) so the env object is the exact instance the
// backend modules share, matching the ai.mock.test.js loading pattern.
import { describe, it, expect, beforeEach, afterAll } from "vitest";
import http from "node:http";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

const FAKE_KEY = "AIzaFAKE-test-key-1234567890";
process.env.GEMINI_API_KEY = FAKE_KEY;

const env = require("../config/env.js");
const gemini = require("../lib/gemini.js");
const llm = require("../lib/llm.js");
const aiService = require("../services/aiService.js");
const { createLimiter } = require("../middleware/rateLimit.js");
const { z } = require("zod");

// ── local mock endpoint ─────────────────────────────────────────────────────
const captured = []; // {path, body}
const queued = []; // {status, payload, delayMs}

function queue(status, payload, delayMs = 0) {
  queued.push({ status, payload, delayMs });
}

function interaction(outputText, model = "gemini-3.8-flash") {
  return { id: "int_test", model, status: "completed", output_text: outputText };
}

const server = http.createServer((req, res) => {
  let body = "";
  req.on("data", (c) => (body += c));
  req.on("end", () => {
    let parsed = {};
    try {
      parsed = JSON.parse(body || "{}");
    } catch {}
    captured.push({ path: req.url || "", body: parsed });
    const next = queued.shift() || {
      status: 200,
      payload: interaction('{"skills":["React","Node"],"extra":"strip me"}'),
      delayMs: 0,
    };
    setTimeout(() => {
      res.writeHead(next.status, { "content-type": "application/json" });
      res.end(JSON.stringify(next.payload));
    }, next.delayMs);
  });
});
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
server.unref();

env.GEMINI_BASE_URL = `http://127.0.0.1:${server.address().port}`;
env.GEMINI_API_KEY = FAKE_KEY;
env.GEMINI_ENABLED = true;
env.GEMINI_MODEL = "gemini-3.8-flash";
env.GEMINI_FALLBACK_MODEL = "gemini-3.5-flash-lite";

const VALID_SCHEMA = {
  type: "object",
  properties: { skills: { type: "array", items: { type: "string" }, maxItems: 5 } },
  required: ["skills"],
};
const ValidOut = z.object({ skills: z.array(z.string()).max(5) }).strip();

const TASK = [
  { role: "system", content: "Extract skills." },
  { role: "user", content: "CV:\nAman builds React apps." },
];

beforeEach(() => {
  captured.length = 0;
  queued.length = 0;
  env.GEMINI_API_KEY = FAKE_KEY;
  env.GEMINI_ENABLED = true;
});

afterAll(async () => {
  server.closeAllConnections?.();
  server.close();
});

describe("gemini structured() through the real SDK", () => {
  it("happy path: validates data, strips extra fields, sends schema + config", async () => {
    const result = await gemini.structured(TASK, {
      zodSchema: ValidOut,
      jsonSchema: VALID_SCHEMA,
      temperature: 0.2,
      maxTokens: 300,
    });
    expect(result.error).toBeUndefined();
    expect(result.provider).toBe("gemini");
    expect(result.model).toBe("gemini-3.8-flash");
    expect(result.data).toEqual({ skills: ["React", "Node"] });

    expect(captured.length).toBe(1); // all traffic stayed local
    const body = captured[0].body;
    expect(body.model).toBe("gemini-3.8-flash");
    expect(body.system_instruction).toContain("Extract skills.");
    expect(body.system_instruction).toContain("SECURITY RULES");
    expect(body.input).toContain("<<<DOCUMENT>>>");
    expect(body.input).toContain("<<<END DOCUMENT>>>");
    expect(body.input).toContain("Aman builds React apps.");
    expect(body.response_format).toEqual({ type: "text", mime_type: "application/json", schema: VALID_SCHEMA });
    expect(body.generation_config).toEqual({ temperature: 0.2, max_output_tokens: 300 });
  });

  it("plain requestCompletion sends no response_format", async () => {
    queue(200, interaction("hello"));
    const result = await gemini.requestCompletion(TASK, { temperature: 0.5, maxTokens: 64 });
    expect(result.content).toBe("hello");
    expect(captured[0].body.response_format).toBeUndefined();
  });

  it("malformed JSON → data null, provider offline, no throw", async () => {
    queue(200, interaction("not json at all"));
    const result = await gemini.structured(TASK, { zodSchema: ValidOut, jsonSchema: VALID_SCHEMA });
    expect(result.data).toBeNull();
    expect(result.provider).toBe("offline");
    expect(String(result.error)).toMatch(/JSON|shape/i);
  });

  it("Zod validation failure → data null with validation error", async () => {
    queue(200, interaction('{"skills":"not-an-array"}'));
    const result = await gemini.structured(TASK, { zodSchema: ValidOut, jsonSchema: VALID_SCHEMA });
    expect(result.data).toBeNull();
    expect(String(result.error)).toMatch(/validation/i);
  });

  it("scalar output rejected as wrong shape", async () => {
    queue(200, interaction('"just a string"'));
    const result = await gemini.structured(TASK, { zodSchema: ValidOut, jsonSchema: VALID_SCHEMA });
    expect(result.data).toBeNull();
    expect(String(result.error)).toMatch(/shape/i);
  });

  it("empty response → error, no retry", async () => {
    queue(200, interaction("   "));
    const result = await gemini.structured(TASK, { zodSchema: ValidOut, jsonSchema: VALID_SCHEMA });
    expect(result.data).toBeNull();
    expect(String(result.error)).toMatch(/empty/i);
    expect(captured.length).toBe(1);
  });
});

describe("gemini error mapping + retry policy", () => {
  it("429 → one retry with the fallback model, then success", async () => {
    queue(429, { error: { message: "quota exceeded" } });
    const result = await gemini.structured(TASK, { zodSchema: ValidOut, jsonSchema: VALID_SCHEMA });
    expect(result.data).toEqual({ skills: ["React", "Node"] });
    expect(captured.length).toBe(2);
    expect(captured[0].body.model).toBe("gemini-3.8-flash");
    expect(captured[1].body.model).toBe("gemini-3.5-flash-lite");
  });

  it("403 → no retry, and the API key never leaks", async () => {
    queue(403, { error: { message: `API key ${FAKE_KEY} is invalid` } });
    const result = await gemini.structured(TASK, { zodSchema: ValidOut, jsonSchema: VALID_SCHEMA });
    expect(result.data).toBeNull();
    expect(result.provider).toBe("offline");
    expect(captured.length).toBe(1);
    expect(String(result.error)).not.toContain("AIzaFAKE");
    expect(String(result.error)).toMatch(/authentication/i);
  });

  it("400 → no retry, rejection message", async () => {
    queue(400, { error: { message: "Invalid schema" } });
    const result = await gemini.structured(TASK, { zodSchema: ValidOut, jsonSchema: VALID_SCHEMA });
    expect(captured.length).toBe(1);
    expect(String(result.error)).toMatch(/rejected \(400\)/);
  });

  it("5xx → one fallback retry, then service-unavailable error", async () => {
    queue(503, { error: { message: "overloaded" } });
    queue(503, { error: { message: "overloaded" } });
    const result = await gemini.structured(TASK, { zodSchema: ValidOut, jsonSchema: VALID_SCHEMA });
    expect(captured.length).toBe(2);
    expect(String(result.error)).toMatch(/service unavailable \(503\)/);
  });

  it("timeout on both attempts → mapped timeout error after fallback retry", async () => {
    queue(200, interaction('{"skills":[]}'), 600);
    queue(200, interaction('{"skills":[]}'), 600);
    const result = await gemini.structured(TASK, {
      zodSchema: ValidOut,
      jsonSchema: VALID_SCHEMA,
      timeoutMs: 100,
    });
    expect(captured.length).toBe(2);
    expect(String(result.error)).toMatch(/timed out/i);
  });
});

describe("PII redaction + injection guard", () => {
  it("emails, phones and URLs are redacted in the SDK input", async () => {
    await gemini.structured(
      [
        { role: "system", content: "Extract skills." },
        {
          role: "user",
          content:
            "CV:\nmail me at aman.verma@gmail.com or +91 98765 43210, portfolio https://aman.dev/portfolio",
        },
      ],
      { zodSchema: ValidOut, jsonSchema: VALID_SCHEMA }
    );
    const input = captured[0].body.input;
    expect(input).toContain("[REDACTED_EMAIL]");
    expect(input).toContain("[REDACTED_PHONE]");
    expect(input).toContain("[REDACTED_URL]");
    expect(input).not.toContain("aman.verma@gmail.com");
    expect(input).not.toContain("98765");
    expect(input).not.toContain("https://");
  });

  it("dates and short numbers survive redaction", () => {
    const out = gemini.redactPII("B.Tech CSE 2021-2025, scored 8.9 CGPA, worked 3 years");
    expect(out).toContain("2021-2025");
    expect(out).toContain("8.9");
  });

  it("injection guard is appended to the system instruction", async () => {
    await gemini.structured(TASK, { zodSchema: ValidOut, jsonSchema: VALID_SCHEMA });
    const sys = captured[0].body.system_instruction;
    expect(sys).toContain("SECURITY RULES");
    expect(sys).toContain("<<<DOCUMENT>>>");
    expect(sys).toContain("untrusted data");
  });
});

describe("configuration gating", () => {
  it("no key → offline result without any request", async () => {
    env.GEMINI_API_KEY = "";
    try {
      const result = await gemini.structured(TASK, { zodSchema: ValidOut, jsonSchema: VALID_SCHEMA });
      expect(result.data).toBeNull();
      expect(result.provider).toBe("offline");
      expect(captured.length).toBe(0);
      expect(gemini.configured()).toBe(false);
    } finally {
      env.GEMINI_API_KEY = FAKE_KEY;
    }
  });

  it("placeholder-shaped key is rejected", () => {
    env.GEMINI_API_KEY = "<your-gemini-key>";
    try {
      expect(gemini.configured()).toBe(false);
    } finally {
      env.GEMINI_API_KEY = FAKE_KEY;
    }
  });

  it("GEMINI_ENABLED=false disables even with a key", async () => {
    env.GEMINI_ENABLED = false;
    try {
      expect(gemini.configured()).toBe(false);
      const result = await gemini.structured(TASK, { zodSchema: ValidOut, jsonSchema: VALID_SCHEMA });
      expect(result.provider).toBe("offline");
      expect(captured.length).toBe(0);
    } finally {
      env.GEMINI_ENABLED = true;
    }
  });
});

describe("provider chain order + health", () => {
  it("gemini leads the order when configured; disappears when disabled", () => {
    env.GEMINI_ENABLED = true;
    expect(llm.providerOrder()).toEqual(["gemini"]); // openai keyless, local disabled in tests
    env.GEMINI_ENABLED = false;
    expect(llm.providerOrder()).toEqual([]);
    env.GEMINI_ENABLED = true;
  });

  it("statusSnapshot exposes the gemini provider entry", () => {
    const snap = llm.statusSnapshot();
    expect(snap.providers.gemini.label).toBe("Gemini");
    expect(snap.providers.gemini.kind).toBe("cloud");
    expect(snap.providers.gemini.model).toBe("gemini-3.8-flash");
  });
});

describe("service features through the real SDK", () => {
  it("skillsWithAI returns normalized LLM skills", async () => {
    const out = await aiService.skillsWithAI("CV:\nBuilt REST APIs with Node, React dashboards and SQL schemas.");
    expect(out.engine).toBe("llm");
    expect(out.provider).toBe("gemini");
    expect(out.model).toBe("gemini-3.8-flash");
    expect(out.skills).toEqual(["React", "Node"]);
    expect(captured[0].body.response_format.type).toBe("text");
  });

  it("skillsWithAI falls back to scoring offline and reports no error", async () => {
    env.GEMINI_ENABLED = false;
    try {
      const out = await aiService.skillsWithAI(
        "Resume\nSKILLS: Python, React, SQL, Docker\nEXPERIENCE: built APIs with Node"
      );
      expect(out.engine).toBe("offline-scoring");
      expect(out.provider).toBe("offline");
      expect(Array.isArray(out.skills)).toBe(true);
      expect(out.skills.length).toBeGreaterThan(0);
      expect(captured.length).toBe(0);
    } finally {
      env.GEMINI_ENABLED = true;
    }
  });

  it("careerWithAI returns roles/strengths/gaps/roadmap", async () => {
    queue(
      200,
      interaction(
        '{"target_roles":["Backend Developer"],"strengths":["Node APIs"],"gaps":["Testing"],"roadmap":["Learn Jest"],"noise":true}'
      )
    );
    const out = await aiService.careerWithAI("CV:\nNode developer", "JD:\nAPIs", "Backend Developer");
    expect(out.engine).toBe("llm");
    expect(out.target_roles).toEqual(["Backend Developer"]);
    expect(out.gaps).toEqual(["Testing"]);
    expect(out.roadmap).toEqual(["Learn Jest"]);
    expect(out.noise).toBeUndefined();
  });

  it("careerWithAI offline fallback uses scoring gaps", async () => {
    env.GEMINI_ENABLED = false;
    try {
      const out = await aiService.careerWithAI(
        "Resume\nSKILLS: Python, SQL\nEXPERIENCE: data analyst",
        "JD requires Python SQL Docker Kubernetes"
      );
      expect(out.engine).toBe("offline-scoring");
      expect(Array.isArray(out.gaps)).toBe(true);
      expect(out.gaps.length).toBeGreaterThan(0);
    } finally {
      env.GEMINI_ENABLED = true;
    }
  });

  it("analyze adds ai_insights when Gemini succeeds", async () => {
    queue(
      200,
      interaction('{"strengths":["clear projects"],"top_gaps":["testing"],"recruiter_summary":"Solid junior candidate."}')
    );
    const { analysis } = await aiService.analyzeWithAI(
      "Resume\nSKILLS: Python, SQL\nEXPERIENCE: data pipelines",
      "Python SQL engineer"
    );
    expect(analysis.ai_insights).toEqual({
      strengths: ["clear projects"],
      top_gaps: ["testing"],
      recruiter_summary: "Solid junior candidate.",
    });
    expect(analysis.scores.overall).toBeTypeOf("number"); // scoring untouched
  });

  it("analyze omits ai_insights on Gemini failure", async () => {
    queue(500, { error: { message: "boom" } });
    queue(500, { error: { message: "boom" } });
    const { analysis } = await aiService.analyzeWithAI(
      "Resume\nSKILLS: Python, SQL\nEXPERIENCE: data pipelines",
      "Python SQL engineer"
    );
    expect(analysis.ai_insights).toBeUndefined();
    expect(analysis.scores.overall).toBeTypeOf("number");
  });

  it("analyze omits ai_insights entirely when unconfigured", async () => {
    env.GEMINI_ENABLED = false;
    try {
      const { analysis } = await aiService.analyzeWithAI("Resume\nSKILLS: Python", "role");
      expect(analysis.ai_insights).toBeUndefined();
      expect(captured.length).toBe(0);
    } finally {
      env.GEMINI_ENABLED = true;
    }
  });

  it("matchJobs adds rationale to the top 3 without leaking internals", async () => {
    queue(200, interaction('{"rationales":["Great stack fit","Partial fit","Stretch role"]}'));
    const out = await aiService.matchJobs("CV:\nReact Node developer", [
      { title: "Full-stack", text: "React Node job description with lots of text" },
      { title: "Backend", text: "Java Spring job description text" },
      { title: "Data", text: "SQL analytics job description text" },
    ]);
    expect(out.engine).toBe("offline-scoring");
    expect(out.ranking[0].rationale).toBe("Great stack fit");
    expect(out.ranking[1].rationale).toBe("Partial fit");
    expect(out.ranking[2].rationale).toBe("Stretch role");
    for (const row of out.ranking) expect(row).not.toHaveProperty("_jd");
  });
});

describe("geminiLimiter (keyByUser)", () => {
  it("buckets by user id and 429s past max without affecting other users", () => {
    const prev = process.env.RATE_LIMIT_ENABLED;
    process.env.RATE_LIMIT_ENABLED = "true";
    try {
      const limiter = createLimiter({ name: "unit-gemini", windowMs: 60000, max: 3, keyByUser: true });
      const run = (user) => {
        const statuses = [];
        const req = { ip: "1.2.3.4", user: user ? { id: user } : undefined };
        const res = {
          setHeader: () => {},
          status(code) {
            statuses.push(code);
            return { json: () => {} };
          },
        };
        limiter(req, res, () => statuses.push("next"));
        return statuses[0];
      };
      for (let i = 0; i < 3; i++) expect(run("alice")).toBe("next");
      expect(run("alice")).toBe(429);
      expect(run("bob")).toBe("next");
      expect(run(undefined)).toBe("next"); // ip-keyed bucket unaffected
    } finally {
      process.env.RATE_LIMIT_ENABLED = prev;
    }
  });
});
