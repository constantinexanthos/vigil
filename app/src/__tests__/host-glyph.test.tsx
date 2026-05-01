import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { HostGlyph } from "../components/HostGlyph";
import { HOST_KINDS } from "../types";

describe("HostGlyph", () => {
  it("renders an SVG for every known HostKind", () => {
    for (const kind of HOST_KINDS) {
      const { container } = render(<HostGlyph hostKind={kind} />);
      const svg = container.querySelector("svg");
      expect(svg, `expected svg for ${kind}`).toBeTruthy();
    }
  });

  it("uses the host token color (Ghostty green)", () => {
    const { container } = render(<HostGlyph hostKind="ghostty" />);
    expect(container.innerHTML.toLowerCase()).toContain("#00ff88");
  });

  it("uses VS Code blue (#0ea5e9)", () => {
    const { container } = render(<HostGlyph hostKind="vscode" />);
    expect(container.innerHTML.toLowerCase()).toContain("#0ea5e9");
  });

  it("uses Conductor purple (#a78bfa)", () => {
    const { container } = render(<HostGlyph hostKind="conductor" />);
    expect(container.innerHTML.toLowerCase()).toContain("#a78bfa");
  });

  it("falls back to a colored dot for unknown HostKind", () => {
    // Cast forces an invalid value through; runtime should not throw.
    const { container } = render(<HostGlyph hostKind={"bogus" as never} />);
    const svg = container.querySelector("svg");
    expect(svg).toBeTruthy();
  });

  it("renders 'Other' fallback dot for unknown kind in neutral gray", () => {
    const { container } = render(<HostGlyph hostKind="unknown" />);
    expect(container.innerHTML.toLowerCase()).toContain("#9ca3af");
  });

  it("respects custom size", () => {
    const { container } = render(<HostGlyph hostKind="ghostty" size={28} />);
    const svg = container.querySelector("svg");
    expect(svg?.getAttribute("width")).toBe("28");
    expect(svg?.getAttribute("height")).toBe("28");
  });

  it("defaults to 16px when size is omitted", () => {
    const { container } = render(<HostGlyph hostKind="ghostty" />);
    const svg = container.querySelector("svg");
    expect(svg?.getAttribute("width")).toBe("16");
  });

  it("includes an aria-label", () => {
    const { container } = render(<HostGlyph hostKind="ghostty" />);
    const svg = container.querySelector("svg");
    expect(svg?.getAttribute("aria-label")).toBeTruthy();
  });

  it("Conductor host renders an aria-labeled SVG in Conductor purple", () => {
    const { container } = render(<HostGlyph hostKind="conductor" />);
    const svg = container.querySelector("svg");
    expect(svg?.getAttribute("aria-label")).toBeTruthy();
    expect(container.innerHTML.toLowerCase()).toContain("#a78bfa");
  });

  it("Cursor host renders an aria-labeled SVG in Cursor cyan", () => {
    const { container } = render(<HostGlyph hostKind="cursor" />);
    const svg = container.querySelector("svg");
    expect(svg?.getAttribute("aria-label")).toBeTruthy();
    expect(container.innerHTML.toLowerCase()).toContain("#00d9ff");
  });
});
