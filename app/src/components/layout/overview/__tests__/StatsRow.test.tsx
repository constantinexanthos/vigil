import "@testing-library/jest-dom/vitest";
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { StatsRow } from "../StatsRow";

describe("StatsRow", () => {
  it("renders burn rate, agent count, files today", () => {
    render(
      <StatsRow burnRatePerHour={2.4} activeAgents={3} totalAgents={5} filesToday={187} />,
    );
    expect(screen.getByText(/\$2\.40/)).toBeInTheDocument();
    expect(screen.getByText(/of 5/)).toBeInTheDocument();
    expect(screen.getByText("187")).toBeInTheDocument();
  });

  it("renders em-dash when burn rate is null", () => {
    render(
      <StatsRow burnRatePerHour={null} activeAgents={3} totalAgents={5} filesToday={0} />,
    );
    expect(screen.getByText("—")).toBeInTheDocument();
  });
});
