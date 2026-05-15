import "@testing-library/jest-dom/vitest";
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { ModelPill } from "../components/ModelPill";

// The polish pass dropped per-family color tints from small primitives.
// Family is now surfaced via data-model-family; rgb-hex assertions retired.

describe("ModelPill", () => {
  it("renders pretty long-form name", () => {
    render(<ModelPill model="claude-opus-4-7-20260501" />);
    expect(screen.getByText("Claude Opus 4.7")).toBeInTheDocument();
  });
  it("renders nothing when model is null", () => {
    const { container } = render(<ModelPill model={null} />);
    expect(container.firstChild).toBeNull();
  });
  it("flags the openai family via data-model-family", () => {
    const { container } = render(<ModelPill model="gpt-5" />);
    const pill = container.firstChild as HTMLElement;
    expect(pill.getAttribute("data-model-family")).toBe("openai");
  });
});
