import { describe, it, expect } from "vitest";
import { hostToken } from "../lib/host-tokens";
import { HOST_KINDS } from "../types";

describe("hostToken", () => {
  it("returns a label and color for every HostKind", () => {
    for (const kind of HOST_KINDS) {
      const t = hostToken(kind);
      expect(t.label).toBeTruthy();
      expect(t.color).toMatch(/^#[0-9a-f]{6}$/i);
    }
  });

  it("Conductor is purple", () => {
    expect(hostToken("conductor").color).toBe("#a78bfa");
  });

  it("unknown is labeled 'Other'", () => {
    expect(hostToken("unknown").label).toBe("Other");
  });
});
