import "@testing-library/jest-dom/vitest";
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { PulseLine } from "../components/PulseLine";

describe("PulseLine", () => {
  const now = new Date("2026-04-23T10:00:00Z").getTime();

  it("renders the verb derived from the latest tool", () => {
    render(
      <PulseLine
        toolNames={["Edit"]}
        turnAt="2026-04-23T09:59:50Z"
        now={now}
        isLive={true}
      />,
    );
    expect(screen.getByText("Editing…")).toBeInTheDocument();
  });

  it("returns null when no tool names", () => {
    const { container } = render(
      <PulseLine toolNames={[]} turnAt={null} now={now} isLive={true} />,
    );
    expect(container.firstChild).toBeNull();
  });

  it("returns null when session is not live", () => {
    const { container } = render(
      <PulseLine
        toolNames={["Bash"]}
        turnAt="2026-04-23T09:59:55Z"
        now={now}
        isLive={false}
      />,
    );
    expect(container.firstChild).toBeNull();
  });

  it("renders stale (50% opacity) when last tool was >45s ago", () => {
    const { container } = render(
      <PulseLine
        toolNames={["Bash"]}
        turnAt="2026-04-23T09:59:00Z"
        now={now}
        isLive={true}
      />,
    );
    const row = container.firstChild as HTMLElement;
    expect(row.getAttribute("style")).toContain("opacity: 0.5");
  });

  it("renders at full opacity when recent", () => {
    const { container } = render(
      <PulseLine
        toolNames={["Bash"]}
        turnAt="2026-04-23T09:59:50Z"
        now={now}
        isLive={true}
      />,
    );
    const row = container.firstChild as HTMLElement;
    expect(row.getAttribute("style") || "").not.toContain("opacity: 0.5");
  });
});
