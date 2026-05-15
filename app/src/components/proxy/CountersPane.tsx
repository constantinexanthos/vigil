import { useEffect, useMemo, useRef, useState } from "react";
import type { AuditRow, ProxyCounter } from "../../types";
import { Sparkline } from "./Sparkline";

interface Props {
  counters: ProxyCounter[];
  // `rows` powers the 60-min sparklines on the drill cards. Optional so
  // the focused counterFlash unit tests can stay short — they don't care
  // about the strip's history shape.
  rows?: AuditRow[];
  decisionFilter?: string;
  onDecisionClick?: (decision: string) => void;
}

export const FLASH_MS = 400;
export const SPARKLINE_WINDOW_MIN = 60;

// FlashingNumber renders a tabular-numeral count and briefly tints when the
// value changes. Toned down from the v0.1.0c "flash" (was bg-cyan-400/15);
// now a 1px borderline of the accent at 30% opacity — present, not loud.
function FlashingNumber({
  value,
  className,
  testId,
}: {
  value: number;
  className?: string;
  testId?: string;
}) {
  const [flash, setFlash] = useState(false);
  const prev = useRef<number | null>(null);
  useEffect(() => {
    if (prev.current === null) {
      prev.current = value;
      return;
    }
    if (prev.current !== value) {
      prev.current = value;
      setFlash(true);
      const t = setTimeout(() => setFlash(false), FLASH_MS);
      return () => clearTimeout(t);
    }
  }, [value]);
  return (
    <span
      className={`tabular-nums transition-colors duration-base ${flash ? "text-vigil-accent" : (className ?? "")}`}
      data-flash={flash ? "true" : undefined}
      data-testid={testId}
    >
      {value.toLocaleString()}
    </span>
  );
}

// bucketByMinute scans audit rows and produces SPARKLINE_WINDOW_MIN counts
// for the most recent window, optionally filtered by decision. Bucket 0 is
// the oldest minute, bucket N-1 is the newest. Rows outside the window are
// dropped silently — the call site already knows the data may be sparse.
function bucketByMinute(
  rows: AuditRow[],
  decisionFilter: string | null,
  now = Date.now(),
  windowMin = SPARKLINE_WINDOW_MIN,
): number[] {
  const buckets = new Array(windowMin).fill(0);
  const cutoff = now - windowMin * 60_000;
  for (const r of rows) {
    if (decisionFilter && r.decision !== decisionFilter) continue;
    const ts = new Date(r.ts).getTime();
    if (Number.isNaN(ts) || ts < cutoff || ts > now) continue;
    const minutesAgo = Math.floor((now - ts) / 60_000);
    const idx = windowMin - 1 - minutesAgo;
    if (idx >= 0 && idx < windowMin) buckets[idx]++;
  }
  return buckets;
}

// CountersPane renders two layers:
//   1. Top strip of three drill-cards (Total / Coalesced / Rate-limited),
//      each with a 60-min sparkline and a click handler that filters the
//      audit feed below.
//   2. Per-agent rollup table (queries / deduped / rate-limited per agent).
// Cards above, table below — the strip is the at-a-glance signal; the table
// is the breakdown when the user wants the per-agent question.
export function CountersPane({
  counters,
  rows = [],
  decisionFilter = "all",
  onDecisionClick,
}: Props) {
  const sorted = useMemo(
    () => [...counters].sort((a, b) => b.queries_today - a.queries_today),
    [counters],
  );

  const totals = useMemo(() => {
    const total = counters.reduce((s, c) => s + c.queries_today, 0);
    const deduped = counters.reduce((s, c) => s + c.queries_deduped, 0);
    const limited = counters.reduce((s, c) => s + c.queries_rate_limited, 0);
    return { total, deduped, limited };
  }, [counters]);

  const sparkAll = useMemo(() => bucketByMinute(rows, null), [rows]);
  const sparkCoalesced = useMemo(() => bucketByMinute(rows, "coalesced"), [rows]);
  const sparkRateLimited = useMemo(() => bucketByMinute(rows, "rate_limited"), [rows]);

  const handle = (decision: string) => onDecisionClick?.(decision);

  return (
    <section aria-label="Per-agent counters" className="border-b border-vigil-rule">
      <div
        className="grid grid-cols-3 gap-px bg-vigil-rule"
        data-testid="counters-strip"
      >
        <DrillCard
          label="Total · today"
          value={totals.total}
          spark={sparkAll}
          decisionValue="all"
          active={decisionFilter === "all"}
          onClick={handle}
        />
        <DrillCard
          label="Coalesced"
          value={totals.deduped}
          spark={sparkCoalesced}
          decisionValue="coalesced"
          active={decisionFilter === "coalesced"}
          onClick={handle}
        />
        <DrillCard
          label="Rate-limited"
          value={totals.limited}
          spark={sparkRateLimited}
          decisionValue="rate_limited"
          active={decisionFilter === "rate_limited"}
          onClick={handle}
        />
      </div>

      <PerAgentTable sorted={sorted} />
    </section>
  );
}

// PerAgentTable is collapsed by default — the drill strip above already
// answers the at-a-glance question. Operators who want the per-agent
// breakdown click the chevron. Collapsing it gives the audit feed below
// the vertical space it needs to hit the brief's 25+ rows target.
function PerAgentTable({ sorted }: { sorted: ProxyCounter[] }) {
  // Open by default: per-agent counts are valuable at a glance and the
  // brief's "stays on screen" rule keeps them visible without an extra
  // click. The toggle lets power users reclaim the vertical real estate
  // when they want maximum audit-feed density.
  const [open, setOpen] = useState(true);
  return (
    <div className="border-t border-vigil-rule">
      <button
        type="button"
        data-testid="per-agent-toggle"
        aria-expanded={open}
        className="w-full flex items-center justify-between px-4 h-7 text-[10px] uppercase tracking-[0.10em] text-vigil-mute hover:text-vigil-ink transition-colors duration-fast"
        onClick={() => setOpen((v) => !v)}
      >
        <span>Per agent · last 24h</span>
        <span aria-hidden className="font-mono text-[10px]">
          {open ? "−" : "+"}
        </span>
      </button>
      {open &&
        (sorted.length === 0 ? (
          <div className="px-4 pb-3 text-[12px] text-vigil-mute">No traffic yet.</div>
        ) : (
          <div
            className="grid grid-cols-[1fr_auto_auto_auto] gap-x-6 px-4 pb-3 text-[12px] tabular-nums"
            data-testid="counters-grid"
          >
            <div className="text-[10px] uppercase tracking-[0.10em] text-vigil-mute col-span-1">Agent</div>
            <div className="text-[10px] uppercase tracking-[0.10em] text-vigil-mute text-right">Queries</div>
            <div className="text-[10px] uppercase tracking-[0.10em] text-vigil-mute text-right">Deduped</div>
            <div className="text-[10px] uppercase tracking-[0.10em] text-vigil-mute text-right">Rate-limited</div>
            {sorted.map((c) => {
              const key = c.agent_id ?? "(unauth)";
              return (
                <div key={key} className="contents">
                  <div className="text-vigil-ink truncate">
                    {c.agent_name ?? <span className="text-vigil-mute">unauthenticated</span>}
                  </div>
                  <FlashingNumber
                    value={c.queries_today}
                    className="text-right text-vigil-ink"
                    testId={`counter-queries-${key}`}
                  />
                  <FlashingNumber
                    value={c.queries_deduped}
                    className="text-right text-vigil-mute"
                    testId={`counter-deduped-${key}`}
                  />
                  <FlashingNumber
                    value={c.queries_rate_limited}
                    className="text-right text-vigil-mute"
                    testId={`counter-ratelimited-${key}`}
                  />
                </div>
              );
            })}
          </div>
        ))}
    </div>
  );
}

function DrillCard({
  label,
  value,
  spark,
  decisionValue,
  active,
  onClick,
}: {
  label: string;
  value: number;
  spark: number[];
  decisionValue: string;
  active: boolean;
  onClick: (d: string) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onClick(decisionValue)}
      data-testid={`drill-${decisionValue}`}
      data-active={active ? "true" : undefined}
      aria-pressed={active}
      className={`text-left bg-vigil-bg px-4 py-2 flex flex-col gap-1 transition-colors duration-fast hover:bg-vigil-surface focus:outline-none focus-visible:bg-vigil-surface ${
        active ? "text-vigil-accent" : "text-vigil-ink"
      }`}
    >
      <div className="text-[10px] uppercase tracking-[0.10em] text-vigil-mute">{label}</div>
      <div className="text-[15px] font-medium tabular-nums leading-none">
        <FlashingNumber value={value} />
      </div>
      <Sparkline
        data={spark}
        width={140}
        height={14}
        className={active ? "text-vigil-accent" : "text-vigil-mute"}
        ariaLabel={`${label} last 60 minutes`}
      />
    </button>
  );
}
