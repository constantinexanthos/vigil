import "@testing-library/jest-dom/vitest";
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { ConfidenceDonut } from "../components/ConfidenceDonut";

describe("ConfidenceDonut", () => {
  it("renders the score as the center text", () => {
    render(<ConfidenceDonut score={76} />);
    expect(screen.getByText("76")).toBeInTheDocument();
  });

  it("uses green for scores >= 75", () => {
    const { container } = render(<ConfidenceDonut score={85} />);
    const ring = container.querySelector("[data-ring]") as HTMLElement;
    expect(ring.getAttribute("style")).toContain("rgb(74, 222, 128)");
  });

  it("uses amber for scores 50-74", () => {
    const { container } = render(<ConfidenceDonut score={65} />);
    const ring = container.querySelector("[data-ring]") as HTMLElement;
    expect(ring.getAttribute("style")).toContain("rgb(251, 191, 36)");
  });

  it("uses red for scores < 50", () => {
    const { container } = render(<ConfidenceDonut score={30} />);
    const ring = container.querySelector("[data-ring]") as HTMLElement;
    expect(ring.getAttribute("style")).toContain("rgb(239, 68, 68)");
  });

  it("clamps score to 0-100", () => {
    render(<ConfidenceDonut score={-10} />);
    expect(screen.getByText("0")).toBeInTheDocument();
    render(<ConfidenceDonut score={150} />);
    expect(screen.getByText("100")).toBeInTheDocument();
  });
});
