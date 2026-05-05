import "@testing-library/jest-dom/vitest";
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { OverviewPane } from "../OverviewPane";
import type { LiveSessionRow, Collision, FileHeat, HourBucket } from "../../../../types";

const baseProps = {
  liveSessions: [] as LiveSessionRow[],
  collisions: [] as Collision[],
  topEditedFiles: [] as FileHeat[],
  hourlyActivity: [] as HourBucket[],
  burnRatePerHour: 0,
  activeAgents: 0,
  totalAgents: 0,
  filesToday: 0,
  onSelect: () => {},
};

describe("OverviewPane", () => {
  it("renders all 5 sections (or their empty states) when called with empty data", () => {
    const { container } = render(<OverviewPane {...baseProps} />);
    expect(container.querySelector("[aria-label='Workspace stats']")).toBeInTheDocument();
    expect(container.querySelector("[role='alert']")).toBeNull();
    expect(screen.getByText(/No active agents/i)).toBeInTheDocument();
    expect(screen.getByText(/Activity will populate/i)).toBeInTheDocument();
    expect(screen.getByText(/Quiet — no file activity/i)).toBeInTheDocument();
  });

  it("renders the collision banner when collisions are present", () => {
    render(
      <OverviewPane
        {...baseProps}
        collisions={[{ file_path: "/r/a.ts", agents: ["claude-code", "cursor"] }]}
      />,
    );
    expect(screen.getByRole("alert")).toBeInTheDocument();
  });
});
