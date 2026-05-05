import "@testing-library/jest-dom/vitest";
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { HourlyChart, densifyBuckets } from "../HourlyChart";
import type { HourBucket } from "../../../../types";

describe("densifyBuckets", () => {
  it("returns 24 contiguous buckets", () => {
    const result = densifyBuckets([], new Date("2026-05-01T18:30:00Z"));
    expect(result).toHaveLength(24);
  });

  it("fills gaps with empty by_agent arrays", () => {
    const sparse: HourBucket[] = [
      { hour_iso: "2026-05-01T17:00:00Z", by_agent: [{ agent: "claude-code", count: 3 }] },
    ];
    const result = densifyBuckets(sparse, new Date("2026-05-01T18:30:00Z"));
    const filled = result.find((b) => b.hour_iso === "2026-05-01T17:00:00Z");
    expect(filled?.by_agent).toEqual([{ agent: "claude-code", count: 3 }]);
    const empty = result.find((b) => b.hour_iso === "2026-05-01T16:00:00Z");
    expect(empty?.by_agent).toEqual([]);
  });
});

describe("HourlyChart", () => {
  it("renders empty-state caption when no buckets have data", () => {
    render(<HourlyChart buckets={[]} now={new Date("2026-05-01T18:00:00Z")} />);
    expect(screen.getByText(/Activity will populate/i)).toBeInTheDocument();
  });

  it("renders chart with bars when data is present", () => {
    const data: HourBucket[] = [
      { hour_iso: "2026-05-01T17:00:00Z", by_agent: [{ agent: "claude-code", count: 5 }] },
    ];
    const { container } = render(
      <HourlyChart buckets={data} now={new Date("2026-05-01T18:00:00Z")} />,
    );
    expect(container.querySelector("svg")).toBeInTheDocument();
    expect(screen.queryByText(/Activity will populate/i)).not.toBeInTheDocument();
  });

  it("renders 5 X-axis tick labels (00:00, 06:00, 12:00, 18:00, now)", () => {
    const data: HourBucket[] = [
      { hour_iso: "2026-05-01T17:00:00Z", by_agent: [{ agent: "claude-code", count: 1 }] },
    ];
    render(<HourlyChart buckets={data} now={new Date("2026-05-01T18:00:00Z")} />);
    expect(screen.getByText("00:00")).toBeInTheDocument();
    expect(screen.getByText("06:00")).toBeInTheDocument();
    expect(screen.getByText("12:00")).toBeInTheDocument();
    expect(screen.getByText("18:00")).toBeInTheDocument();
    expect(screen.getByText("now")).toBeInTheDocument();
  });

  it("provides accessible label and hidden table mirror", () => {
    const data: HourBucket[] = [
      { hour_iso: "2026-05-01T17:00:00Z", by_agent: [{ agent: "claude-code", count: 2 }] },
    ];
    const { container } = render(
      <HourlyChart buckets={data} now={new Date("2026-05-01T18:00:00Z")} />,
    );
    expect(container.querySelector('svg[role="img"]')).toBeInTheDocument();
    expect(container.querySelector("table")).toBeInTheDocument();
  });
});
