import "@testing-library/jest-dom/vitest";
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { ModelPill } from "../components/ModelPill";

describe("ModelPill", () => {
  it("renders pretty long-form name", () => {
    render(<ModelPill model="claude-opus-4-7-20260501" />);
    expect(screen.getByText("Claude Opus 4.7")).toBeInTheDocument();
  });
  it("renders 'Unknown' when model is null", () => {
    render(<ModelPill model={null} />);
    expect(screen.getByText("Unknown")).toBeInTheDocument();
  });
  it("paints background with family color at low opacity", () => {
    const { container } = render(<ModelPill model="gpt-5" />);
    const pill = container.firstChild as HTMLElement;
    // jsdom normalizes hex to rgb when serializing inline styles
    expect(pill.getAttribute("style")).toMatch(/rgb\(244,\s*114,\s*182\)/);
  });
});
