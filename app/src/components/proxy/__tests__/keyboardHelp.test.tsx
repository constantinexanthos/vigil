import "@testing-library/jest-dom/vitest";
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { KeyboardHelp } from "../KeyboardHelp";

describe("<KeyboardHelp />", () => {
  it("is not in the DOM when open=false", () => {
    render(<KeyboardHelp open={false} onClose={() => {}} />);
    expect(screen.queryByTestId("keyboard-help")).toBeNull();
  });

  it("renders all bindings when open=true", () => {
    render(<KeyboardHelp open onClose={() => {}} />);
    expect(screen.getByTestId("keyboard-help")).toBeInTheDocument();
    expect(screen.getByText("Focus the identities list")).toBeInTheDocument();
    expect(screen.getByText("Focus the decision filter")).toBeInTheDocument();
    expect(screen.getByText("Move down in the audit feed")).toBeInTheDocument();
    expect(screen.getByText("Toggle this cheatsheet")).toBeInTheDocument();
  });

  it("calls onClose when Escape is pressed", () => {
    const onClose = vi.fn();
    render(<KeyboardHelp open onClose={onClose} />);
    fireEvent.keyDown(window, { key: "Escape" });
    expect(onClose).toHaveBeenCalled();
  });

  it("calls onClose when ? is pressed again", () => {
    const onClose = vi.fn();
    render(<KeyboardHelp open onClose={onClose} />);
    fireEvent.keyDown(window, { key: "?" });
    expect(onClose).toHaveBeenCalled();
  });

  it("calls onClose when the backdrop is clicked", () => {
    const onClose = vi.fn();
    render(<KeyboardHelp open onClose={onClose} />);
    fireEvent.click(screen.getByTestId("keyboard-help"));
    expect(onClose).toHaveBeenCalled();
  });
});
