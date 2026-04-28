import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { ModelChip } from "../components/ModelChip";

describe("ModelChip", () => {
  it("renders the short model name", () => {
    render(<ModelChip model="claude-opus-4-7-20260501" />);
    expect(screen.getByText("OPUS")).toBeInTheDocument();
  });
  it("renders nothing when model is null", () => {
    const { container } = render(<ModelChip model={null} />);
    expect(container.firstChild).toBeNull();
  });
  it("paints with the Claude family color when model is claude-family", () => {
    const { container } = render(<ModelChip model="claude-sonnet-4-6" />);
    const chip = container.querySelector("span");
    expect(chip).toBeTruthy();
    // jsdom normalizes hex colors to rgb() when serializing inline styles,
    // so assert against the rgb form of #a78bfa (167, 139, 250).
    expect(chip!.getAttribute("style")).toContain("rgb(167, 139, 250)");
  });
});
