import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { ModelChip } from "../components/ModelChip";

// The polish pass dropped per-family color tints from small primitives —
// the family is conveyed by the chip text (OPUS, GPT5) and the
// data-model-family attribute, not by a hue.

describe("ModelChip", () => {
  it("renders the short model name", () => {
    render(<ModelChip model="claude-opus-4-7-20260501" />);
    expect(screen.getByText("OPUS")).toBeInTheDocument();
  });
  it("renders nothing when model is null", () => {
    const { container } = render(<ModelChip model={null} />);
    expect(container.firstChild).toBeNull();
  });
  it("flags the claude family via data-model-family", () => {
    const { container } = render(<ModelChip model="claude-sonnet-4-6" />);
    const chip = container.querySelector("span");
    expect(chip).toBeTruthy();
    expect(chip!.getAttribute("data-model-family")).toBe("claude");
  });
});
