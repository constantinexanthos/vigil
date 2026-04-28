import "@testing-library/jest-dom/vitest";
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { MilestoneFeed } from "../components/MilestoneFeed";
import type { SessionTurn } from "../types";

function turn(partial: Partial<SessionTurn>): SessionTurn {
  return {
    session_id: "s1",
    timestamp: "2026-04-23T10:00:00Z",
    role: "assistant",
    text: "",
    tool_names: [],
    source: "claude",
    ...partial,
  };
}

describe("MilestoneFeed", () => {
  it("renders null when no qualifying turns", () => {
    const { container } = render(<MilestoneFeed turns={[]} />);
    expect(container.firstChild).toBeNull();
  });

  it("includes only assistant turns with non-empty text and no tool calls", () => {
    const turns: SessionTurn[] = [
      turn({ timestamp: "2026-04-23T10:00:00Z", role: "user", text: "fix X" }),
      turn({ timestamp: "2026-04-23T10:00:01Z", role: "assistant", text: "On it.", tool_names: [] }),
      turn({ timestamp: "2026-04-23T10:00:02Z", role: "assistant", text: "", tool_names: ["Edit"] }),
      turn({ timestamp: "2026-04-23T10:00:03Z", role: "assistant", text: "Done.", tool_names: [] }),
    ];
    render(<MilestoneFeed turns={turns} />);
    expect(screen.getByText(/on it/i)).toBeInTheDocument();
    expect(screen.getByText(/done/i)).toBeInTheDocument();
    expect(screen.queryByText(/fix x/i)).not.toBeInTheDocument();
  });

  it("caps at 6 most recent milestones", () => {
    const turns: SessionTurn[] = Array.from({ length: 10 }).map((_, i) =>
      turn({ timestamp: `2026-04-23T10:00:${String(i).padStart(2, "0")}Z`, text: `step ${i}` }),
    );
    render(<MilestoneFeed turns={turns} />);
    // newest 6 = step 4..9
    expect(screen.queryByText(/step 3/)).not.toBeInTheDocument();
    expect(screen.getByText(/step 4/)).toBeInTheDocument();
    expect(screen.getByText(/step 9/)).toBeInTheDocument();
  });

  it("renders timestamps in H:MM format", () => {
    render(
      <MilestoneFeed
        turns={[turn({ timestamp: "2026-04-23T14:07:00Z", text: "Ran the tests." })]}
      />,
    );
    // We don't control the timezone in tests. Assert the shape instead.
    expect(document.querySelector("[data-milestone-time]")?.textContent).toMatch(/^\d{1,2}:\d{2}$/);
  });
});
