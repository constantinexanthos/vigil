import "@testing-library/jest-dom/vitest";
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { TopBar } from "../components/TopBar";

const baseProps = {
  connected: true,
  hasNewEvents: false,
  onOpenCmd: () => {},
  viewMode: "overview" as const,
  setViewMode: vi.fn(),
  hasSelectedSession: true,
};

describe("TopBar mode link row", () => {
  it("renders Overview and Session links", () => {
    render(<TopBar {...baseProps} />);
    expect(screen.getByText("Overview")).toBeInTheDocument();
    expect(screen.getByText("Session")).toBeInTheDocument();
  });

  it("Overview link is the active state when viewMode='overview'", () => {
    // Active state used to assert text-white; the vigil-* palette migration
    // switches to text-vigil-ink (the new ink token). The intent of the
    // test — "active tab has ink-colored text" — is preserved.
    render(<TopBar {...baseProps} viewMode="overview" />);
    const overview = screen.getByText("Overview").closest("button");
    expect(overview?.className).toContain("text-vigil-ink");
  });

  it("Session link is disabled when no session selected", () => {
    render(<TopBar {...baseProps} hasSelectedSession={false} />);
    const session = screen.getByText("Session").closest("button");
    expect(session?.disabled).toBe(true);
  });

  it("clicking Overview calls setViewMode('overview')", () => {
    const setViewMode = vi.fn();
    render(<TopBar {...baseProps} viewMode="session" setViewMode={setViewMode} />);
    fireEvent.click(screen.getByText("Overview"));
    expect(setViewMode).toHaveBeenCalledWith("overview");
  });

  it("clicking enabled Session calls setViewMode('session')", () => {
    const setViewMode = vi.fn();
    render(<TopBar {...baseProps} viewMode="overview" setViewMode={setViewMode} />);
    fireEvent.click(screen.getByText("Session"));
    expect(setViewMode).toHaveBeenCalledWith("session");
  });

  it("Session link has title attribute with keyboard hint", () => {
    render(<TopBar {...baseProps} />);
    const session = screen.getByText("Session").closest("button");
    expect(session?.getAttribute("title")).toMatch(/⌘2|Cmd\+2/);
  });
});
