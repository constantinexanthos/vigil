import { describe, it, expect } from "vitest";
import {
  repoName,
  humanModel,
  shortModel,
  elapsedSince,
  relativeTimeFromIso,
} from "../lib/formatters";

describe("repoName", () => {
  it("returns last path segment", () => {
    expect(repoName("/Users/me/projects/vigil")).toBe("vigil");
    expect(repoName("vigil")).toBe("vigil");
  });

  it("handles trailing slashes", () => {
    expect(repoName("/Users/me/projects/vigil/")).toBe("vigil");
  });

  it("returns empty string for nullish input", () => {
    expect(repoName(null)).toBe("");
    expect(repoName(undefined)).toBe("");
    expect(repoName("")).toBe("");
  });
});

describe("humanModel", () => {
  it("returns 'unknown' for nullish input", () => {
    expect(humanModel(null)).toBe("unknown");
    expect(humanModel(undefined)).toBe("unknown");
  });

  it("recognizes Claude variants", () => {
    expect(humanModel("claude-opus-4-7")).toBe("Claude Opus");
    expect(humanModel("claude-sonnet-4-6")).toBe("Claude Sonnet");
    expect(humanModel("claude-haiku-4-5-20251001")).toBe("Claude Haiku");
  });

  it("recognizes GPT-5 before falling to generic GPT", () => {
    expect(humanModel("gpt-5-codex")).toBe("GPT-5");
    expect(humanModel("gpt-4-turbo")).toBe("GPT");
  });

  it("passes through unknown model strings", () => {
    expect(humanModel("llama-3")).toBe("llama-3");
  });
});

describe("shortModel", () => {
  it("returns empty string for nullish input", () => {
    expect(shortModel(null)).toBe("");
    expect(shortModel(undefined)).toBe("");
  });

  it("abbreviates Claude variants", () => {
    expect(shortModel("claude-opus-4-7")).toBe("Opus");
    expect(shortModel("claude-sonnet-4-6")).toBe("Sonnet");
    expect(shortModel("claude-haiku-4-5-20251001")).toBe("Haiku");
  });

  it("returns 'GPT' for any gpt model", () => {
    expect(shortModel("gpt-5")).toBe("GPT");
    expect(shortModel("gpt-4")).toBe("GPT");
  });

  it("falls back to the first dash-segment", () => {
    expect(shortModel("llama-3-70b")).toBe("llama");
  });
});

describe("elapsedSince", () => {
  it("returns seconds for recent starts", () => {
    const now = new Date(Date.now() - 12_000).toISOString();
    expect(elapsedSince(now)).toBe("12s");
  });

  it("returns minutes+seconds", () => {
    const now = new Date(Date.now() - (3 * 60_000 + 5_000)).toISOString();
    expect(elapsedSince(now)).toBe("3m 5s");
  });

  it("returns hours+minutes", () => {
    const now = new Date(Date.now() - (2 * 3600_000 + 15 * 60_000)).toISOString();
    expect(elapsedSince(now)).toBe("2h 15m");
  });

  it("clamps negative (future) timestamps to 0s", () => {
    const future = new Date(Date.now() + 60_000).toISOString();
    expect(elapsedSince(future)).toBe("0s");
  });
});

describe("relativeTimeFromIso", () => {
  it("returns seconds", () => {
    const t = new Date(Date.now() - 30_000).toISOString();
    expect(relativeTimeFromIso(t)).toBe("30s ago");
  });

  it("returns minutes", () => {
    const t = new Date(Date.now() - 5 * 60_000).toISOString();
    expect(relativeTimeFromIso(t)).toBe("5m ago");
  });

  it("returns hours", () => {
    const t = new Date(Date.now() - 4 * 3600_000).toISOString();
    expect(relativeTimeFromIso(t)).toBe("4h ago");
  });
});
