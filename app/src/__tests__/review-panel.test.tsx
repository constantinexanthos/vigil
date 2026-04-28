import "@testing-library/jest-dom/vitest";
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { ReviewPanel } from "../components/ReviewPanel";
import type { ReviewSignals } from "../types";

function signals(partial: Partial<ReviewSignals> = {}): ReviewSignals {
  return {
    confidence: 76,
    confidence_reason: "Small focused change — 3 file(s) touched.",
    file_count: 3,
    has_tests: true,
    collisions: [],
    ...partial,
  };
}

describe("ReviewPanel", () => {
  it("renders an analyzing state when signals are null", () => {
    render(<ReviewPanel signals={null} />);
    expect(screen.getByText(/analyzing/i)).toBeInTheDocument();
  });

  it("renders confidence score + reason", () => {
    render(<ReviewPanel signals={signals({ confidence: 82, confidence_reason: "Small change." })} />);
    expect(screen.getByText("82")).toBeInTheDocument();
    expect(screen.getByText("Small change.")).toBeInTheDocument();
  });

  it("renders collision cards when present", () => {
    render(
      <ReviewPanel
        signals={signals({
          collisions: [
            { file_path: "src/auth.ts", agents: ["claude-code", "cursor"] },
          ],
        })}
      />,
    );
    expect(screen.getByText(/src\/auth\.ts/)).toBeInTheDocument();
    expect(screen.getByText(/claude-code/)).toBeInTheDocument();
    expect(screen.getByText(/cursor/)).toBeInTheDocument();
  });

  it("shows a 'tests added' checkmark when has_tests is true", () => {
    render(<ReviewPanel signals={signals({ has_tests: true })} />);
    expect(screen.getByText(/tests added/i)).toBeInTheDocument();
  });

  it("omits the tests checkmark when has_tests is false", () => {
    render(<ReviewPanel signals={signals({ has_tests: false })} />);
    expect(screen.queryByText(/tests added/i)).not.toBeInTheDocument();
  });

  it("shows the file count", () => {
    render(<ReviewPanel signals={signals({ file_count: 7 })} />);
    expect(screen.getByText(/7 files/i)).toBeInTheDocument();
  });
});
