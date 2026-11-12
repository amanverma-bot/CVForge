// Integration + security tests (supertest against the real Express app, memory store).
// Covers: auth on every route, captcha flow, IDOR ownership, validation, upload sniffing,
// CORS lockdown, security headers, JSON error shapes.
import { describe, it, expect, vi } from "vitest";
import request from "supertest";
import { createRequire } from "node:module";
import app from "../app.js";

const require = createRequire(import.meta.url);
const parser = require("../services/parserService.js");

const api = request(app);
const uniq = () => Math.random().toString(36).slice(2, 8);

async function freshCaptcha() {
  const res = await api.get("/api/captcha");
  expect(res.status).toBe(200);
  return res.body;
}

function solve(question) {
  const [, a, b] = question.match(/(\d+)\s*\+\s*(\d+)/) || [0, 0, 0];
  return Number(a) + Number(b);
}

async function register(name, password = "Passw0rd!123") {
  const cap = await freshCaptcha();
  return api.post("/api/auth/register").send({ name, email: `${name}@example.com`, password, confirm_password: password, captcha_token: cap.token, captcha_answer: solve(cap.question) });
}

describe("System & headers", () => {
  it("GET /api/health is public and reports actual provider status", async () => {
    const res = await api.get("/api/health");
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(typeof res.body.mongo).toBe("boolean");
    expect(typeof res.body.llm).toBe("boolean");
    expect(res.body.ai.active).toBe("offline");
    expect(res.body.llm).toBe(false);
    expect(res.body.ai.providers.openai.configured).toBe(false);
    expect(res.body.ai.providers.local.configured).toBe(false);
  });

  it("sends hardened security headers and hides x-powered-by", async () => {
    const res = await api.get("/api/health");
    expect(res.headers["x-content-type-options"]).toBe("nosniff");
    expect(res.headers["content-security-policy"]).toContain("default-src 'self'");
    expect(res.headers["content-security-policy"]).toContain("https://identitytoolkit.googleapis.com");
    expect(res.headers["content-security-policy"]).toContain("frame-src 'self' https://accounts.google.com");
    expect(res.headers["cross-origin-opener-policy"]).toBe("same-origin-allow-popups");
    expect(res.headers["x-frame-options"]).toBe("DENY");
    expect(res.headers["x-powered-by"]).toBeUndefined();
  });

  it("unknown API routes return JSON 404", async () => {
    const res = await api.get("/api/does-not-exist");
    expect(res.status).toBe(404);
    expect(res.body.error).toBe("Not found");
  });

  it("malformed JSON gets a JSON 400 (not an HTML crash page)", async () => {
    const res = await api.post("/api/auth/login").set("Content-Type", "application/json").send('{"broken":');
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("Malformed JSON body");
  });

  it("blocks unknown CORS origins", async () => {
    const res = await api.get("/api/health").set("Origin", "https://evil.example.com");
    expect(res.status).toBe(403);
    expect(res.body.error).toBe("Origin not allowed");
  });

  it("allows ngrok tunnel origins only when ALLOW_TUNNEL_ORIGINS=true", async () => {
    const origin = "https://demo-test.ngrok-free.dev";
    process.env.ALLOW_TUNNEL_ORIGINS = "true";
    try {
      const res = await api.get("/api/health").set("Origin", origin);
      expect(res.status).toBe(200);
      expect(res.headers["access-control-allow-origin"]).toBe(origin);
    } finally {
      delete process.env.ALLOW_TUNNEL_ORIGINS;
    }
    const blocked = await api.get("/api/health").set("Origin", origin);
    expect(blocked.status).toBe(403);
  });
});

describe("Auth: captcha, register, login", () => {
  it("register is rejected without a valid captcha", async () => {
    const cap = await freshCaptcha();
    const n = `u${uniq()}`;
    const res = await api.post("/api/auth/register").send({ name: n, email: `${n}@example.com`, password: "Passw0rd!123", confirm_password: "Passw0rd!123", captcha_token: cap.token, captcha_answer: solve(cap.question) + 1 });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/captcha/i);
  });

  it("captcha tokens are single-use", async () => {
    const cap = await freshCaptcha();
    const n = `u${uniq()}`;
    const body = { name: n, email: `${n}@example.com`, password: "Passw0rd!123", confirm_password: "Passw0rd!123", captcha_token: cap.token, captcha_answer: solve(cap.question) };
    const first = await api.post("/api/auth/register").send(body);
    expect(first.status).toBe(201);
    const second = await api.post("/api/auth/register").send({ ...body, name: `u${uniq()}` });
    expect(second.status).toBe(400);
  });

  it("enforces password policy with detailed validation errors", async () => {
    const cap = await freshCaptcha();
    const n = `u${uniq()}`;
    const res = await api.post("/api/auth/register").send({ name: n, email: `${n}@example.com`, password: "short", confirm_password: "short", captcha_token: cap.token, captcha_answer: solve(cap.question) });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("Validation failed");
    expect(res.body.details.some((d) => d.path === "password")).toBe(true);
  });

  it("register + login + me round-trip works", async () => {
    const name = `user${uniq()}`;
    const reg = await register(name);
    expect(reg.status).toBe(201);
    expect(reg.body.token).toBeTruthy();

    const bad = await api.post("/api/auth/login").send({ name, password: "wrong-password" });
    expect(bad.status).toBe(401);

    const login = await api.post("/api/auth/login").send({ name, password: "Passw0rd!123" });
    expect(login.status).toBe(200);

    const me = await api.get("/api/auth/me").set("Authorization", `Bearer ${login.body.token}`);
    expect(me.status).toBe(200);
    expect(me.body.user.username).toBe(name);
  });

  it("rejects duplicate registrations with 409", async () => {
    const name = `dup${uniq()}`;
    expect((await register(name)).status).toBe(201);
    expect((await register(name)).status).toBe(409);
  });

  it("server-side logout revokes previously issued JWTs", async () => {
    const name = `out${uniq()}`;
    const reg = await register(name);
    expect(reg.status).toBe(201);
    const token = reg.body.token;

    expect((await api.get("/api/auth/me").set("Authorization", `Bearer ${token}`)).status).toBe(200);
    expect((await api.post("/api/auth/logout").set("Authorization", `Bearer ${token}`)).status).toBe(204);
    expect((await api.get("/api/auth/me").set("Authorization", `Bearer ${token}`)).status).toBe(401);

    // Password login after logout issues a token with the new version.
    const login = await api.post("/api/auth/login").send({ name, password: "Passw0rd!123" });
    expect(login.status).toBe(200);
    expect((await api.get("/api/auth/me").set("Authorization", `Bearer ${login.body.token}`)).status).toBe(200);
  });

  it("logout requires authentication", async () => {
    expect((await api.post("/api/auth/logout")).status).toBe(401);
  });

  it("rejects expired JWTs", async () => {
    const jwt = require("jsonwebtoken");
    const expired = jwt.sign(
      { id: "expired-user", name: "expired", role: "free", ver: 0 },
      process.env.JWT_SECRET,
      { expiresIn: -1, issuer: "cvforge", subject: "expired-user" }
    );
    const res = await api.get("/api/auth/me").set("Authorization", `Bearer ${expired}`);
    expect(res.status).toBe(401);
    expect(res.body.error).toMatch(/invalid or expired/i);
  });
});

describe("Auth on every API route (no anonymous access)", () => {
  const protectedRoutes = [
    ["post", "/api/analyze"],
    ["post", "/api/quickfix"],
    ["post", "/api/build"],
    ["post", "/api/jd-breakdown"],
    ["post", "/api/jd-cv"],
    ["post", "/api/enhance"],
    ["post", "/api/cover-letter"],
    ["post", "/api/mock-interview"],
    ["post", "/api/match"],
    ["post", "/api/grammar"],
    ["post", "/api/practice"],
    ["post", "/api/practice/evaluate"],
    ["post", "/api/pdf"],
    ["post", "/api/docx"],
    ["get", "/api/cvs"],
    ["get", "/api/history"],
    ["get", "/api/applications"],
    ["get", "/api/me/export"],
    ["get", "/api/architecture"],
  ];

  it.each(protectedRoutes)("%s %s without token → 401", async (method, path) => {
    const res = await api[method](path).send({});
    expect(res.status).toBe(401);
    expect(res.body.error).toMatch(/auth/i);
  });

  it("public routes stay public (demo, share read)", async () => {
    expect((await api.get("/api/demo")).status).toBe(200);
    expect((await api.get("/api/share/deadbeefdeadbeef")).status).toBe(404); // valid token format, unknown share
  });
});

describe("IDOR protection (users cannot touch each other's data)", () => {
  it("user B cannot read, share or analyze user A's CV/history", async () => {
    const nameA = `a${uniq()}`;
    const nameB = `b${uniq()}`;
    const regA = await register(nameA);
    const regB = await register(nameB);
    const tokenA = regA.body.token;
    const tokenB = regB.body.token;

    const created = await api
      .post("/api/cvs")
      .set("Authorization", `Bearer ${tokenA}`)
      .send({ name: "A's CV", skills: "Python", template: "brutal" });
    expect(created.status).toBe(201);
    const cvId = created.body.id;

    // B reading A's CV → 404 (not 403 — existence is hidden too)
    const readB = await api.get(`/api/cvs/${cvId}`).set("Authorization", `Bearer ${tokenB}`);
    expect(readB.status).toBe(404);

    // B sharing/revoking A's CV → 404
    expect((await api.post(`/api/cvs/${cvId}/share`).set("Authorization", `Bearer ${tokenB}`).send({})).status).toBe(404);
    expect((await api.delete(`/api/cvs/${cvId}/share`).set("Authorization", `Bearer ${tokenB}`)).status).toBe(404);

    // B saving a history entry pointing at A's CV → 404 (cvId ownership check)
    const hist = await api
      .post("/api/history")
      .set("Authorization", `Bearer ${tokenB}`)
      .send({ cv_text: "cv", jd_text: "jd", cvId });
    expect(hist.status).toBe(404);

    // A can read their own CV
    const readA = await api.get(`/api/cvs/${cvId}`).set("Authorization", `Bearer ${tokenA}`);
    expect(readA.status).toBe(200);

    // B's list does not include A's CV
    const listB = await api.get("/api/cvs").set("Authorization", `Bearer ${tokenB}`);
    expect(listB.body.items.some((c) => String(c._id || c.id) === String(cvId))).toBe(false);
  });

  it("invalid ids return 404 (no CastError 500 leakage)", async () => {
    const reg = await register(`c${uniq()}`);
    const res = await api.get("/api/cvs/not-an-object-id%20%21%21").set("Authorization", `Bearer ${reg.body.token}`);
    expect([400, 404]).toContain(res.status);
  });

  it("user B cannot patch or delete user A's application", async () => {
    const regA = await register(`ap${uniq()}`);
    const regB = await register(`bp${uniq()}`);
    const created = await api
      .post("/api/applications")
      .set("Authorization", `Bearer ${regA.body.token}`)
      .send({ title: "Backend Intern" });
    expect(created.status).toBe(201);
    const appId = created.body.id;
    expect((await api.patch(`/api/applications/${appId}`).set("Authorization", `Bearer ${regB.body.token}`).send({ status: "offer" })).status).toBe(404);
    expect((await api.delete(`/api/applications/${appId}`).set("Authorization", `Bearer ${regB.body.token}`)).status).toBe(404);
  });
});

describe("Validation & upload hardening", () => {
  let token;
  it("setup: register a user", async () => {
    const reg = await register(`v${uniq()}`);
    token = reg.body.token;
    expect(token).toBeTruthy();
  });

  it("rejects oversized cv_text fields (zod max length)", async () => {
    const res = await api
      .post("/api/quickfix")
      .set("Authorization", `Bearer ${token}`)
      .send({ cv_text: "x".repeat(30001) });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("Validation failed");
  });

  it("rejects mismatched file content (renamed non-PDF) with 415", async () => {
    const res = await api
      .post("/api/analyze")
      .set("Authorization", `Bearer ${token}`)
      .attach("cv_file", Buffer.from("<html>not a pdf</html>"), "cv.pdf");
    expect(res.status).toBe(415);
  });

  it("rejects disallowed extensions with 415", async () => {
    const res = await api.post("/api/analyze").set("Authorization", `Bearer ${token}`).attach("cv_file", Buffer.from("MZ...."), "cv.exe");
    expect(res.status).toBe(415);
  });

  it("accepts real text analysis and returns bounded scores", async () => {
    const res = await api
      .post("/api/analyze")
      .set("Authorization", `Bearer ${token}`)
      .send({ cv_text: "Aman Verma\naman@mail.com\nEXPERIENCE\nBuilt REST API with Flask for 500 users\nSKILLS\nPython, React, MongoDB", jd_text: "We need Python, Flask, Docker, AWS and communication skills for a junior developer role." });
    expect(res.status).toBe(200);
    expect(res.body.scores.overall).toBeGreaterThanOrEqual(0);
    expect(res.body.scores.overall).toBeLessThanOrEqual(100);
  });

  it("rejects invalid template values by coercing to the server default", async () => {
    const res = await api
      .post("/api/cvs")
      .set("Authorization", `Bearer ${token}`)
      .send({ name: "Template Test", template: "definitely-not-a-template" });
    expect(res.status).toBe(201);
    const fetched = await api.get(`/api/cvs/${res.body.id}`).set("Authorization", `Bearer ${token}`);
    expect(fetched.body.template).toBe("modern");
  });

  it("strips unknown fields instead of persisting them", async () => {
    const res = await api
      .post("/api/cvs")
      .set("Authorization", `Bearer ${token}`)
      .send({ name: "Safe", admin: true, $set: { hacked: true } });
    expect(res.status).toBe(201);
    const fetched = await api.get(`/api/cvs/${res.body.id}`).set("Authorization", `Bearer ${token}`);
    expect(fetched.body.admin).toBeUndefined();
  });
});

describe("Account lifecycle & CV updates", () => {
  it("register/login responses include the user id used by the client", async () => {
    const reg = await register(`u${uniq()}`);
    expect(reg.status).toBe(201);
    expect(reg.body.user.id).toBeTruthy();
    expect(reg.body.user.name).toBe(reg.body.name);

    const login = await api.post("/api/auth/login").send({ name: reg.body.name, password: "Passw0rd!123" });
    expect(login.status).toBe(200);
    expect(login.body.user.id).toBe(reg.body.user.id);
  });

  it("a token stops working after the account is deleted", async () => {
    const reg = await register(`del${uniq()}`);
    const token = reg.body.token;
    expect((await api.get("/api/cvs").set("Authorization", `Bearer ${token}`)).status).toBe(200);
    expect((await api.delete("/api/me").set("Authorization", `Bearer ${token}`)).status).toBe(200);
    const after = await api.get("/api/cvs").set("Authorization", `Bearer ${token}`);
    expect(after.status).toBe(401);
  });

  it("PATCH /api/cvs/:id updates owned fields and preserves others", async () => {
    const reg = await register(`p${uniq()}`);
    const token = reg.body.token;
    const created = await api.post("/api/cvs").set("Authorization", `Bearer ${token}`).send({
      name: "Old Name", email: "old@example.com", skills: "JS", template: "modern",
    });
    expect(created.status).toBe(201);
    const patched = await api
      .patch(`/api/cvs/${created.body.id}`)
      .set("Authorization", `Bearer ${token}`)
      .send({ name: "New Name", skills: "JS, Python" });
    expect(patched.status).toBe(200);
    expect(patched.body.personalInfo.name).toBe("New Name");
    expect(patched.body.personalInfo.email).toBe("old@example.com");
    expect(patched.body.skills).toBe("JS, Python");

    const other = await register(`q${uniq()}`);
    const denied = await api.patch(`/api/cvs/${created.body.id}`).set("Authorization", `Bearer ${other.body.token}`).send({ name: "Hijack" });
    expect(denied.status).toBe(404);
  });
});

describe("SSRF guard on JD URL import", () => {
  it.each([
    "http://127.0.0.1/x",
    "http://localhost:5001/",
    "http://169.254.169.254/latest/meta-data/",
    "http://10.0.0.5/",
    "http://192.168.1.1/",
    "http://[::1]/",
    "file:///etc/passwd",
    "ftp://example.com/x",
  ])("blocks %s", async (url) => {
    const { fetchJDFromURL } = await import("../services/parserService.js");
    expect(await fetchJDFromURL(url, 2000)).toBe("");
  });
});

describe("JD URL import endpoint", () => {
  it("requires authentication", async () => {
    const res = await api.post("/api/jd-import").send({ url: "https://jobs.example.com/role" });
    expect(res.status).toBe(401);
  });

  it("rejects an invalid URL", async () => {
    const reg = await register(`jdi${uniq()}`);
    const res = await api
      .post("/api/jd-import")
      .set("Authorization", `Bearer ${reg.body.token}`)
      .send({ url: "not-a-url" });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("Validation failed");
  });

  it("blocks private and loopback URLs without fetching", async () => {
    const reg = await register(`jdp${uniq()}`);
    const res = await api
      .post("/api/jd-import")
      .set("Authorization", `Bearer ${reg.body.token}`)
      .send({ url: "http://127.0.0.1/private-jd" });
    expect(res.status).toBe(422);
    expect(res.body.error).toMatch(/could not import/i);
  });

  it("returns extracted JD text from a public URL", async () => {
    const reg = await register(`jds${uniq()}`);
    const spy = vi.spyOn(parser, "fetchJDFromURL").mockResolvedValue(
      "We are hiring a Python engineer with Flask, SQL, and Docker experience."
    );
    try {
      const res = await api
        .post("/api/jd-import")
        .set("Authorization", `Bearer ${reg.body.token}`)
        .send({ url: "https://jobs.example.com/python-engineer" });
      expect(res.status).toBe(200);
      expect(res.body.text).toMatch(/Python engineer/);
      expect(res.body.length).toBeGreaterThan(30);
      expect(spy).toHaveBeenCalledWith("https://jobs.example.com/python-engineer");
    } finally {
      spy.mockRestore();
    }
  });
});

describe("PDF/DOCX upload extraction (regression)", () => {
  async function makePdf(text = "John Doe Python Developer") {
    const { PDFDocument, StandardFonts } = await import("pdf-lib");
    const pdf = await PDFDocument.create();
    const page = pdf.addPage();
    if (text) {
      const font = await pdf.embedFont(StandardFonts.Helvetica);
      page.drawText(text, { x: 50, y: 700, size: 14, font });
    }
    return Buffer.from(await pdf.save());
  }

  async function makeDocx(text = "Jane Doe TypeScript Engineer") {
    const { Document, Packer, Paragraph, TextRun } = await import("docx");
    const doc = new Document({
      sections: [{ children: [new Paragraph({ children: [new TextRun(text)] })] }],
    });
    return Buffer.from(await Packer.toBuffer(doc));
  }

  it("extracts text from a real PDF through /api/analyze", async () => {
    const reg = await register(`pdf${uniq()}`);
    const res = await api
      .post("/api/analyze")
      .set("Authorization", `Bearer ${reg.body.token}`)
      .attach("cv_file", await makePdf(), "cv.pdf")
      .field("jd_text", "Python developer with REST API, React and SQL experience required.");
    expect(res.status).toBe(200);
    expect(res.body.scores.overall).toBeGreaterThanOrEqual(0);
  });

  it("extracts text from a real DOCX through /api/analyze", async () => {
    const reg = await register(`docx${uniq()}`);
    const res = await api
      .post("/api/analyze")
      .set("Authorization", `Bearer ${reg.body.token}`)
      .attach("cv_file", await makeDocx(), "cv.docx")
      .field("jd_text", "TypeScript engineer with React, Node.js and SQL experience.");
    expect(res.status).toBe(200);
    expect(res.body.scores.overall).toBeGreaterThanOrEqual(0);
  });

  it("rejects an empty/scanned PDF with a clean 422", async () => {
    const reg = await register(`scan${uniq()}`);
    const res = await api
      .post("/api/analyze")
      .set("Authorization", `Bearer ${reg.body.token}`)
      .attach("cv_file", await makePdf(""), "scanned.pdf")
      .field("jd_text", "Any job description that is long enough to pass validation.");
    expect(res.status).toBe(422);
    expect(res.body.error).toMatch(/no readable text/i);
  });
});

describe("Upload error contract", () => {
  it("maps an unexpected multipart field to 400 rather than 500", async () => {
    const reg = await register(`extra${uniq()}`);
    const res = await api
      .post("/api/analyze")
      .set("Authorization", `Bearer ${reg.body.token}`)
      .attach("wrong_field", Buffer.from("hello"), "notes.txt")
      .field("jd_text", "A sufficiently long job description for validation purposes.");
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("Unexpected file field");
  });
});
