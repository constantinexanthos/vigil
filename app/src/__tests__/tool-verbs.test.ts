import { describe, it, expect } from "vitest";
import { toolVerb } from "../lib/tool-verbs";

describe("toolVerb", () => {
  it("maps Edit and Write to 'Editing…'", () => {
    expect(toolVerb(["Edit"])).toBe("Editing…");
    expect(toolVerb(["Write"])).toBe("Editing…");
  });
  it("maps Bash to 'Running a command…'", () => {
    expect(toolVerb(["Bash"])).toBe("Running a command…");
  });
  it("maps Read/Grep/Glob to 'Reading the code…'", () => {
    expect(toolVerb(["Read"])).toBe("Reading the code…");
    expect(toolVerb(["Grep"])).toBe("Reading the code…");
    expect(toolVerb(["Glob"])).toBe("Reading the code…");
  });
  it("maps WebFetch/WebSearch to 'Looking something up…'", () => {
    expect(toolVerb(["WebFetch"])).toBe("Looking something up…");
    expect(toolVerb(["WebSearch"])).toBe("Looking something up…");
  });
  it("maps Task to 'Dispatching a sub-agent…'", () => {
    expect(toolVerb(["Task"])).toBe("Dispatching a sub-agent…");
  });
  it("falls back to 'Working…' for unknown tools", () => {
    expect(toolVerb(["WhateverTool"])).toBe("Working…");
  });
  it("returns null for empty tool list", () => {
    expect(toolVerb([])).toBeNull();
  });
  it("prefers the first tool when several are present", () => {
    expect(toolVerb(["Edit", "Read", "Bash"])).toBe("Editing…");
  });
});
