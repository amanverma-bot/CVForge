/* global process, console */
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const llm = require("../lib/llm.js");
const ai = require("../services/aiService.js");

const baseUrl = process.env.LOCAL_LLM_BASE_URL || "http://127.0.0.1:11434/v1";
const model = process.env.LOCAL_LLM_MODEL || "llama3.2";
const timeoutMs = Number(process.env.LOCAL_LLM_VERIFY_TIMEOUT_MS || 120000);

const cv = "Senior JavaScript developer with React, Node.js, REST APIs, and MongoDB experience. Built a 500-user dashboard and improved load time by 30%.";
const jd = "Frontend engineer role requiring React, JavaScript, REST APIs, and collaboration with backend teams.";

function elapsed(startedAt) {
  return Date.now() - startedAt;
}

try {
  llm.configure("");
  llm.configureLocal(baseUrl, model);

  const healthStarted = Date.now();
  const health = await llm.healthStatus({ force: true, timeoutMs });
  if (!health.available || health.active !== "local" || health.source !== "completion-probe") {
    throw new Error(`local health failed: ${JSON.stringify(health)}`);
  }

  const completionStarted = Date.now();
  const completion = await llm.complete(
    [{ role: "user", content: "Reply with exactly: LOCAL_OK" }],
    { temperature: 0, maxTokens: 16, timeoutMs }
  );
  if (completion.error || completion.provider !== "local" || !completion.content) {
    throw new Error(`local completion failed: ${JSON.stringify(completion)}`);
  }

  const enhanceStarted = Date.now();
  const enhanced = await ai.enhanceWithAI(cv, jd);
  if (enhanced.engine !== "llm" || enhanced.provider !== "local" || !enhanced.enhanced) {
    throw new Error(`local enhance failed: ${JSON.stringify(enhanced)}`);
  }

  console.log(JSON.stringify({
    ok: true,
    baseUrl,
    model,
    health: {
      active: health.active,
      available: health.available,
      source: health.source,
      elapsedMs: elapsed(healthStarted),
    },
    completion: {
      provider: completion.provider,
      content: completion.content,
      elapsedMs: elapsed(completionStarted),
    },
    enhance: {
      engine: enhanced.engine,
      provider: enhanced.provider,
      sample: enhanced.enhanced.slice(0, 240),
      elapsedMs: elapsed(enhanceStarted),
    },
  }, null, 2));
} catch (error) {
  console.error(JSON.stringify({ ok: false, baseUrl, model, error: error.message }, null, 2));
  process.exitCode = 1;
}
