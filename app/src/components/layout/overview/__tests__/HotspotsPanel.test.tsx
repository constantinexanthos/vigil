import "@testing-library/jest-dom/vitest";
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { HotspotsPanel } from "../HotspotsPanel";
import type { FileHeat, Collision } from "../../../../types";

describe("HotspotsPanel", () => {
  it("renders empty caption when no hot files", () => {
    render(<HotspotsPanel files={[]} collisions={[]} repoPath={null} />);
    expect(screen.getByText(/Quiet — no file activity/i)).toBeInTheDocument();
  });

  it("renders rows ordered by edit_count desc (already sorted server-side)", () => {
    const files: FileHeat[] = [
      { path: "/r/a.ts", edit_count: 10, agents: ["claude-code"], last_event_at: "2026-05-01T17:00:00Z" },
      { path: "/r/b.ts", edit_count: 5, agents: ["cursor"], last_event_at: "2026-05-01T17:00:00Z" },
    ];
    const { container } = render(<HotspotsPanel files={files} collisions={[]} repoPath="/r" />);
    const rows = container.querySelectorAll("tbody tr");
    expect(rows).toHaveLength(2);
    expect(rows[0].textContent).toContain("a.ts");
    expect(rows[1].textContent).toContain("b.ts");
  });

  it("normalizes heat bar widths with top row at 100%", () => {
    const files: FileHeat[] = [
      { path: "/r/a.ts", edit_count: 10, agents: ["claude-code"], last_event_at: "2026-05-01T17:00:00Z" },
      { path: "/r/b.ts", edit_count: 5, agents: ["claude-code"], last_event_at: "2026-05-01T17:00:00Z" },
    ];
    const { container } = render(<HotspotsPanel files={files} collisions={[]} repoPath="/r" />);
    const bars = container.querySelectorAll("[role='progressbar'] > div");
    expect(bars).toHaveLength(2);
    expect((bars[0] as HTMLElement).style.width).toBe("100%");
    expect((bars[1] as HTMLElement).style.width).toBe("50%");
  });

  it("renders triangle marker on rows that are also collisions", () => {
    const files: FileHeat[] = [
      { path: "/r/shared.ts", edit_count: 5, agents: ["claude-code", "cursor"], last_event_at: "2026-05-01T17:00:00Z" },
    ];
    const collisions: Collision[] = [{ file_path: "/r/shared.ts", agents: ["claude-code", "cursor"] }];
    const { container } = render(<HotspotsPanel files={files} collisions={collisions} repoPath="/r" />);
    expect(container.textContent).toContain("▲");
  });

  it("does not render triangle marker for non-collision rows", () => {
    const files: FileHeat[] = [
      { path: "/r/a.ts", edit_count: 5, agents: ["claude-code"], last_event_at: "2026-05-01T17:00:00Z" },
    ];
    const { container } = render(<HotspotsPanel files={files} collisions={[]} repoPath="/r" />);
    expect(container.textContent).not.toContain("▲");
  });

  it("shows up to 3 agent dots, '+N' beyond", () => {
    const files: FileHeat[] = [
      { path: "/r/a.ts", edit_count: 5, agents: ["a", "b", "c", "d", "e"], last_event_at: "2026-05-01T17:00:00Z" },
    ];
    const { container } = render(<HotspotsPanel files={files} collisions={[]} repoPath="/r" />);
    expect(container.textContent).toContain("+2");
  });
});
