import "@testing-library/jest-dom/vitest";
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { Sparkline, buildPath } from "../Sparkline";

describe("buildPath", () => {
  it("emits M then L commands for varying data", () => {
    const path = buildPath([0, 5, 10], 100, 16);
    expect(path.startsWith("M ")).toBe(true);
    expect(path).toContain("L ");
  });

  it("collapses to a flat baseline when all values are equal", () => {
    expect(buildPath([3, 3, 3, 3], 100, 16)).toBe("M 0 15 L 100 15");
  });

  it("collapses to a flat baseline when all values are zero", () => {
    expect(buildPath([0, 0, 0], 100, 16)).toBe("M 0 15 L 100 15");
  });

  it("emits empty string for empty data", () => {
    expect(buildPath([], 100, 16)).toBe("");
  });

  it("places peak at top of the canvas", () => {
    const path = buildPath([0, 100, 0], 100, 16);
    // Middle point should be at the top (y close to 1), bookends at baseline (y=15)
    expect(path).toContain("M 0.00 15.00");
    expect(path).toContain("L 50.00 1.00");
    expect(path).toContain("L 100.00 15.00");
  });
});

describe("<Sparkline />", () => {
  it("renders SVG with the computed path", () => {
    render(<Sparkline data={[1, 2, 3, 4]} />);
    const svg = screen.getByTestId("sparkline");
    expect(svg.tagName.toLowerCase()).toBe("svg");
    expect(svg.querySelector("path")).toBeTruthy();
  });

  it("renders the brief's acceptance shape: ramp at the end after flat zeros", () => {
    // Spec: "a counter that was 0 for 50 minutes then ramped to 1000 over
    // the last 10 shows the right shape." We render the SVG and assert the
    // last point is near the top while the first is at the baseline.
    const buckets = [...new Array(50).fill(0), 200, 400, 600, 700, 800, 850, 900, 950, 980, 1000];
    render(<Sparkline data={buckets} width={100} height={16} />);
    const path = screen.getByTestId("sparkline").querySelector("path");
    const d = path!.getAttribute("d")!;
    // First point at baseline (y=15)
    expect(d.startsWith("M 0.00 15.00")).toBe(true);
    // Last segment must end near the top (y close to 1)
    const segments = d.split("L ");
    const last = segments[segments.length - 1].trim();
    const yLast = parseFloat(last.split(" ")[1]);
    expect(yLast).toBeLessThan(2);
  });

  it("exposes aria-label when provided, hides itself otherwise", () => {
    const { rerender } = render(<Sparkline data={[1, 2, 3]} ariaLabel="claude-code last 60m" />);
    expect(screen.getByLabelText("claude-code last 60m")).toBeInTheDocument();

    rerender(<Sparkline data={[1, 2, 3]} />);
    expect(screen.getByTestId("sparkline")).toHaveAttribute("aria-hidden", "true");
  });

  it("returns null for empty data", () => {
    const { container } = render(<Sparkline data={[]} />);
    expect(container.firstChild).toBeNull();
  });
});
