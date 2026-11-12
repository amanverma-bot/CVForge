// ── AI Service ──────────────────────────────────────────
// Box: AI Service (diagram right). OpenAI primary, local LLM secondary, offline fallback.
// Routes call this — never call lib/llm.js directly from server.js.
const scoring = require("../lib/scoring");
const llm = require("../lib/llm");

function engineFrom(provider) {
  return provider === "offline" ? "offline" : "llm";
}

function engine() {
  return llm.currentEngine();
}

async function analyzeWithAI(cvText, jdText, opts = {}) {
  const analysis = scoring.analyse(cvText, jdText, opts);
  analysis.detailed = scoring.detailedFeedback(cvText, jdText, analysis);
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

// Job Matcher: score one CV against MANY JDs, rank best fit.
async function matchJobs(cvText, jobs = []) {
  const rows = jobs.map((j, i) => {
    const jd = typeof j === "string" ? j : j.text || j.jd || "";
    const title = typeof j === "string" ? `Job ${i + 1}` : j.title || `Job ${i + 1}`;
    const a = scoring.analyse(cvText, jd);
    return { title, overall: a.scores.overall, verdict: a.scores.verdict, missing: a.skills.gap.missing.slice(0, 5), skill_coverage: a.scores.skill_coverage, keyword_match: a.scores.keyword_match };
  });
  rows.sort((a, b) => b.overall - a.overall);
  return { engine: "offline-scoring", ranking: rows };
}

module.exports = { analyzeWithAI, enhanceWithAI, coverLetterWithAI, mockWithAI, practiceWithAI, evaluateAnswer, matchJobs, engine, hasKey: llm.hasKey };
