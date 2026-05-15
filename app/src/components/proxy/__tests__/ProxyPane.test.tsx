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
  ProxyCounter,
  ProxyIdentity,
  ProxyStatus,
} from "../../../types";

// Test rig: build deterministic fixtures, swap them in via vi.mock for the
// Tauri invoke layer. ProxyPane is rendered against jsdom; the virtualized
// audit table writes a height into the scroll container so virtualization
// kicks in even though jsdom reports 0px viewport heights by default.

function makeIdentities(): ProxyIdentity[] {
  return [
    {
      id: "fix-claude-code",
      agent_name: "claude-code",
      principal: "costa@example.com",
      scopes: ["read", "write"],
      public_key: "pk",
      issued_at: new Date(Date.now() - 86_400_000).toISOString(),
      expires_at: new Date(Date.now() + 30 * 86_400_000).toISOString(),
    },
    {
      id: "fix-cursor",
      agent_name: "cursor",
      principal: "costa@example.com",
      scopes: ["read"],
      public_key: "pk",
      issued_at: new Date(Date.now() - 86_400_000).toISOString(),
      expires_at: new Date(Date.now() + 30 * 86_400_000).toISOString(),
    },
  ];
}

function makeAuditRows(count: number): AuditRow[] {
  const rows: AuditRow[] = [];
  for (let i = 0; i < count; i++) {
    const isCC = i % 2 === 0;
    rows.push({
      id: count - i,
      ts: new Date(Date.now() - i * 1000).toISOString(),
      agent_id: isCC ? "fix-claude-code" : "fix-cursor",
      agent_name: isCC ? "claude-code" : "cursor",
      conn_id: isCC ? "conn-cc-1" : "conn-cu-1",
      direction: "client",
      msg_type: i % 5 === 0 ? "Parse" : "Query",
      query_text: isCC ? "SELECT * FROM users" : "SELECT COUNT(*) FROM events",
      bytes: 24,
      sig: `sig-${i}`,
    });
  }
  return rows;
}

function makeCounters(): ProxyCounter[] {
  return [
    {
      agent_id: "fix-claude-code",
      agent_name: "claude-code",
      queries_today: 600,
      queries_deduped: 0,
      queries_rate_limited: 0,
    },
    {
      agent_id: "fix-cursor",
      agent_name: "cursor",
      queries_today: 200,
      queries_deduped: 0,
      queries_rate_limited: 0,
    },
  ];
}

let invokeCalls: Array<{ cmd: string; args: unknown }> = [];
let auditPayload = makeAuditRows(1000);
let identitiesPayload: ProxyIdentity[] = makeIdentities();
let countersPayload: ProxyCounter[] = makeCounters();
// Default: proxy.db present but with zero rows (the "proxy installed but
// hasn't seen traffic yet" state) — renders the dashboard with the fixture
// banner so existing tests that drive the dashboard keep working. Tests
// that need the full first-launch onboarding flow override db_present to
// false; tests covering that flow live in __tests__/emptyState.test.tsx.
let statusPayload: ProxyStatus = {
  db_present: true,
  fixture_mode: true,
  identity_count: 0,
  audit_count: 0,
};

vi.mock("@tauri-apps/api/core", () => ({
  invoke: async (cmd: string, args?: unknown) => {
    invokeCalls.push({ cmd, args });
    switch (cmd) {
      case "proxy_status":
        return statusPayload;
      case "list_identities":
        return identitiesPayload;
      case "read_proxy_db":
        return filterAudit(auditPayload, args as { filter?: AuditFilter });
      case "proxy_counters":
        return countersPayload;
      default:
        throw new Error(`unknown command in test: ${cmd}`);
    }
  },
}));

function filterAudit(
  rows: AuditRow[],
  args?: { filter?: AuditFilter },
): AuditRow[] {
  if (!args?.filter) return rows;
  return rows.filter((r) => {
    if (args.filter!.agent_id && r.agent_id !== args.filter!.agent_id) {
      return false;
    }
    if (args.filter!.since_ts && r.ts < args.filter!.since_ts) {
      return false;
    }
    return true;
  });
}

import { ProxyPane } from "../ProxyPane";

beforeEach(() => {
  invokeCalls = [];
  auditPayload = makeAuditRows(1000);
  identitiesPayload = makeIdentities();
  countersPayload = makeCounters();
  // Match the module-default: db present, empty tables → dashboard renders
  // with the fixture banner. v0.1.0c+ added the onboarding panel that
  // shows when db_present is false; tests for that flow live in their own
  // file so this file's existing tests don't need to step through the
  // demo-mode opt-in to reach the dashboard.
  statusPayload = {
    db_present: true,
    fixture_mode: true,
    identity_count: 0,
    audit_count: 0,
  };
});

describe("ProxyPane", () => {
  it("renders the fixture banner when proxy is not running", async () => {
    // db_present=true + fixture_mode=true is the "proxy installed but
    // hasn't seen traffic yet" state. v0.1.0c+: db_present=false now opens
    // the onboarding panel instead — that flow is covered in emptyState.test.tsx.
    render(<ProxyPane />);
    await waitFor(() => {
      expect(
        screen.getByText(/Fixture data — proxy not running\./i),
      ).toBeInTheDocument();
    });
  });

  it("hides the banner when real data is present", async () => {
    statusPayload = {
      db_present: true,
      fixture_mode: false,
      identity_count: 2,
      audit_count: 1000,
    };
    render(<ProxyPane />);
    await waitFor(() => {
      expect(screen.getByLabelText("Issued identities")).toBeInTheDocument();
    });
    expect(
      screen.queryByText(/Fixture data — proxy not running\./i),
    ).not.toBeInTheDocument();
  });

  it("lists identities and lets one be selected", async () => {
    render(<ProxyPane />);
    const ccBtn = await screen.findByRole("button", { name: /claude-code/i });
    fireEvent.click(ccBtn);
    // Selecting an identity refires the invoke with that agent_id in the
    // filter — proves the wiring all the way to Tauri.
    await waitFor(() => {
      const lastRead = [...invokeCalls]
        .reverse()
        .find((c) => c.cmd === "read_proxy_db");
      expect(lastRead).toBeTruthy();
      const args = lastRead!.args as { filter: AuditFilter };
      expect(args.filter.agent_id).toBe("fix-claude-code");
    });
  });

  it("renders all 1000 fixture rows worth of data into the audit feed", async () => {
    render(<ProxyPane />);
    await waitFor(() => {
      // Row count badge is the cheap and stable thing to assert against —
      // the virtualizer renders only a window of nodes so DOM count varies.
      expect(screen.getByText(/1,000 rows/i)).toBeInTheDocument();
    });
  });

  it("filters by msg_type client-side without re-querying Tauri", async () => {
    render(<ProxyPane />);
    await waitFor(() => screen.getByText(/1,000 rows/i));
    const callsBefore = invokeCalls.length;
    const selects = screen.getAllByRole("combobox");
    // Order of selects in the toolbar: agent, time, msg_type, decision.
    const msgSelect = selects[2];
    fireEvent.change(msgSelect, { target: { value: "Parse" } });
    // Only Parse rows survive — every 5th row in the fixture is Parse.
    await waitFor(() => {
      expect(screen.getByText(/200 rows/i)).toBeInTheDocument();
    });
    // No new invoke happened — msg_type cuts from already-loaded rows.
    expect(invokeCalls.length).toBe(callsBefore);
  });

  it("renders counters with claude-code and cursor query totals", async () => {
    // Pre-v0.1.0c this test asserted the deduped column had a "ships in
    // v0.1.0d" tooltip and rendered zero. The column is real now (driven
    // by audit decision='coalesced'); the mock here still returns 0/0 for
    // deduped/rate-limited so the displayed zeros are now genuine counts.
    // Detailed flash-on-delta coverage lives in counterFlash.test.tsx.
    render(<ProxyPane />);
    await waitFor(() =>
      expect(screen.getByText(/Per agent · last 24h/i)).toBeInTheDocument(),
    );
    expect(screen.getByText("600")).toBeInTheDocument();
    expect(screen.getByText("200")).toBeInTheDocument();
  });

  // Note: this test used to assert the decision filter was disabled with a
  // "Ships in v0.1.0c" tooltip. v0.1.0c+ ships the decision column and the
  // filter is now functional — assertion flipped accordingly. The brief's
  // acceptance criterion #2 explicitly requires the filter to fire a Tauri
  // re-call, which contradicts the original "disabled" expectation. End-to-
  // end coverage of the new wiring lives in __tests__/decisionFilter.test.tsx.
  it("renders an enabled decision filter (functional from v0.1.0c)", async () => {
    render(<ProxyPane />);
    await waitFor(() => screen.getByText(/Per agent · last 24h/i));
    const selects = screen.getAllByRole("combobox");
    const decisionSelect = selects[3];
    expect(decisionSelect).not.toBeDisabled();
    expect(decisionSelect).toHaveAttribute(
      "title",
      "Filter audit rows by proxy decision",
    );
  });

  it("virtualizes 1000 rows — total height set, materialized DOM small", async () => {
    // jsdom doesn't lay things out, so react-virtual sees a 0×0 scroller and
    // skips rendering rows. The proof of virtualization in this environment
    // is twofold: (1) the inner sizing div has total height = rows * row
    // height, which would only be possible if the virtualizer knows about
    // all rows without rendering them; (2) the materialized DOM count stays
    // far below 1000 — even with non-zero viewport, we'd never see 1000
    // nodes if virtualization is working.
    render(<ProxyPane />);
    await waitFor(() => screen.getByText(/1,000 rows/i));
    const scroller = screen.getByTestId("audit-scroll");
    const sizing = scroller.firstElementChild as HTMLElement | null;
    expect(sizing).toBeTruthy();
    // 1000 rows * 24px row height = 24000px.
    expect(sizing!.style.height).toBe("24000px");
    const items = scroller.querySelectorAll('[style*="translateY"]');
    expect(items.length).toBeLessThan(1000);
  });

  it("surfaces command errors to the user instead of crashing", async () => {
    statusPayload = {
      db_present: true,
      fixture_mode: false,
      identity_count: 0,
      audit_count: 0,
    };
    // Force read_proxy_db to reject; verify the inline failure message.
    const original = vi.hoisted(() => globalThis as { __mockInvoke?: unknown });
    void original;
    const mod = await import("@tauri-apps/api/core");
    const spy = vi.spyOn(mod, "invoke").mockImplementation(async (cmd) => {
      if (cmd === "proxy_status") return statusPayload;
      if (cmd === "list_identities") return identitiesPayload;
      if (cmd === "proxy_counters") return countersPayload;
      throw "open proxy.db: file is not a database";
    });
    render(<ProxyPane />);
    await waitFor(() => {
      expect(
        screen.getByText(/Couldn't read proxy\.db/i),
      ).toBeInTheDocument();
    });
    spy.mockRestore();
  });
});
