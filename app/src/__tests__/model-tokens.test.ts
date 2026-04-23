import { describe, it, expect } from "vitest";
import { modelShortName, modelLongName, modelFamilyColor } from "../lib/model-tokens";

describe("modelShortName", () => {
  it("returns em dash for null / empty", () => {
    expect(modelShortName(null)).toBe("—");
    expect(modelShortName("")).toBe("—");
  });
  it("maps Claude family names", () => {
    expect(modelShortName("claude-opus-4-7-20260501")).toBe("OPUS");
    expect(modelShortName("claude-sonnet-4-6")).toBe("SONNET");
    expect(modelShortName("claude-haiku-4-5")).toBe("HAIKU");
  });
  it("maps OpenAI family names", () => {
    expect(modelShortName("gpt-5")).toBe("GPT-5");
    expect(modelShortName("gpt-5-codex")).toBe("GPT-5");
    expect(modelShortName("gpt-4o")).toBe("GPT-4");
    expect(modelShortName("codex")).toBe("CODEX");
  });
  it("falls back to MODEL for unknown strings", () => {
    expect(modelShortName("llama-3")).toBe("MODEL");
  });
});

describe("modelLongName", () => {
  it("returns 'Unknown' for null / empty", () => {
    expect(modelLongName(null)).toBe("Unknown");
    expect(modelLongName("")).toBe("Unknown");
  });
  it("pretty-prints Claude model ids", () => {
    expect(modelLongName("claude-opus-4-7-20260501")).toBe("Claude Opus 4.7");
    expect(modelLongName("claude-sonnet-4-6")).toBe("Claude Sonnet 4.6");
    expect(modelLongName("claude-haiku-4-5-20260101")).toBe("Claude Haiku 4.5");
  });
  it("handles GPT names", () => {
    expect(modelLongName("gpt-5")).toBe("GPT-5");
    expect(modelLongName("gpt-5-codex")).toBe("GPT-5 CODEX");
    expect(modelLongName("codex")).toBe("CODEX");
  });
  it("passes through unknown strings", () => {
    expect(modelLongName("llama-3")).toBe("llama-3");
  });
});

describe("modelFamilyColor", () => {
  it("returns claude lavender for Claude family", () => {
    expect(modelFamilyColor("claude-opus-4-7")).toBe("#a78bfa");
    expect(modelFamilyColor("claude-sonnet-4-6")).toBe("#a78bfa");
  });
  it("returns gpt pink for OpenAI family", () => {
    expect(modelFamilyColor("gpt-5")).toBe("#f472b6");
    expect(modelFamilyColor("codex")).toBe("#f472b6");
  });
  it("returns neutral gray for null / unknown", () => {
    expect(modelFamilyColor(null)).toBe("#6b7084");
    expect(modelFamilyColor("llama-3")).toBe("#6b7084");
  });
});
