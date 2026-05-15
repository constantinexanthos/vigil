import "@testing-library/jest-dom/vitest";
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { HotspotsPanel } from "../HotspotsPanel";
import type { FileHeat, Collision } from "../../../../types";

// The polish pass restructured HotspotsPanel:
//   * <table> → flat <div> rows (Linear file-row pattern)
//   * progress-bar → right-aligned tabular edit count
//   * per-agent color dots + "+N" overflow → "N agents" mute-ink label
//   * conflict triangle marker → border-l bad-accent (single-pixel error)
// Tests below assert the new structure; the "ordered by edit_count desc"
// and "no triangle for non-collisions" assertions still hold via different
// queries.

describe("HotspotsPanel", () => {
  it("renders empty caption when no hot files", () => {
    render(<HotspotsPanel files={[]} collisions={[]} repoPath={null} />);
    expect(
      screen.getByText(/Quiet — no file activity/i),
    ).toBeInTheDocument();
  });

  it("renders rows ordered by edit_count desc (already sorted server-side)", () => {
    const files: FileHeat[] = [
      { path: "/r/a.ts", edit_count: 10, agents: ["claude-code"], last_event_at: "2026-05-01T17:00:00Z" },
      { path: "/r/b.ts", edit_count: 5, agents: ["cursor"], last_event_at: "2026-05-01T17:00:00Z" },
    ];
    const { container } = render(
      <HotspotsPanel files={files} collisions={[]} repoPath="/r" />,
    );
    const text = container.textContent ?? "";
    const ai = text.indexOf("a.ts");
    const bi = text.indexOf("b.ts");
    expect(ai).toBeGreaterThan(-1);
    expect(bi).toBeGreaterThan(ai);
  });

  it("renders the raw edit count for each row", () => {
    const files: FileHeat[] = [
      { path: "/r/a.ts", edit_count: 10, agents: ["claude-code"], last_event_at: "2026-05-01T17:00:00Z" },
      { path: "/r/b.ts", edit_count: 5, agents: ["claude-code"], last_event_at: "2026-05-01T17:00:00Z" },
    ];
    const { container } = render(
      <HotspotsPanel files={files} collisions={[]} repoPath="/r" />,
    );
    expect(container.textContent).toContain("10");
    expect(container.textContent).toContain("5");
  });

  it("flags collision rows with the bad-accent left border", () => {
    const files: FileHeat[] = [
      { path: "/r/shared.ts", edit_count: 5, agents: ["claude-code", "cursor"], last_event_at: "2026-05-01T17:00:00Z" },
    ];
    const collisions: Collision[] = [
      { file_path: "/r/shared.ts", agents: ["claude-code", "cursor"] },
    ];
    const { container } = render(
      <HotspotsPanel files={files} collisions={collisions} repoPath="/r" />,
    );
    const row = container.querySelector("[title='/r/shared.ts']")?.parentElement;
    expect(row?.className).toContain("border-bad");
  });

  it("does not flag non-collision rows with the bad-accent left border", () => {
    const files: FileHeat[] = [
      { path: "/r/a.ts", edit_count: 5, agents: ["claude-code"], last_event_at: "2026-05-01T17:00:00Z" },
    ];
    const { container } = render(
      <HotspotsPanel files={files} collisions={[]} repoPath="/r" />,
    );
    const row = container.querySelector("[title='/r/a.ts']")?.parentElement;
    expect(row?.className).toContain("border-transparent");
    expect(row?.className).not.toContain("border-bad");
  });

  it("shows the agent count as a mute-ink label", () => {
    const files: FileHeat[] = [
      { path: "/r/a.ts", edit_count: 5, agents: ["a", "b", "c", "d", "e"], last_event_at: "2026-05-01T17:00:00Z" },
    ];
    const { container } = render(
      <HotspotsPanel files={files} collisions={[]} repoPath="/r" />,
    );
    expect(container.textContent).toContain("5 agents");
  });
});
