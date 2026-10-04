// LLM wrapper: uses OpenAI-compatible API when OPENAI_API_KEY set,
// otherwise falls back to offline scoring + templates (no key needed).
const scoring = require("./scoring");

function hasKey() { return !!process.env.OPENAI_API_KEY; }

async function llmChat(messages, maxTokens = 800) {
  const base = (process.env.OPENAI_BASE_URL || "https://api.openai.com/v1").replace(/\/$/, "");
  const model = process.env.OPENAI_MODEL || "gpt-4o-mini";
  const resp = await fetch(`${base}/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
    body: JSON.stringify({ model, messages, max_tokens: maxTokens, temperature: 0.4 }),
  });
  if (!resp.ok) throw new Error(`LLM ${resp.status}`);
  const j = await resp.json();
  return j.choices?.[0]?.message?.content?.trim() || "";
}

async function aiEnhance(cvText, jdText) {
  const res = scoring.analyse(cvText, jdText);
  if (!hasKey()) return { ...scoring.enhanceCV(cvText, jdText, res), llm: false };
  try {
    const out = await llmChat([
      { role: "system", content: "You rewrite resume bullets with STAR + metrics + JD keywords. Mark unproven skills as (Familiar). Return JSON {bullets[], summary, skills_line, fixes[]}." },
      { role: "user", content: `CV:\n${cvText.slice(0, 4000)}\n\nJD:\n${jdText.slice(0, 3000)}` },
    ]);
    const m = out.match(/\{[\s\S]*\}/);
    if (m) { const j = JSON.parse(m[0]); return { enhanced_bullets: j.bullets || [], enhanced_summary: j.summary || "", enhanced_skills_line: j.skills_line || "", fixes: j.fixes || [], predicted_score: Math.min(95, res.scores.overall + 12), boost: 12, llm: true, enhanced_full: (j.bullets || []).join("\n") }; }
  } catch { /* fall through */ }
  return { ...scoring.enhanceCV(cvText, jdText, res), llm: false };
}

async function aiCoverLetter(cvText, jdText, name = "") {
  if (!hasKey()) {
    const cvS = scoring.extractSkills ? require("./scoring").analyse(cvText, jdText) : null;
    return { letter: `Dear Hiring Manager,\n\nI am excited to apply. ${name || "Applicant"} brings ${((cvS && cvS.skills.cv_skills.slice(0, 4).join(", ")) || "relevant skills")} matching your requirements.\n\nSincerely,\n${name || "Applicant"}`, llm: false };
  }
  const out = await llmChat([
    { role: "system", content: "Write a concise tailored cover letter (200-280 words) mirroring JD keywords with 3 quantified bullets." },
    { role: "user", content: `Name: ${name}\nCV:\n${cvText.slice(0, 3500)}\nJD:\n${jdText.slice(0, 2500)}` },
  ], 600);
  return { letter: out, llm: true };
}

async function aiMockQuestions(cvText, jdText) {
  if (!hasKey()) {
    const res = scoring.analyse(cvText, jdText);
    const gap = res.skills.gap;
    const qs = [];
    if (gap.matched[0]) qs.push({ q: `Explain your experience with ${gap.matched[0]} — where did you use it?`, type: "Technical", tip: "STAR + metric" });
    if (gap.missing[0]) qs.push({ q: `JD requires ${gap.missing[0]} — how would you ramp up quickly?`, type: "Technical (Gap)", tip: "Learning plan + mini-project" });
    qs.push({ q: "Tell me about a time you optimized performance or solved a critical bug.", type: "Behavioral (STAR)", tip: "STAR + % metric" });
    qs.push({ q: "Describe your main project — role, stack, impact.", type: "Project Deep-Dive", tip: "Quantify users/load time" });
    qs.push({ q: "Why do you want to join us for this role?", type: "HR", tip: "Mirror JD phrasing" });
    return { questions: qs.slice(0, 7), llm: false };
  }
  const out = await llmChat([
    { role: "system", content: "Generate 7 tailored mock interview questions as JSON array [{q,type,tip}]: 2 technical, 1 gap, 2 behavioral, 1 project, 1 HR." },
    { role: "user", content: `CV:\n${cvText.slice(0, 3500)}\nJD:\n${jdText.slice(0, 2500)}` },
  ]);
  try { const m = out.match(/\[[\s\S]*\]/); if (m) return { questions: JSON.parse(m[0]).slice(0, 7), llm: true }; } catch { /* noop */ }
  return aiMockQuestions(cvText, jdText);
}

module.exports = { hasKey, aiEnhance, aiCoverLetter, aiMockQuestions };
