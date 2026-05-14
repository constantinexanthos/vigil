import "@testing-library/jest-dom/vitest";
import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  render,
  screen,
  fireEvent,
  waitFor,
} from "@testing-library/react";
import type { ProxyStatus } from "../../../types";

// Empty-state / onboarding tests. Brief acceptance #6 (empty state renders)
// and #7 (demo fallback link). New file per the brief's "add NEW tests in
// NEW files for new behaviors" rule.

let statusPayload: ProxyStatus = {
  db_present: false,
  fixture_mode: true,
  identity_count: 0,
  audit_count: 0,
};

vi.mock("@tauri-apps/api/core", () => ({
  invoke: async (cmd: string) => {
    switch (cmd) {
      case "proxy_status":
        return statusPayload;
      case "list_identities":
        return [];
      case "read_proxy_db":
        return [];
      case "proxy_counters":
        return [];
      default:
        throw new Error(`unknown command in test: ${cmd}`);
    }
  },
}));

import { ProxyPane } from "../ProxyPane";
import { EmptyStateOnboarding } from "../EmptyStateOnboarding";

beforeEach(() => {
  statusPayload = {
    db_present: false,
    fixture_mode: true,
    identity_count: 0,
    audit_count: 0,
  };
});

describe("EmptyStateOnboarding — first launch (acceptance #6, #7)", () => {
  it("renders the onboarding panel when proxy.db is missing", async () => {
    render(<ProxyPane />);
    await waitFor(() =>
      expect(screen.getByTestId("empty-state-onboarding")).toBeInTheDocument(),
    );
    expect(screen.getByText("No proxy running yet.")).toBeInTheDocument();
    expect(
      screen.getByText(/Vigil sits between your AI agents and your databases/i),
    ).toBeInTheDocument();
  });

  it("shows all three quickstart commands", async () => {
    render(<ProxyPane />);
    await waitFor(() => screen.getByTestId("empty-state-onboarding"));
    const cmds = screen.getAllByTestId("copyable-command");
    expect(cmds).toHaveLength(3);
    expect(cmds[0]).toHaveTextContent("brew install vigil");
    expect(cmds[1]).toHaveTextContent("vigil-proxy");
    expect(cmds[1]).toHaveTextContent("--postgres-listen :7432");
    expect(cmds[1]).toHaveTextContent("--postgres-upstream localhost:5432");
    expect(cmds[2]).toHaveTextContent(/psql -h localhost -p 7432/);
  });

  it("links to the GitHub README", async () => {
    render(<ProxyPane />);
    await waitFor(() => screen.getByTestId("empty-state-onboarding"));
    const link = screen.getByRole("link", { name: /full guide on github/i });
    expect(link).toHaveAttribute(
      "href",
      "https://github.com/constantinexanthos/vigil#readme",
    );
    expect(link).toHaveAttribute("target", "_blank");
  });

  it("hides the onboarding panel and shows the dashboard when demo link is clicked", async () => {
    render(<ProxyPane />);
    await waitFor(() => screen.getByTestId("empty-state-onboarding"));
    const demoBtn = screen.getByTestId("show-demo-link");
    fireEvent.click(demoBtn);
    await waitFor(() =>
      expect(screen.queryByTestId("empty-state-onboarding")).not.toBeInTheDocument(),
    );
    // Dashboard's fixture banner now visible, since db_present=false +
    // fixture_mode=true + showDemo=true → dashboard with banner.
    expect(
      screen.getByText(/Fixture data — proxy not running\./i),
    ).toBeInTheDocument();
  });

  it("renders dashboard, not onboarding, when proxy.db exists with rows", async () => {
    statusPayload = {
      db_present: true,
      fixture_mode: false,
      identity_count: 5,
      audit_count: 1000,
    };
    render(<ProxyPane />);
    await waitFor(() =>
      expect(screen.queryByTestId("empty-state-onboarding")).not.toBeInTheDocument(),
    );
  });

  it("copies command to clipboard on click", async () => {
    // Mock navigator.clipboard.writeText — jsdom doesn't provide it by default.
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText },
      configurable: true,
    });
    render(<EmptyStateOnboarding onShowDemo={() => {}} />);
    const cmds = screen.getAllByTestId("copyable-command");
    fireEvent.click(cmds[0]);
    await waitFor(() => expect(writeText).toHaveBeenCalledWith("brew install vigil"));
  });

  it("snapshot of onboarding content stays stable", async () => {
    render(<ProxyPane />);
    await waitFor(() => screen.getByTestId("empty-state-onboarding"));
    // Snapshot the visible text content of the onboarding panel — full DOM
    // would over-couple to className changes; text content is what the user
    // actually reads.
    const panel = screen.getByTestId("empty-state-onboarding");
    const text = panel.textContent ?? "";
    expect(text).toMatchInlineSnapshot(
      `
      "ProxyNo proxy running yet.Vigil sits between your AI agents and your databases. Once you start the proxy, every query will appear here — identified, audited, and shaped.1Installbrew install vigilCopy2Start the proxyvigil-proxy \\
        --postgres-listen :7432 \\
        --postgres-upstream localhost:5432Copy3Point your clientPGPASSWORD=… psql -h localhost -p 7432 -U postgresCopyFull guide on GitHub →or try the demo dashboard with fixture data →"
    `,
    );
  });
});
