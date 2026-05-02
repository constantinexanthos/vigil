import "@testing-library/jest-dom/vitest";
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { AgentGrid } from "../AgentGrid";
import type { LiveSessionRow } from "../../../../types";

const live = (overrides: Partial<LiveSessionRow>): LiveSessionRow => ({
  session_id: "s",
  host_kind: "iterm2",
  agent: "claude-code",
  repo_path: null,
  started_at: new Date().toISOString(),
  ended_at: new Date().toISOString(),
  model: null,
  is_live: true,
  description: "",
  ...overrides,
});

describe("AgentGrid", () => {
  it("renders one card per distinct live agent", () => {
    const sessions: LiveSessionRow[] = [
      live({ session_id: "s1", agent: "claude-code", description: "claude work" }),
      live({ session_id: "s2", agent: "cursor", description: "cursor work" }),
      live({ session_id: "s3", agent: "claude-code", description: "more claude" }),
    ];
    render(<AgentGrid liveSessions={sessions} onSelect={() => {}} />);
    expect(screen.getByText("Claude Code")).toBeInTheDocument();
    expect(screen.getByText("Cursor")).toBeInTheDocument();
    expect(screen.getAllByRole("button")).toHaveLength(2);
  });

  it("excludes agents whose sessions are all not-live", () => {
    const sessions: LiveSessionRow[] = [
      live({ agent: "claude-code", is_live: true }),
      live({ agent: "cursor", is_live: false }),
    ];
    render(<AgentGrid liveSessions={sessions} onSelect={() => {}} />);
    expect(screen.getByText("Claude Code")).toBeInTheDocument();
    expect(screen.queryByText("Cursor")).not.toBeInTheDocument();
  });

  it("shows empty caption when no live agents", () => {
    render(<AgentGrid liveSessions={[]} onSelect={() => {}} />);
    expect(screen.getByText(/No active agents/i)).toBeInTheDocument();
  });
});
