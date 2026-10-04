// ── AI Service ──────────────────────────────────────────
// Box: AI Service (diagram right). LLM when key set, offline scoring fallback.
// Routes call this — never call lib/llm.js directly from server.js.
const scoring = require("../lib/scoring");
const llm = require("../lib/llm");

function engine() { return llm.hasKey() ? "llm" : "offline"; }

async function analyzeWithAI(cvText, jdText, opts = {}) {
  const analysis = scoring.analyse(cvText, jdText, opts);
  analysis.detailed = scoring.detailedFeedback(cvText, jdText, analysis);
  return { analysis, engine: "offline-scoring" };
}

async function enhanceWithAI(cvText, jdText) {
  const { analysis } = await analyzeWithAI(cvText, jdText);
  const enhanced = await llm.aiEnhance(cvText, jdText);
  return { analysis, enhanced, engine: engine() };
}

async function coverLetterWithAI(cvText, jdText, name = "") {
  return { ...(await llm.aiCoverLetter(cvText, jdText, name)), engine: engine() };
}

async function mockWithAI(cvText, jdText) {
  return { ...(await llm.aiMockQuestions(cvText, jdText)), engine: engine() };
}

// Interview practice: questions + offline STAR/keyword scoring (LLM upgrades when key set)
async function practiceWithAI(cvText, jdText) {
  const { questions } = await mockWithAI(cvText, jdText);
  return { questions: questions.slice(0, 7), engine: engine() };
}
function evaluateAnswer(question, answer) {
  const q = typeof question === "string" ? { q: question, keywords: [] } : question;
  const a = String(answer || "");
  if (a.trim().length < 10) return { score: 0, level: "Weak", feedback: "Too short — aim 4-6 lines (situation → action → result)." };
  const low = a.toLowerCase();
  const kws = (q.keywords || []).map(k => String(k).toLowerCase());
  const hit = kws.filter(k => k && low.includes(k)).length;
  const kwScore = kws.length ? hit / kws.length * 5 : 2.5;
  const starHits = ["situation", "task", "action", "result", "achieved", "built", "improved", "impact"].filter(w => low.includes(w)).length;
  const starScore = Math.min(2, starHits * 0.5);
  const lenScore = a.length > 80 && a.length < 600 ? 1.5 : a.length > 40 ? 1 : 0.5;
  const metric = /\d+\s*%|\d+\s*(users|members|clients)/i.test(a) ? 1 : 0;
  const total = Math.round(Math.min(10, kwScore + starScore + lenScore + metric) * 10) / 10;
  const missing = kws.filter(k => k && !low.includes(k)).slice(0, 2);
  return {
    score: total,
    level: total >= 8 ? "Excellent" : total >= 6 ? "Good" : total >= 4 ? "Moderate" : "Weak",
    feedback: total >= 8 ? "Strong STAR + keywords + metric — interview-ready!"
      : total >= 6 ? "Add a metric (%, users) and one JD keyword to reach 8+."
      : `Use STAR (Situation → Action → Result)${missing.length ? ` and weave in: ${missing.join(", ")}` : ""}.`,
    matched_kw: hit, total_kw: kws.length,
  };
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
