import "@testing-library/jest-dom/vitest";
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { CountersPane } from "../CountersPane";
import type { AuditRow, ProxyCounter } from "../../../types";

// Brief acceptance #5: clicking "Coalesced" sets the audit feed's
// decision filter to "coalesced"; "Total today" clears it. The drill
// strip and the audit feed share parent state, so the unit-level test
// here only checks the strip's click→callback contract.

function mkCounter(name: string, queries = 100, deduped = 0, limited = 0): ProxyCounter {
  return {
    agent_id: `ag-${name}`,
    agent_name: name,
    queries_today: queries,
    queries_deduped: deduped,
    queries_rate_limited: limited,
  };
}

function mkRow(decision: AuditRow["decision"], minutesAgo: number): AuditRow {
  return {
    id: Math.floor(Math.random() * 1e6),
    ts: new Date(Date.now() - minutesAgo * 60_000).toISOString(),
    agent_id: "ag-x",
    agent_name: "x",
    conn_id: "c1",
    direction: "client",
    msg_type: "Query",
    query_text: "SELECT 1",
    bytes: 24,
    sig: "s",
    decision,
  };
}

describe("CountersPane drill cards — acceptance #5", () => {
  it("renders three drill cards with the correct totals", () => {
    const counters = [mkCounter("a", 200, 60, 5), mkCounter("b", 300, 80, 7)];
    render(<CountersPane counters={counters} rows={[]} decisionFilter="all" onDecisionClick={() => {}} />);
    // Each drill button is queryable by its testid.
    expect(screen.getByTestId("drill-all")).toHaveTextContent("500"); // 200 + 300
    expect(screen.getByTestId("drill-coalesced")).toHaveTextContent("140"); // 60 + 80
    expect(screen.getByTestId("drill-rate_limited")).toHaveTextContent("12"); // 5 + 7
  });

  it("clicking Coalesced fires onDecisionClick('coalesced')", () => {
    const onDecisionClick = vi.fn();
    render(
      <CountersPane
        counters={[mkCounter("a", 100, 40, 2)]}
        rows={[]}
        decisionFilter="all"
        onDecisionClick={onDecisionClick}
      />,
    );
    fireEvent.click(screen.getByTestId("drill-coalesced"));
    expect(onDecisionClick).toHaveBeenCalledWith("coalesced");
  });

  it("clicking Total · today fires onDecisionClick('all')", () => {
    const onDecisionClick = vi.fn();
    render(
      <CountersPane
        counters={[mkCounter("a", 100, 40, 2)]}
        rows={[]}
        decisionFilter="coalesced"
        onDecisionClick={onDecisionClick}
      />,
    );
    fireEvent.click(screen.getByTestId("drill-all"));
    expect(onDecisionClick).toHaveBeenCalledWith("all");
  });

  it("active card carries aria-pressed=true and data-active for the matching filter", () => {
    render(
      <CountersPane
        counters={[mkCounter("a", 100, 40, 2)]}
        rows={[]}
        decisionFilter="rate_limited"
        onDecisionClick={() => {}}
      />,
    );
    const card = screen.getByTestId("drill-rate_limited");
    expect(card).toHaveAttribute("aria-pressed", "true");
    expect(card).toHaveAttribute("data-active", "true");
    // Other cards inactive
    expect(screen.getByTestId("drill-all")).toHaveAttribute("aria-pressed", "false");
  });

  it("renders a sparkline svg in each drill card", () => {
    const rows = [
      mkRow("allowed", 5),
      mkRow("coalesced", 4),
      mkRow("rate_limited", 2),
      mkRow("allowed", 1),
    ];
    render(
      <CountersPane
        counters={[mkCounter("a", 100, 40, 2)]}
        rows={rows}
        decisionFilter="all"
        onDecisionClick={() => {}}
      />,
    );
    // Three drill cards → three sparkline SVGs.
    const sparks = screen.getAllByTestId("sparkline");
    expect(sparks.length).toBe(3);
  });
});

describe("CountersPane bucket math — acceptance #4 shape", () => {
  it("a sparkline of 50 minutes of zeros followed by a ramp ends at the top", () => {
    // Construct rows that ramp over the last 10 minutes.
    const now = Date.now();
    const rows: AuditRow[] = [];
    for (let m = 9; m >= 0; m--) {
      const count = 100 - m * 10; // ramp up
      for (let n = 0; n < count; n++) {
        rows.push({
          id: rows.length,
          ts: new Date(now - m * 60_000 - n * 10).toISOString(),
          agent_id: "ag",
          agent_name: "agent",
          conn_id: "c",
          direction: "client",
          msg_type: "Query",
          query_text: "Q",
          bytes: 1,
          sig: "s",
          decision: "allowed",
        });
      }
    }
    render(
      <CountersPane
        counters={[mkCounter("a")]}
        rows={rows}
        decisionFilter="all"
        onDecisionClick={() => {}}
      />,
    );
    const totalSpark = screen.getAllByTestId("sparkline")[0];
    const d = totalSpark.querySelector("path")!.getAttribute("d")!;
    // First point at the baseline. DrillCard renders the Sparkline at
    // height=14, so baseline = height - 1 = 13.
    expect(d.startsWith("M 0.00 13.00")).toBe(true);
    // Final point should be near the top (y close to 1).
    const segments = d.split("L ");
    const last = segments[segments.length - 1].trim();
    const yLast = parseFloat(last.split(" ")[1]);
    expect(yLast).toBeLessThan(3);
  });
});
