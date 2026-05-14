import "@testing-library/jest-dom/vitest";
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, waitFor } from "@testing-library/react";
import type { ProxyStatus } from "../../../types";

// Polling tests — brief acceptance #3 (polls every 2s), #4 (stops on
// unmount), #5 (off in fixture mode). Vitest fake timers drive the
// interval ticks; the brief calls out "Mocked-time test asserts the Tauri
// command is invoked twice in 4 seconds."

let invokeCalls: Array<{ cmd: string }> = [];
let statusPayload: ProxyStatus = {
  db_present: true,
  fixture_mode: false,
  identity_count: 1,
  audit_count: 10,
};

vi.mock("@tauri-apps/api/core", () => ({
  invoke: async (cmd: string) => {
    invokeCalls.push({ cmd });
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

function readProxyDbCalls() {
  return invokeCalls.filter((c) => c.cmd === "read_proxy_db").length;
}

beforeEach(() => {
  invokeCalls = [];
  statusPayload = {
    db_present: true,
    fixture_mode: false,
    identity_count: 1,
    audit_count: 10,
  };
  vi.useFakeTimers({ shouldAdvanceTime: true });
});

afterEach(() => {
  vi.useRealTimers();
});

describe("Polling — acceptance #3, #4, #5", () => {
  it("polls read_proxy_db every 2 seconds when not in fixture mode", async () => {
    const { unmount } = render(<ProxyPane />);
    // Drain initial fetch (one read_proxy_db call). vi.runOnlyPendingTimersAsync
    // would skip past the interval setup; we await microtasks instead so
    // the initial Promise.all resolves cleanly.
    await waitFor(() => expect(readProxyDbCalls()).toBe(1));

    // Advance 4s: two interval ticks fire → two more read_proxy_db calls.
    await vi.advanceTimersByTimeAsync(2100);
    await waitFor(() => expect(readProxyDbCalls()).toBeGreaterThanOrEqual(2));
    await vi.advanceTimersByTimeAsync(2000);
    await waitFor(() => expect(readProxyDbCalls()).toBeGreaterThanOrEqual(3));

    unmount();
  });

  it("stops polling after unmount", async () => {
    const { unmount } = render(<ProxyPane />);
    await waitFor(() => expect(readProxyDbCalls()).toBe(1));
    await vi.advanceTimersByTimeAsync(2100);
    const afterOneTick = readProxyDbCalls();
    expect(afterOneTick).toBeGreaterThanOrEqual(2);

    unmount();
    await vi.advanceTimersByTimeAsync(5000);
    // No new calls after unmount — count stayed exactly where it was.
    expect(readProxyDbCalls()).toBe(afterOneTick);
  });

  it("does not poll in fixture mode", async () => {
    statusPayload = {
      db_present: false,
      fixture_mode: true,
      identity_count: 0,
      audit_count: 0,
    };
    const { unmount } = render(<ProxyPane />);
    // Fixture mode renders the onboarding panel — only the initial four
    // commands fire. Wait for the initial status read, then advance time
    // past several polling intervals and confirm no further reads happen.
    await waitFor(() =>
      expect(invokeCalls.some((c) => c.cmd === "proxy_status")).toBe(true),
    );
    const initialReads = readProxyDbCalls();
    await vi.advanceTimersByTimeAsync(8000);
    expect(readProxyDbCalls()).toBe(initialReads);
    unmount();
  });
});
