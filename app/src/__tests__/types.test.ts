import { describe, it, expect } from "vitest";
import { isHostKind, HOST_KINDS } from "../types";

describe("isHostKind", () => {
  it("accepts every kind in HOST_KINDS", () => {
    for (const k of HOST_KINDS) {
      expect(isHostKind(k)).toBe(true);
    }
  });

  it("rejects unknown strings", () => {
    expect(isHostKind("")).toBe(false);
    expect(isHostKind("claude-code")).toBe(false);
    expect(isHostKind("TERMINAL")).toBe(false);
  });
});
