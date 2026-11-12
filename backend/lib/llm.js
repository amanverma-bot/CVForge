// ── LLM Integration ────────────────────────────────────────────────────────
// OpenAI-compatible LLM client with OpenAI primary, local secondary, and
// graceful offline fallbacks. Uses native fetch (Node 18+).
const env = require("../config/env");

const DEFAULT_BASE_URL = "https://api.openai.com/v1";
const DEFAULT_LOCAL_BASE_URL = "http://127.0.0.1:11434/v1";
const DEFAULT_MODEL = "gpt-4o-mini";
const DEFAULT_LOCAL_MODEL = "llama3.2";

let apiKey = env.OPENAI_API_KEY || "";
let model = env.OPENAI_MODEL || DEFAULT_MODEL;
let baseUrl = normalizeBaseUrl(env.OPENAI_BASE_URL) || DEFAULT_BASE_URL;

let localEnabled = env.LOCAL_LLM_ENABLED !== false;
let localBaseUrl = normalizeBaseUrl(env.LOCAL_LLM_BASE_URL, DEFAULT_LOCAL_BASE_URL) || DEFAULT_LOCAL_BASE_URL;
let localModel = env.LOCAL_LLM_MODEL || DEFAULT_LOCAL_MODEL;
let localApiKey = env.LOCAL_LLM_API_KEY || "";

const requestTimeoutMs = env.LLM_TIMEOUT_MS || 30000;
const localTimeoutMs = env.LOCAL_LLM_TIMEOUT_MS || 60000;
const healthTimeoutMs = env.LLM_HEALTH_TIMEOUT_MS || 2500;
const healthCacheMs = env.LLM_HEALTH_CACHE_MS || 30000;

const PROVIDERS = {
  openai: { label: "OpenAI", kind: "cloud" },
  local: { label: "Local LLM", kind: "local" },
};

const providerHealth = {
  openai: { available: null, checkedAt: 0, lastSuccessAt: 0, lastError: null, model: null },
  local: { available: null, checkedAt: 0, lastSuccessAt: 0, lastError: null, model: null },
};

let activeProvider = "offline";
let healthCheckedAt = 0;
let healthSource = "startup";
let healthLastSuccessAt = 0;
let healthInFlight = null;
let healthGeneration = 0;

function normalizeBaseUrl(raw, fallback = DEFAULT_BASE_URL) {
  const value = String(raw || "").trim();
  if (!value) return fallback;
  try {
    const parsed = new URL(value);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return null;
    return value.replace(/\/+$/, "");
  } catch {
    return null;
  }
}

function configure(key, mdl, base) {
  if (key !== undefined) apiKey = String(key ?? "").trim();
  if (mdl !== undefined) model = String(mdl || "").trim() || DEFAULT_MODEL;
  if (base !== undefined) baseUrl = normalizeBaseUrl(base) || DEFAULT_BASE_URL;
  resetHealth();
}

function configureLocal(base, mdl, key) {
  if (base !== undefined) {
    const raw = String(base ?? "").trim();
    if (!raw) {
      localEnabled = false;
    } else {
      const next = normalizeBaseUrl(raw, DEFAULT_LOCAL_BASE_URL);
      if (next) {
        localBaseUrl = next;
        localEnabled = true;
      }
    }
  }
  if (mdl !== undefined) localModel = String(mdl || "").trim() || DEFAULT_LOCAL_MODEL;
  if (key !== undefined) localApiKey = String(key ?? "").trim();
  resetHealth();
}

function hasKey() {
  const key = (apiKey || "").trim();
  if (!key) return false;
  if (key.includes("<") || key.includes(">")) return false;
  if (/^your[-_ ]?/i.test(key)) return false;
  return true;
}

function isLocalConfigured() {
  return localEnabled && Boolean(localBaseUrl);
}

function resetHealth() {
  healthGeneration++;
  activeProvider = "offline";
  healthCheckedAt = 0;
  healthSource = "startup";
  healthLastSuccessAt = 0;
  healthInFlight = null;
  providerHealth.openai = { available: null, checkedAt: 0, lastSuccessAt: 0, lastError: null, model: null };
  providerHealth.local = { available: null, checkedAt: 0, lastSuccessAt: 0, lastError: null, model: null };
}

function providerConfig(name) {
  if (name === "openai") {
    return { name, label: "OpenAI", baseUrl, apiKey, model, timeoutMs: requestTimeoutMs, configured: hasKey() };
  }
  return {
    name,
    label: "Local LLM",
    baseUrl: localBaseUrl,
    apiKey: localApiKey,
    model: localModel,
    timeoutMs: localTimeoutMs,
    configured: isLocalConfigured(),
  };
}

function httpError(status, label) {
  if (status === 401 || status === 403) return `${label} authentication failed (${status})`;
  if (status === 429) return `${label} rate limit reached (429) — try again shortly`;
  if (status === 400 || status === 404 || status === 422) return `${label} request rejected (${status}) — check model`;
  if (status >= 500) return `${label} service unavailable (${status}) — try again later`;
  return `${label} request failed (${status})`;
}

const LOCAL_RETRY_ATTEMPTS = 2;
const LOCAL_RETRY_DELAY_MS = 750;

function isRetryableLocalError(error) {
  return /unreachable|timed out|service unavailable \(5\d\d\)/i.test(String(error || ""));
}

async function requestCompletionOnce(name, messages, options = {}) {
  const cfg = providerConfig(name);
  if (name === "openai" && !cfg.configured) {
    return { content: null, error: "No LLM API key configured" };
  }
  if (name === "local" && !cfg.configured) {
    return { content: null, error: "Local LLM is not configured" };
  }

  const timeoutMs = Number.isFinite(options.timeoutMs) && options.timeoutMs > 0
    ? options.timeoutMs
    : Number.isFinite(options.localTimeoutMs) && name === "local" && options.localTimeoutMs > 0
      ? options.localTimeoutMs
      : cfg.timeoutMs;

  try {
    const headers = { "Content-Type": "application/json" };
    if (cfg.apiKey) headers.Authorization = `Bearer ${cfg.apiKey}`;
    const resp = await fetch(`${cfg.baseUrl}/chat/completions`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        model: options.model || cfg.model,
        messages,
        temperature: options.temperature ?? 0.7,
        max_tokens: options.maxTokens ?? 1000,
      }),
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!resp.ok) {
      return { content: null, error: httpError(resp.status, cfg.label) };
    }
    let data;
    try {
      data = await resp.json();
    } catch {
      return { content: null, error: `${cfg.label} returned an invalid response` };
    }
    const content = data?.choices?.[0]?.message?.content;
    if (typeof content !== "string" || !content.trim()) {
      return { content: null, error: `${cfg.label} returned an empty response` };
    }
    return {
      content: content.trim(),
      usage: data.usage,
      model: data.model || options.model || cfg.model,
    };
  } catch (err) {
    if (err?.name === "AbortError" || err?.name === "TimeoutError") {
      return { content: null, error: `${cfg.label} request timed out after ${timeoutMs}ms` };
    }
    return { content: null, error: `${cfg.label} service unreachable` };
  }
}

// Only the local provider is retried: a cold Ollama start can refuse the first
// connection or time out while loading. OpenAI is never retried automatically
// because a retry could duplicate a paid request.
async function requestCompletion(name, messages, options = {}) {
  const maxAttempts = name === "local" ? LOCAL_RETRY_ATTEMPTS : 1;
  let result;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    result = await requestCompletionOnce(name, messages, options);
    if (!result.error || attempt === maxAttempts || !isRetryableLocalError(result.error)) {
      return result;
    }
    await new Promise((resolve) => setTimeout(resolve, LOCAL_RETRY_DELAY_MS));
  }
  return result;
}

function recordSuccess(name, usedModel) {
  const now = Date.now();
  const state = providerHealth[name];
  state.available = true;
  state.checkedAt = now;
  state.lastSuccessAt = now;
  state.lastError = null;
  state.model = usedModel || providerConfig(name).model;
  activeProvider = name;
  healthCheckedAt = now;
  healthSource = "request";
  healthLastSuccessAt = now;
}

function recordFailure(name, error) {
  const state = providerHealth[name];
  state.available = false;
  state.checkedAt = Date.now();
  state.lastError = error || `${PROVIDERS[name].label} unavailable`;
}

function providerOrder() {
  const order = [];
  if (hasKey()) order.push("openai");
  if (isLocalConfigured()) order.push("local");
  return order;
}

async function complete(messages, options = {}) {
  const order = providerOrder();
  if (!order.length) {
    return { content: null, error: "No LLM API key configured", provider: "offline", attempts: [] };
  }

  const attempts = [];
  for (const name of order) {
    const result = await requestCompletion(name, messages, options);
    attempts.push({ provider: name, ok: !result.error, error: result.error || null });
    if (!result.error) {
      recordSuccess(name, result.model);
      return { ...result, provider: name, attempts };
    }
    recordFailure(name, result.error);
  }

  activeProvider = "offline";
  healthCheckedAt = Date.now();
  healthSource = "request";
  return {
    content: null,
    error: attempts[0]?.error || `${PROVIDERS[order[0]].label} unavailable`,
    provider: "offline",
    attempts,
  };
}

async function chat(messages, options = {}) {
  const result = await complete(messages, options);
  if (result.error) return { content: null, error: result.error };
  return { content: result.content, usage: result.usage, model: result.model };
}

function parseJsonContent(content) {
  if (typeof content !== "string") return null;
  const raw = content.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  try {
    return JSON.parse(raw);
  } catch {
    const starts = ["[", "{"].map((c) => raw.indexOf(c)).filter((i) => i >= 0);
    if (!starts.length) return null;
    const start = Math.min(...starts);
    const end = Math.max(raw.lastIndexOf("]"), raw.lastIndexOf("}"));
    if (end <= start) return null;
    try {
      return JSON.parse(raw.slice(start, end + 1));
    } catch {
      return null;
    }
  }
}

function normalizeQuestions(parsed) {
  if (!Array.isArray(parsed)) return [];
  return parsed
    .filter((item) => item && typeof item.q === "string" && item.q.trim())
    .slice(0, 7)
    .map((item) => ({
      q: item.q.trim(),
      type: typeof item.type === "string" && item.type.trim() ? item.type.trim() : "behavioral",
      tip: typeof item.tip === "string" ? item.tip.trim() : "",
      keywords: Array.isArray(item.keywords)
        ? item.keywords.filter((k) => typeof k === "string" && k.trim()).map((k) => k.trim())
        : [],
    }));
}

function stripCodeFence(text) {
  return String(text || "")
    .trim()
    .replace(/^```(?:markdown|text)?\s*/i, "")
    .replace(/\s*```$/, "")
    .trim();
}

function normalizeForComparison(text) {
  return String(text || "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function cleanEnhanced(text) {
  const stripped = stripCodeFence(text)
    .split("\n")
    .filter((line) => {
      const t = line.trim();
      if (!t) return true;
      return !(
        /^JOB:$/i.test(t) ||
        /^ORIGINAL CV:$/i.test(t) ||
        /^Improved CV:$/i.test(t) ||
        /^TARGET JOB:$/i.test(t) ||
        /^Rewrite the CV now\.?$/i.test(t) ||
        /^Return only the improved CV/i.test(t)
      );
    })
    .join("\n")
    .trim();
  return stripped;
}

function isUsableEnhanced(text, cvText, jdText) {
  const output = normalizeForComparison(text);
  const cv = normalizeForComparison(cvText);
  const job = normalizeForComparison(jdText);
  if (!output || output === cv) return false;
  if (job && (job.includes(output) || output.includes(job))) return false;
  return true;
}

function stripEchoedOriginal(text, original) {
  const cv = String(original || "").trim();
  if (!cv) return text;
  return String(text || "")
    .split(cv)
    .join(" ")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

async function aiEnhance(cvText, jdText) {
  const system = [
    "You are a senior resume editor.",
    "Rewrite the CV for the target job.",
    "- Preserve every fact; never invent employers, dates, degrees, or metrics.",
    "- Use strong action verbs and concise professional language.",
    "- Add relevant job-description keywords only when the CV already supports them.",
    "- Every sentence must change.",
    "- Do not repeat or append the original CV.",
    "- Do not return or paraphrase the job description.",
    "- Return only the improved CV, with no notes or explanations.",
  ].join("\n");

  const words = String(cvText).trim().split(/\s+/).filter(Boolean).length;
  const maxTokens = Math.min(900, Math.max(160, Math.ceil(words * 1.6)));
  const user = `JOB:\n${jdText}\n\nORIGINAL CV:\n${cvText}\n\nImproved CV:`;

  let result = await complete(
    [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
    { temperature: 0.2, maxTokens }
  );

  let candidate = result.error ? "" : stripEchoedOriginal(cleanEnhanced(result.content), cvText);
  if (!result.error && !isUsableEnhanced(candidate, cvText, jdText)) {
    result = await complete(
      [
        { role: "system", content: system },
        {
          role: "user",
          content: `JOB:\n${jdText}\n\nORIGINAL CV:\n${cvText}\n\nRewrite every sentence now. Output only the revised CV.`,
        },
      ],
      { temperature: 0.4, maxTokens }
    );
    candidate = result.error ? "" : stripEchoedOriginal(cleanEnhanced(result.content), cvText);
  }

  if (result.error) return { enhanced: cvText, error: result.error, provider: "offline" };

  const enhanced = candidate;
  if (!isUsableEnhanced(enhanced, cvText, jdText)) {
    return {
      enhanced: cvText,
      error: `${PROVIDERS[result.provider].label} returned no usable CV rewrite; no AI rewrite was applied. Try again or use a stronger local model.`,
      provider: "offline",
      unchanged: true,
    };
  }

  return { enhanced, provider: result.provider };
}
async function aiCoverLetter(cvText, jdText, name = "") {
  const result = await complete(
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
  if (result.error) return { coverLetter: null, error: result.error, provider: "offline" };
  return { coverLetter: result.content || null, provider: result.provider };
}

async function aiMockQuestions(cvText, jdText) {
  const result = await complete(
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
      provider: "offline",
    };
  }
  const parsed = parseJsonContent(result.content);
  const questions = normalizeQuestions(parsed);
  if (!questions.length) {
    return {
      questions: generateFallbackQuestions(cvText, jdText),
      error: "LLM response could not be parsed as interview questions",
      provider: result.provider,
      fallback: true,
    };
  }
  return { questions, provider: result.provider };
}

function generateFallbackQuestions(cvText, _jdText) {
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
    return { ...evaluateAnswerOffline(question, answer), provider: "offline" };
  }
  const result = await complete(
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
    return { ...evaluateAnswerOffline(question, answer), provider: "offline" };
  }
  const parsed = parseJsonContent(result.content);
  if (!parsed || !Number.isFinite(Number(parsed.score))) {
    return { ...evaluateAnswerOffline(question, answer), provider: result.provider, fallback: true };
  }
  const score = Math.max(0, Math.min(10, Math.round(Number(parsed.score) * 10) / 10));
  const validLevels = ["Weak", "Moderate", "Good", "Excellent"];
  return {
    score,
    level: validLevels.includes(parsed.level)
      ? parsed.level
      : score >= 8
        ? "Excellent"
        : score >= 6
          ? "Good"
          : score >= 4
            ? "Moderate"
            : "Weak",
    feedback: typeof parsed.feedback === "string" && parsed.feedback.trim()
      ? parsed.feedback.trim().slice(0, 500)
      : "Focus on a specific example and quantify the result.",
    provider: result.provider,
  };
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

function isoTime(ms) {
  return ms ? new Date(ms).toISOString() : null;
}

function safeHost(value) {
  try {
    return new URL(value).host;
  } catch {
    return null;
  }
}

function providerSnapshot(name) {
  const state = providerHealth[name];
  const cfg = providerConfig(name);
  return {
    name,
    label: cfg.label,
    kind: PROVIDERS[name].kind,
    configured: cfg.configured,
    available: state.available,
    checkedAt: isoTime(state.checkedAt),
    lastSuccessAt: isoTime(state.lastSuccessAt),
    lastError: state.lastError,
    model: cfg.model,
    host: safeHost(cfg.baseUrl),
  };
}

function statusSnapshot() {
  return {
    active: activeProvider,
    available: activeProvider !== "offline",
    checkedAt: isoTime(healthCheckedAt),
    lastSuccessAt: isoTime(healthLastSuccessAt),
    source: healthSource,
    providers: {
      openai: providerSnapshot("openai"),
      local: providerSnapshot("local"),
    },
  };
}

function isLoopbackBaseUrl(value) {
  try {
    const host = new URL(value).hostname.toLowerCase();
    return host === "localhost" || host === "127.0.0.1" || host === "::1" || host === "[::1]";
  } catch {
    return false;
  }
}

function setProbeState(name, result) {
  const state = providerHealth[name];
  state.available = result.available;
  state.checkedAt = result.checkedAt;
  state.lastError = result.error;
  if (result.available) {
    state.lastSuccessAt = result.checkedAt;
    state.model = result.model || providerConfig(name).model;
  }
}

// Health is proven by a real (but minimal) completion, never by /models.
// OpenAI is probed only when its base URL is loopback (mock/self-hosted), so
// production health checks can never create a paid OpenAI request.
async function probeCompletion(name, timeoutMs) {
  const cfg = providerConfig(name);
  if (!cfg.configured) {
    return {
      available: false,
      error: name === "openai" ? "No API key configured" : "Disabled",
      checkedAt: Date.now(),
    };
  }
  const result = await requestCompletion(
    name,
    [
      { role: "system", content: "You are a health-check probe. Reply with the single word OK." },
      { role: "user", content: "Reply OK." },
    ],
    { temperature: 0, maxTokens: 1, timeoutMs }
  );
  if (result.error) {
    return { available: false, error: result.error, checkedAt: Date.now() };
  }
  return { available: true, error: null, checkedAt: Date.now(), model: result.model };
}

function canProbeCompletion(name) {
  const cfg = providerConfig(name);
  if (!cfg.configured) return false;
  return name === "local" || isLoopbackBaseUrl(cfg.baseUrl);
}

async function healthStatus(options = {}) {
  const force = options.force === true;
  const now = Date.now();
  const cacheMs = Number.isFinite(options.cacheMs) ? options.cacheMs : healthCacheMs;
  if (!force && healthCheckedAt && now - healthCheckedAt < cacheMs) {
    return statusSnapshot();
  }
  if (healthInFlight) return healthInFlight;

  const generation = healthGeneration;
  const timeoutMs = Number.isFinite(options.timeoutMs) ? options.timeoutMs : healthTimeoutMs;
  const run = (async () => {
    const openaiConfigured = providerConfig("openai").configured;
    let openai;
    if (providerHealth.openai.available === true) {
      openai = { available: true, error: null, checkedAt: providerHealth.openai.checkedAt };
    } else if (canProbeCompletion("openai")) {
      openai = await probeCompletion("openai", timeoutMs);
    } else {
      openai = {
        available: false,
        error: openaiConfigured
          ? "OpenAI not verified: health checks never make paid API calls; an actual completion is required"
          : "No API key configured",
        checkedAt: Date.now(),
      };
    }

    let local;
    if (!isLocalConfigured()) {
      local = { available: false, error: "Disabled", checkedAt: Date.now() };
    } else if (openai.available) {
      local = {
        available: providerHealth.local.available === true,
        error: providerHealth.local.lastError,
        checkedAt: providerHealth.local.checkedAt,
      };
    } else {
      local = await probeCompletion("local", timeoutMs);
    }

    if (generation !== healthGeneration) return statusSnapshot();

    setProbeState("openai", openai);
    setProbeState("local", local);

    activeProvider = openai.available ? "openai" : local.available ? "local" : "offline";
    healthCheckedAt = Date.now();
    healthSource = "completion-probe";
    healthLastSuccessAt = activeProvider === "offline" ? 0 : providerHealth[activeProvider].lastSuccessAt;
    return statusSnapshot();
  })();

  healthInFlight = run;
  try {
    return await run;
  } finally {
    if (healthInFlight === run) healthInFlight = null;
  }
}

function currentEngine() {
  return activeProvider === "offline" ? "offline" : "llm";
}

module.exports = {
  configure,
  configureLocal,
  hasKey,
  isLocalConfigured,
  chat,
  complete,
  aiEnhance,
  aiCoverLetter,
  aiMockQuestions,
  evaluateAnswer,
  generateFallbackQuestions,
  healthStatus,
  statusSnapshot,
  currentEngine,
};
