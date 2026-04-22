import { describe, it, expect, beforeEach } from "vitest";
import { useSelection } from "../store/selection";

describe("useSelection", () => {
  beforeEach(() => {
    localStorage.clear();
    useSelection.setState({
      selectedSessionId: null,
      leftWidth: 280,
      rightWidth: 320,
      rightTab: "changes",
    });
  });

  it("starts with nothing selected", () => {
    expect(useSelection.getState().selectedSessionId).toBeNull();
  });

  it("setSelected updates state", () => {
    useSelection.getState().setSelected("sess-abc");
    expect(useSelection.getState().selectedSessionId).toBe("sess-abc");
  });

  it("clamps left width to allowed range", () => {
    useSelection.getState().setLeftWidth(50);
    expect(useSelection.getState().leftWidth).toBe(200);
    useSelection.getState().setLeftWidth(9000);
    expect(useSelection.getState().leftWidth).toBe(480);
  });

  it("clamps right width to allowed range", () => {
    useSelection.getState().setRightWidth(10);
    expect(useSelection.getState().rightWidth).toBe(240);
    useSelection.getState().setRightWidth(9999);
    expect(useSelection.getState().rightWidth).toBe(520);
  });

  it("defaults rightTab to 'changes'", () => {
    expect(useSelection.getState().rightTab).toBe("changes");
  });

  it("setRightTab updates state", () => {
    useSelection.getState().setRightTab("review");
    expect(useSelection.getState().rightTab).toBe("review");
  });

  it("persists rightTab through the persist middleware", () => {
    useSelection.getState().setRightTab("checks");
    const raw = localStorage.getItem("vigil-selection");
    expect(raw).toBeTruthy();
    expect(raw).toContain("checks");
  });

  it("accepts all four tab values", () => {
    for (const t of ["all", "changes", "checks", "review"] as const) {
      useSelection.getState().setRightTab(t);
      expect(useSelection.getState().rightTab).toBe(t);
    }
  });
});
