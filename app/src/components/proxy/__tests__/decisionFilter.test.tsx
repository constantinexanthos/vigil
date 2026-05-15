import "@testing-library/jest-dom/vitest";
import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  render,
  screen,
  fireEvent,
  waitFor,
} from "@testing-library/react";
import type {
  AuditFilter,
  AuditRow,
  ProxyIdentity,
  ProxyStatus,
} from "../../../types";

// Decision filter wiring — brief acceptance #2. Selecting Coalesced in the
// dropdown causes read_proxy_db to receive filter.decision = 'coalesced'.

let invokeCalls: Array<{ cmd: string; args: unknown }> = [];
const statusPayload: ProxyStatus = {
  db_present: true,
  fixture_mode: false,
  identity_count: 1,
  audit_count: 100,
};
const identitiesPayload: ProxyIdentity[] = [
  {
    id: "cc",
    agent_name: "claude-code",
    principal: "x@y",
    scopes: ["read"],
    public_key: "pk",
    issued_at: "2026-01-01T00:00:00Z",
    expires_at: "2027-01-01T00:00:00Z",
  },
];

function makeRows(): AuditRow[] {
  return [];
}

vi.mock("@tauri-apps/api/core", () => ({
  invoke: async (cmd: string, args?: unknown) => {
    invokeCalls.push({ cmd, args });
    switch (cmd) {
      case "proxy_status":
        return statusPayload;
      case "list_identities":
        return identitiesPayload;
      case "read_proxy_db":
        return makeRows();
      case "proxy_counters":
        return [];
      default:
        throw new Error(`unknown command in test: ${cmd}`);
    }
  },
}));

import { ProxyPane } from "../ProxyPane";

beforeEach(() => {
  invokeCalls = [];
});

describe("Decision filter — acceptance #2", () => {
  it("passes filter.decision into read_proxy_db when Coalesced is selected", async () => {
    render(<ProxyPane />);
    await waitFor(() =>
      expect(screen.getByText(/Per agent · last 24h/i)).toBeInTheDocument(),
    );
    const selects = screen.getAllByRole("combobox");
    const decisionSelect = selects[3];
    expect(decisionSelect).not.toBeDisabled();

    invokeCalls = [];
    fireEvent.change(decisionSelect, { target: { value: "coalesced" } });

    await waitFor(() => {
      const lastRead = [...invokeCalls]
        .reverse()
        .find((c) => c.cmd === "read_proxy_db");
      expect(lastRead).toBeTruthy();
      const args = lastRead!.args as { filter: AuditFilter };
      expect(args.filter.decision).toBe("coalesced");
    });
  });

  it("clears filter.decision when 'All' is selected", async () => {
    render(<ProxyPane />);
    await waitFor(() => screen.getByText(/Per agent · last 24h/i));
    const selects = screen.getAllByRole("combobox");
    const decisionSelect = selects[3];

    fireEvent.change(decisionSelect, { target: { value: "rate_limited" } });
    await waitFor(() => {
      const lastRead = [...invokeCalls]
        .reverse()
        .find((c) => c.cmd === "read_proxy_db");
      const args = lastRead!.args as { filter: AuditFilter };
      expect(args.filter.decision).toBe("rate_limited");
    });

    invokeCalls = [];
    fireEvent.change(decisionSelect, { target: { value: "all" } });
    await waitFor(() => {
      const lastRead = [...invokeCalls]
        .reverse()
        .find((c) => c.cmd === "read_proxy_db");
      const args = lastRead!.args as { filter: AuditFilter };
      // null, not "all" — the UI sentinel is decoded before crossing the
      // Tauri boundary so the Rust side never has to handle that string.
      expect(args.filter.decision).toBeNull();
    });
  });
});
