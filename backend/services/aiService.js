// ── AI Service ──────────────────────────────────────────
// Box: AI Service (diagram right). Gemini primary, OpenAI secondary, local LLM
// tertiary, offline fallback. Routes call this — never call lib/llm.js or
// lib/gemini.js directly from server.js.
const { z } = require("zod");
const scoring = require("../lib/scoring");
const llm = require("../lib/llm");
const gemini = require("../lib/gemini");

function engineFrom(provider) {
  return provider === "offline" ? "offline" : "llm";
}

function engine() {
  return llm.currentEngine();
}

// Bounds a Gemini call so a slow cloud response can never stall a request.
async function withTimeout(promise, ms) {
  let timer;
  try {
    return await Promise.race([
      promise,
      new Promise((resolve) => {
        timer = setTimeout(() => resolve(null), ms);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

// ── Gemini-powered additive features ────────────────────────────────────────
// scoring.js stays the numeric source of truth; Gemini only adds qualitative
// enrichment. Every feature degrades silently to the offline behavior.

const trimList = (items, cap, maxLen = 160) =>
  (Array.isArray(items) ? items : [])
    .filter((s) => typeof s === "string" && s.trim())
    .map((s) => s.trim().slice(0, maxLen))
    .filter((s, i, arr) => arr.findIndex((t) => t.toLowerCase() === s.toLowerCase()) === i)
    .slice(0, cap);

const InsightsOut = z
  .object({
    strengths: z.array(z.string()).max(5),
    top_gaps: z.array(z.string()).max(5),
    recruiter_summary: z.string().max(400),
  })
  .strip();

const INSIGHTS_SCHEMA = {
  type: "object",
  properties: {
    strengths: { type: "array", items: { type: "string" }, maxItems: 5 },
    top_gaps: { type: "array", items: { type: "string" }, maxItems: 5 },
    recruiter_summary: { type: "string" },
  },
  required: ["strengths", "top_gaps", "recruiter_summary"],
};

const INSIGHTS_SYSTEM = [
  "You are a senior technical recruiter reviewing a CV.",
  "The document contains the CV and optionally the job description.",
  "Return JSON with: strengths (max 5 concrete strengths),",
  "top_gaps (max 5 most important gaps for the target job),",
  "recruiter_summary (max 60 words, honest recruiter's verdict).",
  "Use only what the document supports; never invent employers, dates, or metrics.",
].join("\n");

async function aiInsights(cvText, jdText) {
  const result = await gemini.structured(
    [
      { role: "system", content: INSIGHTS_SYSTEM },
      { role: "user", content: `CV:\n${cvText}${jdText ? `\n\nJOB DESCRIPTION:\n${jdText}` : ""}` },
    ],
    { zodSchema: InsightsOut, jsonSchema: INSIGHTS_SCHEMA, temperature: 0.3, maxTokens: 512, timeoutMs: 15000 }
  );
  if (result.error || !result.data) return null;
  return {
    strengths: trimList(result.data.strengths, 5),
    top_gaps: trimList(result.data.top_gaps, 5),
    recruiter_summary: String(result.data.recruiter_summary || "").trim().slice(0, 400),
  };
}

async function analyzeWithAI(cvText, jdText, opts = {}) {
  const analysis = scoring.analyse(cvText, jdText, opts);
  analysis.detailed = scoring.detailedFeedback(cvText, jdText, analysis);
  // Additive recruiter-style insights; omitted entirely on any failure so the
  // numeric analysis shape stays identical for the UI.
  if (gemini.configured()) {
    const insights = await withTimeout(aiInsights(cvText, jdText), 15000);
    if (insights) analysis.ai_insights = insights;
  }
  return { analysis, engine: "offline-scoring" };
}

async function enhanceWithAI(cvText, jdText) {
  const { analysis } = await analyzeWithAI(cvText, jdText);
  const result = await llm.aiEnhance(cvText, jdText);
  return { analysis, ...result, engine: engineFrom(result.provider) };
}

async function coverLetterWithAI(cvText, jdText, name = "") {
  const result = await llm.aiCoverLetter(cvText, jdText, name);
  return { ...result, engine: engineFrom(result.provider) };
}

async function mockWithAI(cvText, jdText) {
  const result = await llm.aiMockQuestions(cvText, jdText);
  return { ...result, engine: engineFrom(result.provider) };
}

async function practiceWithAI(cvText, jdText) {
  const result = await llm.aiMockQuestions(cvText, jdText);
  const out = {
    questions: result.questions.slice(0, 7),
    engine: engineFrom(result.provider),
    provider: result.provider,
  };
  if (result.error) out.error = result.error;
  return out;
}

function evaluateAnswerOffline(q, a) {
  const low = a.toLowerCase();
  const kws = (q.keywords || []).map((k) => String(k).toLowerCase());
  const hit = kws.filter((k) => k && low.includes(k)).length;
  const kwScore = kws.length ? (hit / kws.length) * 5 : 2.5;
  const starHits = ["situation", "task", "action", "result", "achieved", "built", "improved", "impact"].filter((w) => low.includes(w)).length;
  const starScore = Math.min(2, starHits * 0.5);
  const lenScore = a.length > 80 && a.length < 600 ? 1.5 : a.length > 40 ? 1 : 0.5;
  const metric = /\d+\s*%|\d+\s*(users|members|clients)/i.test(a) ? 1 : 0;
  const total = Math.round(Math.min(10, kwScore + starScore + lenScore + metric) * 10) / 10;
  const missing = kws.filter((k) => k && !low.includes(k)).slice(0, 2);
  return {
    score: total,
    level: total >= 8 ? "Excellent" : total >= 6 ? "Good" : total >= 4 ? "Moderate" : "Weak",
    feedback: total >= 8
      ? "Strong STAR + keywords + metric — interview-ready!"
      : total >= 6
        ? "Add a metric (%, users) and one JD keyword to reach 8+."
        : `Use STAR (Situation → Action → Result)${missing.length ? ` and weave in: ${missing.join(", ")}` : ""}.`,
    matched_kw: hit,
    total_kw: kws.length,
  };
}

async function evaluateAnswer(question, answer) {
  const q = typeof question === "string" ? { q: question, keywords: [] } : question;
  const a = String(answer || "");
  if (a.trim().length < 10) {
    return { ...evaluateAnswerOffline(q, a), score: 0, level: "Weak", feedback: "Too short — aim 4-6 lines (situation → action → result).", provider: "offline" };
  }
  const result = await llm.evaluateAnswer(question, answer);
  if (result.provider && result.provider !== "offline") return result;
  return { ...evaluateAnswerOffline(q, a), provider: "offline" };
}

// Job Matcher: score one CV against MANY JDs, rank best fit. Gemini adds a
// one-sentence rationale to the top 3 (additive; omitted on failure).
const RATIONALES_OUT = z.object({ rationales: z.array(z.string()).max(3) }).strip();
const RATIONALES_SCHEMA = {
  type: "object",
  properties: {
    rationales: { type: "array", items: { type: "string" }, maxItems: 3 },
  },
  required: ["rationales"],
};
const RATIONALES_SYSTEM = [
  "You explain job fit for a recruiter.",
  "The document contains a CV followed by listings named LISTING 1, LISTING 2, LISTING 3 (already fit-ranked).",
  'Return JSON: {"rationales": ["...", "...", "..."]} — one sentence (max 30 words) per listing, same order,',
  "explaining how well the CV fits and the single biggest reason.",
].join("\n");

async function matchJobs(cvText, jobs = []) {
  const rows = jobs.map((j, i) => {
    const jd = typeof j === "string" ? j : j.text || j.jd || "";
    const title = typeof j === "string" ? `Job ${i + 1}` : j.title || `Job ${i + 1}`;
    const a = scoring.analyse(cvText, jd);
    return { title, overall: a.scores.overall, verdict: a.scores.verdict, missing: a.skills.gap.missing.slice(0, 5), skill_coverage: a.scores.skill_coverage, keyword_match: a.scores.keyword_match, _jd: jd };
  });
  rows.sort((a, b) => b.overall - a.overall);

  if (gemini.configured() && rows.length) {
    const top = rows.slice(0, 3);
    const doc = [
      `CV:\n${cvText}`,
      ...top.map((row, i) => `\n\nLISTING ${i + 1} (${row.title}):\n${row._jd || "(no job description provided)"}`),
    ].join("");
    const result = await withTimeout(
      gemini.structured(
        [
          { role: "system", content: RATIONALES_SYSTEM },
          { role: "user", content: doc },
        ],
        { zodSchema: RATIONALES_OUT, jsonSchema: RATIONALES_SCHEMA, temperature: 0.3, maxTokens: 400, timeoutMs: 12000 }
      ),
      13000
    );
    if (result?.data?.rationales) {
      top.forEach((row, i) => {
        const r = String(result.data.rationales[i] || "").trim();
        if (r) row.rationale = r.slice(0, 280);
      });
    }
  }

  const ranking = rows.map(({ _jd, ...rest }) => rest);
  return { engine: "offline-scoring", ranking };
}

// ── Gemini feature endpoints (additive; offline fallback when unconfigured) ─
const SKILLS_OUT = z.object({ skills: z.array(z.string()).max(25) }).strip();
const SKILLS_SCHEMA = {
  type: "object",
  properties: {
    skills: { type: "array", items: { type: "string" }, minItems: 1, maxItems: 25 },
  },
  required: ["skills"],
};
const SKILLS_SYSTEM = [
  "You extract demonstrated skills from a CV.",
  "List the concrete technical and soft skills the document actually evidences.",
  "Never invent skills. Each skill: 1-3 words, no numbering or categories. Max 25.",
  'Return JSON: {"skills": ["..."]}.',
].join("\n");

async function skillsWithAI(cvText) {
  const offline = () => {
    const analysis = scoring.analyse(cvText, "");
    return { skills: (analysis.skills.cv_skills || []).slice(0, 25), engine: "offline-scoring", provider: "offline" };
  };
  if (!gemini.configured()) return offline();
  const result = await gemini.structured(
    [
      { role: "system", content: SKILLS_SYSTEM },
      { role: "user", content: `CV:\n${cvText}` },
    ],
    { zodSchema: SKILLS_OUT, jsonSchema: SKILLS_SCHEMA, temperature: 0.1, maxTokens: 600 }
  );
  if (result.error || !result.data) {
    return { ...offline(), error: result.error || "Gemini returned no usable skills" };
  }
  return { skills: trimList(result.data.skills, 25, 60), engine: "llm", provider: "gemini", model: result.model };
}

const CAREER_OUT = z
  .object({
    target_roles: z.array(z.string()).max(5),
    strengths: z.array(z.string()).max(6),
    gaps: z.array(z.string()).max(6),
    roadmap: z.array(z.string()).max(8),
  })
  .strip();
const CAREER_SCHEMA = {
  type: "object",
  properties: {
    target_roles: { type: "array", items: { type: "string" }, maxItems: 5 },
    strengths: { type: "array", items: { type: "string" }, maxItems: 6 },
    gaps: { type: "array", items: { type: "string" }, maxItems: 6 },
    roadmap: { type: "array", items: { type: "string" }, maxItems: 8 },
  },
  required: ["target_roles", "strengths", "gaps", "roadmap"],
};
const CAREER_SYSTEM = [
  "You are a career coach.",
  "The document contains a CV and optionally a job description and a requested target role.",
  "Return JSON with: target_roles (max 5 realistic next roles), strengths (max 6),",
  "gaps (max 6 skill/experience gaps), roadmap (max 8 short concrete learning steps).",
  "Base everything only on the document; never invent employers, dates, or credentials.",
].join("\n");

async function careerWithAI(cvText, jdText = "", targetRole = "") {
  const analysis = scoring.analyse(cvText, jdText || "");
  const offline = () => ({
    target_roles: targetRole ? [targetRole] : [],
    strengths: analysis.skills.matched.slice(0, 6),
    gaps: analysis.skills.missing.slice(0, 6),
    roadmap: analysis.skills.missing.slice(0, 4).map((s) => `Build a small project using ${s} and add it to your CV.`),
    engine: "offline-scoring",
    provider: "offline",
  });
  if (!gemini.configured()) return offline();
  const doc = [
    `CV:\n${cvText}`,
    jdText ? `\n\nJOB DESCRIPTION:\n${jdText}` : "",
    targetRole ? `\n\nREQUESTED TARGET ROLE: ${targetRole}` : "",
  ].join("");
  const result = await gemini.structured(
    [
      { role: "system", content: CAREER_SYSTEM },
      { role: "user", content: doc },
    ],
    { zodSchema: CAREER_OUT, jsonSchema: CAREER_SCHEMA, temperature: 0.4, maxTokens: 900 }
  );
  if (result.error || !result.data) {
    return { ...offline(), error: result.error || "Gemini returned no usable career plan" };
  }
  return {
    target_roles: trimList(result.data.target_roles, 5),
    strengths: trimList(result.data.strengths, 6),
    gaps: trimList(result.data.gaps, 6),
    roadmap: trimList(result.data.roadmap, 8),
    engine: "llm",
    provider: "gemini",
    model: result.model,
  };
}

module.exports = {
  analyzeWithAI,
  enhanceWithAI,
  coverLetterWithAI,
  mockWithAI,
  practiceWithAI,
  evaluateAnswer,
  matchJobs,
  skillsWithAI,
  careerWithAI,
  engine,
  hasKey: llm.hasKey,
};
