// Unit tests for LLM key validation (isolated worker so module state cannot leak).
import { describe, it, expect } from "vitest";
import llm from "../lib/llm.js";

describe("LLM key validation", () => {
  it("rejects .env placeholder keys", () => {
    llm.configure("sk-<your-openai-api-key>");
    expect(llm.hasKey()).toBe(false);
  });

  it("accepts a real-looking key", () => {
    llm.configure("sk-live-abc123");
    expect(llm.hasKey()).toBe(true);
  });

  it("rejects blank keys", () => {
    llm.configure("   ");
    expect(llm.hasKey()).toBe(false);
  });
});
