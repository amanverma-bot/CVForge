// ── LLM Integration ────────────────────────────────────────────────────────
// OpenAI-compatible LLM client for AI-enhanced features.
// Degrades gracefully when no API key is configured.
// Uses native fetch (Node 18+).

let apiKey = process.env.OPENAI_API_KEY || "";
let model = process.env.OPENAI_MODEL || "gpt-4o-mini";
let baseUrl = process.env.OPENAI_BASE_URL || "https://api.openai.com/v1";

function configure(key, mdl, base) {
  if (key) apiKey = key;
  if (mdl) model = mdl;
  if (base) baseUrl = base;
}

function hasKey() {
  const key = (apiKey || "").trim();
  if (!key) return false;
  // Reject .env placeholders such as sk-<your-openai-api-key> so health checks stay truthful.
  if (key.includes("<") || key.includes(">")) return false;
  if (/^your[-_ ]?/i.test(key)) return false;
  return true;
}

async function chat(messages, options = {}) {
  if (!hasKey()) {
    return { content: null, error: "No LLM API key configured" };
  }
  try {
    const resp = await fetch(`${baseUrl.replace(/\/$/, "")}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: options.model || model,
        messages,
        temperature: options.temperature ?? 0.7,
        max_tokens: options.maxTokens ?? 1000,
      }),
      signal: AbortSignal.timeout(options.timeoutMs ?? 30000),
    });
    if (!resp.ok) {
      const errText = await resp.text().catch(() => "");
      throw new Error(`LLM API error (${resp.status}): ${errText}`);
    }
    const data = await resp.json();
    return {
      content: data.choices?.[0]?.message?.content || null,
      usage: data.usage,
      model: data.model,
    };
  } catch (err) {
    return { content: null, error: err.message };
  }
}

async function aiEnhance(cvText, jdText) {
  const result = await chat(
    [
      {
        role: "system",
        content:
          "You are a professional resume writer. Enhance the CV text to better match the job description. Use strong action verbs, quantify achievements, and keep it honest. Return ONLY the enhanced CV text, no explanations.",
      },
      {
        role: "user",
        content: `CV:\n${cvText}\n\nJob Description:\n${jdText}`,
      },
    ],
    { temperature: 0.5, maxTokens: 1500 }
  );
  if (result.error) return { enhanced: cvText, error: result.error };
  return { enhanced: result.content || cvText };
}

async function aiCoverLetter(cvText, jdText, name = "") {
  const result = await chat(
    [
      {
        role: "system",
        content:
          "You are a professional cover letter writer. Write a compelling, personalized cover letter based on the CV and job description. Keep it to 3-4 paragraphs, professional tone.",
      },
      {
        role: "user",
        content: `CV:\n${cvText}\n\nJob Description:\n${jdText}\n\nApplicant Name: ${name || "Applicant"}`,
      },
    ],
    { temperature: 0.6, maxTokens: 800 }
  );
  if (result.error) return { coverLetter: null, error: result.error };
  return { coverLetter: result.content || null };
}

async function aiMockQuestions(cvText, jdText) {
  const result = await chat(
    [
      {
        role: "system",
        content:
          "You are an interview coach. Generate 7 interview questions based on the CV and job description. Include behavioral and technical questions. Return as a JSON array of objects with 'q', 'type', 'tip', and 'keywords' fields.",
      },
      {
        role: "user",
        content: `CV:\n${cvText}\n\nJob Description:\n${jdText}`,
      },
    ],
    { temperature: 0.6, maxTokens: 1500 }
  );
  if (result.error) {
    return {
      questions: generateFallbackQuestions(cvText, jdText),
      error: result.error,
    };
  }
  try {
    const parsed = JSON.parse(result.content || "[]");
    return { questions: parsed || generateFallbackQuestions(cvText, jdText) };
  } catch {
    return { questions: generateFallbackQuestions(cvText, jdText) };
  }
}

function generateFallbackQuestions(cvText, jdText) {
  const skills = (cvText.match(/(python|javascript|react|node|sql|aws|docker|java|c\+\+|ruby|php|go|rust)/gi) || [])
    .slice(0, 3);
  return [
    { q: "Tell me about yourself and your background.", type: "behavioral", tip: "Keep it under 2 minutes, focus on relevant experience.", keywords: ["experience", "background"] },
    { q: "What interests you about this role?", type: "behavioral", tip: "Connect your skills to the job requirements.", keywords: ["interest", "motivation"] },
    { q: `Describe a challenging project you worked on involving ${skills[0] || "your skills"}.`, type: "technical", tip: "Use STAR method: Situation, Task, Action, Result.", keywords: skills.slice(0, 2) },
    { q: "How do you handle tight deadlines and multiple priorities?", type: "behavioral", tip: "Give a specific example with a positive outcome.", keywords: ["prioritization", "time management"] },
    { q: "What is your greatest professional achievement?", type: "behavioral", tip: "Quantify your impact with numbers where possible.", keywords: ["achievement", "metrics"] },
    { q: "How do you stay current with new technologies?", type: "technical", tip: "Mention specific resources, courses, or projects.", keywords: ["learning", "technology"] },
    { q: "Do you have any questions for us?", type: "behavioral", tip: "Ask about team, challenges, growth opportunities.", keywords: ["questions"] },
  ];
}

async function evaluateAnswer(question, answer) {
  if (!answer || answer.trim().length < 10) {
    return { score: 0, level: "Weak", feedback: "Too short — aim for 4-6 sentences using STAR method." };
  }
  const result = await chat(
    [
      {
        role: "system",
        content:
          "You are an interview evaluator. Score the candidate's answer from 0-10 based on relevance, completeness, and communication. Provide brief feedback and a score. Return JSON with 'score' (0-10), 'level' (Weak/Moderate/Good/Excellent), and 'feedback' (1-2 sentences).",
      },
      {
        role: "user",
        content: `Question: ${question}\nAnswer: ${answer}`,
      },
    ],
    { temperature: 0.3, maxTokens: 300 }
  );
  if (result.error) {
    return evaluateAnswerOffline(question, answer);
  }
  try {
    return JSON.parse(result.content || "{}");
  } catch {
    return evaluateAnswerOffline(question, answer);
  }
}

function evaluateAnswerOffline(question, answer) {
  const low = answer.toLowerCase();
  const starWords = ["situation", "task", "action", "result", "achieved", "built", "improved", "impact"];
  const starHits = starWords.filter((w) => low.includes(w)).length;
  const hasMetric = /\d+\s*%|\d+\s*(users|members|clients|percent)/i.test(answer);
  const lengthScore = answer.length > 80 && answer.length < 600 ? 2 : answer.length > 40 ? 1 : 0;
  const starScore = Math.min(2, starHits * 0.5);
  const metricScore = hasMetric ? 1 : 0;
  const total = Math.min(10, Math.round((lengthScore + starScore + metricScore) * 2) / 2);
  return {
    score: total,
    level: total >= 8 ? "Excellent" : total >= 6 ? "Good" : total >= 4 ? "Moderate" : "Weak",
    feedback: total >= 8
      ? "Strong answer with good structure and detail."
      : total >= 6
        ? "Good answer — add more specific metrics to reach 8+."
        : "Use STAR method (Situation, Task, Action, Result) and include metrics.",
  };
}

module.exports = {
  configure,
  hasKey,
  chat,
  aiEnhance,
  aiCoverLetter,
  aiMockQuestions,
  evaluateAnswer,
  generateFallbackQuestions,
};