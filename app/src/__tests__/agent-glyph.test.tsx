import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { AgentGlyph } from "../components/AgentGlyph";

describe("AgentGlyph", () => {
  it("renders an SVG for known agents", () => {
    const { container } = render(<AgentGlyph agent="claude-code" />);
    const svg = container.querySelector("svg");
    expect(svg).toBeTruthy();
  });

  it("uses Claude orange (#d97757) for claude-code", () => {
    const { container } = render(<AgentGlyph agent="claude-code" />);
    const html = container.innerHTML.toLowerCase();
    expect(html).toContain("#d97757");
  });

  it("uses Cursor cyan (#00d9ff) for cursor", () => {
    const { container } = render(<AgentGlyph agent="cursor" />);
    expect(container.innerHTML.toLowerCase()).toContain("#00d9ff");
  });

  it("uses Conductor purple (#a78bfa) for conductor", () => {
    const { container } = render(<AgentGlyph agent="conductor" />);
    expect(container.innerHTML.toLowerCase()).toContain("#a78bfa");
  });

  it("uses Codex pink (#f472b6) for codex", () => {
    const { container } = render(<AgentGlyph agent="codex" />);
    expect(container.innerHTML.toLowerCase()).toContain("#f472b6");
  });

  it("renders a letter-monogram for aider", () => {
    const { container } = render(<AgentGlyph agent="aider" />);
    const text = container.querySelector("text");
    expect(text).toBeTruthy();
    expect(text?.textContent).toBe("A");
  });

  it("renders a letter-monogram for cline", () => {
    const { container } = render(<AgentGlyph agent="cline" />);
    expect(container.querySelector("text")?.textContent).toBe("C");
  });

  it("falls back to a colored dot for unknown agents", () => {
    const { container } = render(<AgentGlyph agent="totally-unknown-agent" />);
    const svg = container.querySelector("svg");
    expect(svg).toBeTruthy();
    // fallback uses neutral gray
    expect(container.innerHTML.toLowerCase()).toContain("#6b7084");
  });

  it("respects custom size", () => {
    const { container } = render(<AgentGlyph agent="claude-code" size={32} />);
    const svg = container.querySelector("svg");
    expect(svg?.getAttribute("width")).toBe("32");
    expect(svg?.getAttribute("height")).toBe("32");
  });

  it("defaults to 16px when size is omitted", () => {
    const { container } = render(<AgentGlyph agent="claude-code" />);
    const svg = container.querySelector("svg");
    expect(svg?.getAttribute("width")).toBe("16");
    expect(svg?.getAttribute("height")).toBe("16");
  });

  it("includes an aria-label", () => {
    const { container } = render(<AgentGlyph agent="claude-code" />);
    const svg = container.querySelector("svg");
    expect(svg?.getAttribute("aria-label")).toBeTruthy();
  });
});
