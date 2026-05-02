import "@testing-library/jest-dom/vitest";
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { AgentCard } from "../AgentCard";
import type { LiveSessionRow } from "../../../../types";

const baseSession: LiveSessionRow = {
  session_id: "s-1",
  host_kind: "iterm2",
  agent: "claude-code",
  repo_path: "/Users/me/repo",
  started_at: new Date(Date.now() - 5 * 60 * 1000).toISOString(),
  ended_at: new Date().toISOString(),
  model: "claude-opus-4-7",
  is_live: true,
  description: "editing auth.ts",
  files_added: 4,
  cost_usd: 0.42,
};

describe("AgentCard", () => {
  it("renders as a button for native a11y", () => {
    const { container } = render(
      <AgentCard agent="claude-code" sessions={[baseSession]} onSelect={() => {}} />,
    );
    const btn = container.querySelector("button");
    expect(btn).toBeInTheDocument();
    expect(btn?.getAttribute("type")).toBe("button");
  });

  it("displays display name, model, description", () => {
    render(<AgentCard agent="claude-code" sessions={[baseSession]} onSelect={() => {}} />);
    expect(screen.getByText("Claude Code")).toBeInTheDocument();
    expect(screen.getByText("claude-opus-4-7")).toBeInTheDocument();
    expect(screen.getByText("editing auth.ts")).toBeInTheDocument();
  });

  it("calls onSelect with most recent live session_id when clicked", () => {
    const older: LiveSessionRow = { ...baseSession, session_id: "s-old", started_at: new Date(Date.now() - 60 * 60 * 1000).toISOString() };
    const newer: LiveSessionRow = { ...baseSession, session_id: "s-new", started_at: new Date(Date.now() - 60 * 1000).toISOString() };
    const onSelect = vi.fn();
    render(<AgentCard agent="claude-code" sessions={[older, newer]} onSelect={onSelect} />);
    fireEvent.click(screen.getByRole("button"));
    expect(onSelect).toHaveBeenCalledWith("s-new");
  });
});
