import "@testing-library/jest-dom/vitest";
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { ConfidenceDonut } from "../components/ConfidenceDonut";

// The polish pass collapsed the donut's tri-color hue (green / amber /
// red) to a single accent — color discipline budget. Tier is now surfaced
// via `data-confidence-tier`; tests that previously asserted on rgb hex
// now assert the tier semantically. The score-text + clamping assertions
// are unchanged.

describe("ConfidenceDonut", () => {
  it("renders the score as the center text", () => {
    render(<ConfidenceDonut score={76} />);
    expect(screen.getByText("76")).toBeInTheDocument();
  });

  it("flags the high tier for scores >= 75", () => {
    const { container } = render(<ConfidenceDonut score={85} />);
    const ring = container.querySelector("[data-ring]") as HTMLElement;
    expect(ring.getAttribute("data-confidence-tier")).toBe("high");
  });

  it("flags the med tier for scores 50-74", () => {
    const { container } = render(<ConfidenceDonut score={65} />);
    const ring = container.querySelector("[data-ring]") as HTMLElement;
    expect(ring.getAttribute("data-confidence-tier")).toBe("med");
  });

  it("flags the low tier for scores < 50", () => {
    const { container } = render(<ConfidenceDonut score={30} />);
    const ring = container.querySelector("[data-ring]") as HTMLElement;
    expect(ring.getAttribute("data-confidence-tier")).toBe("low");
  });

  it("clamps score to 0-100", () => {
    render(<ConfidenceDonut score={-10} />);
    expect(screen.getByText("0")).toBeInTheDocument();
    render(<ConfidenceDonut score={150} />);
    expect(screen.getByText("100")).toBeInTheDocument();
  });
});
