// Hybrid provider tests: OpenAI primary, local fallback, offline last resort.
// Every provider request goes to a loopback mock; no external or paid calls.
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import http from "node:http";
import { createRequire } from "node:module";
import ai from "../services/aiService.js";
import envEsm from "../config/env.js";

const require = createRequire(import.meta.url);
const llm = require("../lib/llm.js");

// Hermetic guard: ambient backend/.env may contain a live GEMINI_API_KEY.
// Blank it in every possible env-graph instance so the pinned
// OpenAI -> local -> offline chain never reaches the real Gemini API.
const envCjs = require("../config/env.js");
envEsm.GEMINI_API_KEY = "";
envCjs.GEMINI_API_KEY = "";

const servers = [];

function start(handler) {
  return new Promise((resolve, reject) => {
    const server = http.createServer(handler);
    server.on("error", reject);
    server.listen(0, "127.0.0.1", () => {
      servers.push(server);
      resolve(server);
    });
  });
}

function base(server) {
  return `http://127.0.0.1:${server.address().port}/v1`;
}

async function stop(server) {
  server.closeAllConnections?.();
  await new Promise((resolve) => server.close(resolve));
}

function providerHandler(options = {}) {
  let calls = 0;
  let chatCalls = 0;
  const handler = (req, res) => {
    calls++;
    if (req.url.endsWith("/models")) {
      res.writeHead(options.modelsStatus || 200, { "content-type": "application/json" });
      res.end(JSON.stringify({ object: "list", data: [{ id: "mock" }] }));
      return;
    }
    chatCalls++;
    if (options.failFirstChat && chatCalls === 1) {
      req.socket.destroy();
      return;
    }
    if (options.chatStatus && options.chatStatus !== 200) {
      res.writeHead(options.chatStatus, { "content-type": "application/json" });
      res.end(JSON.stringify({ error: "mock provider failure" }));
      return;
    }
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({
      model: "mock",
      choices: [{ message: { content: options.content || "mock completion" } }],
    }));
  };
  handler.calls = () => calls;
  handler.chatCalls = () => chatCalls;
  return handler;
}

beforeEach(() => {
  llm.configure("", "gpt-4o-mini", "https://api.openai.com/v1");
  llm.configureLocal("", "local", "");
});

afterEach(async () => {
  while (servers.length) await stop(servers.pop());
  llm.configure("", "gpt-4o-mini", "https://api.openai.com/v1");
  llm.configureLocal("", "local", "");
});

describe("Hybrid provider selection", () => {
  it("uses OpenAI first and does not call the local provider", async () => {
    const local = providerHandler({ content: "Local enhanced" });
    const localServer = await start(local);
    const openaiServer = await start(providerHandler({ content: "OpenAI enhanced" }));
    llm.configure("sk-test", "mock", base(openaiServer));
    llm.configureLocal(base(localServer), "local", "");

    const result = await ai.enhanceWithAI("Original CV", "Job description");

    expect(result.engine).toBe("llm");
    expect(result.provider).toBe("openai");
    expect(result.enhanced).toBe("OpenAI enhanced");
    expect(local.calls()).toBe(0);
    expect(llm.statusSnapshot().active).toBe("openai");
  });

  it("automatically falls back to the local provider when OpenAI fails", async () => {
    const openaiServer = await start(providerHandler({ chatStatus: 503, modelsStatus: 503 }));
    const localServer = await start(providerHandler({ content: "Local enhanced" }));
    llm.configure("sk-test", "mock", base(openaiServer));
    llm.configureLocal(base(localServer), "local", "");

    const result = await ai.enhanceWithAI("Original CV", "Job description");

    expect(result.engine).toBe("llm");
    expect(result.provider).toBe("local");
    expect(result.enhanced).toBe("Local enhanced");
    const status = llm.statusSnapshot();
    expect(status.active).toBe("local");
    expect(status.providers.openai.available).toBe(false);
    expect(status.providers.local.available).toBe(true);
  });

  it("returns the existing offline fallback when both providers fail", async () => {
    const openaiServer = await start(providerHandler({ chatStatus: 503, modelsStatus: 503 }));
    const localServer = await start(providerHandler({ chatStatus: 503, modelsStatus: 503 }));
    llm.configure("sk-test", "mock", base(openaiServer));
    llm.configureLocal(base(localServer), "local", "");

    const result = await ai.enhanceWithAI("Original CV", "Job description");

    expect(result.engine).toBe("offline");
    expect(result.provider).toBe("offline");
    expect(result.enhanced).toBe("Original CV");
    expect(result.error).toMatch(/service unavailable \(503\)/i);

    const status = await llm.healthStatus({ force: true, timeoutMs: 300 });
    expect(status.active).toBe("offline");
    expect(status.available).toBe(false);
  });

  it("reports health only after an actual provider completion", async () => {
    const localHandler = providerHandler({ content: "OK" });
    const localServer = await start(localHandler);
    llm.configureLocal(base(localServer), "local", "");

    const up = await llm.healthStatus({ force: true, timeoutMs: 300 });
    expect(up.active).toBe("local");
    expect(up.available).toBe(true);
    expect(up.source).toBe("completion-probe");
    expect(up.providers.openai.configured).toBe(false);
    expect(up.providers.local.available).toBe(true);
    expect(localHandler.chatCalls()).toBe(1);

    await stop(localServer);
    servers.splice(servers.indexOf(localServer), 1);

    const down = await llm.healthStatus({ force: true, timeoutMs: 300 });
    expect(down.active).toBe("offline");
    expect(down.available).toBe(false);
    expect(down.providers.local.available).toBe(false);
  });

  it("retries a cold local provider once before succeeding", async () => {
    const localHandler = providerHandler({ content: "Local enhanced after retry", failFirstChat: true });
    const localServer = await start(localHandler);
    llm.configureLocal(base(localServer), "local", "");

    const result = await ai.enhanceWithAI("Original CV", "Job description");

    expect(result.engine).toBe("llm");
    expect(result.provider).toBe("local");
    expect(result.enhanced).toBe("Local enhanced after retry");
    expect(localHandler.chatCalls()).toBe(2);
  });

  it("strips an original CV echoed after the rewritten local output", async () => {
    const original = "Built dashboards for clients. Led a small team.";
    const local = providerHandler({
      content: `Delivered dashboards for 500 users and improved load time by 30%.\n\n${original}`,
    });
    const localServer = await start(local);
    llm.configureLocal(base(localServer), "local", "");

    const result = await ai.enhanceWithAI(original, "Frontend role");

    expect(result.provider).toBe("local");
    expect(result.enhanced).toBe("Delivered dashboards for 500 users and improved load time by 30%.");
    expect(result.enhanced).not.toContain(original);
  });

  it("rejects a local response that copies the job description", async () => {
    const local = providerHandler({ content: "Frontend role requiring React and collaboration." });
    const localServer = await start(local);
    llm.configureLocal(base(localServer), "local", "");

    const result = await ai.enhanceWithAI("Built dashboards for clients.", "Frontend role requiring React and collaboration.");

    expect(result.provider).toBe("offline");
    expect(result.enhanced).toBe("Built dashboards for clients.");
    expect(result.error).toMatch(/no usable CV rewrite/i);
    expect(local.chatCalls()).toBe(2);
  });

  it("does not retry a failed paid OpenAI request", async () => {
    const openaiHandler = providerHandler({ chatStatus: 503 });
    const openaiServer = await start(openaiHandler);
    llm.configure("sk-test", "mock", base(openaiServer));
    llm.configureLocal("");

    const result = await ai.enhanceWithAI("Original CV", "Job description");

    expect(result.engine).toBe("offline");
    expect(result.provider).toBe("offline");
    expect(openaiHandler.chatCalls()).toBe(1);
  });

  it("verifies a loopback OpenAI-compatible provider with an actual completion", async () => {
    const openaiHandler = providerHandler({ content: "OK" });
    const openaiServer = await start(openaiHandler);
    llm.configure("sk-test", "mock", base(openaiServer));

    const status = await llm.healthStatus({ force: true, timeoutMs: 300 });
    expect(status.active).toBe("openai");
    expect(status.available).toBe(true);
    expect(status.source).toBe("completion-probe");
    expect(openaiHandler.chatCalls()).toBe(1);
  });

  it("never probes the production OpenAI endpoint from health", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    try {
      llm.configure("sk-test", "gpt-4o-mini", "https://api.openai.com/v1");
      llm.configureLocal("");

      const status = await llm.healthStatus({ force: true, timeoutMs: 300 });
      expect(status.active).toBe("offline");
      expect(status.available).toBe(false);
      expect(status.providers.openai.available).toBe(false);
      expect(status.providers.openai.lastError).toMatch(/never make paid API calls/i);
      expect(fetchSpy).not.toHaveBeenCalled();
    } finally {
      fetchSpy.mockRestore();
    }
  });
});
