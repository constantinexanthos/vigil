import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import type { AuditRow } from "../../types";

export interface AuditFeedHandle {
  focusFilter: () => void;
  focusList: () => void;
}

interface Props {
  rows: AuditRow[];
  agentFilter: string | null;
  setAgentFilter: (v: string | null) => void;
  windowMinutes: number;
  setWindowMinutes: (v: number) => void;
  msgTypeFilter: string;
  setMsgTypeFilter: (v: string) => void;
  decisionFilter: string;
  setDecisionFilter: (v: string) => void;
  agentOptions: { id: string; name: string }[];
  isPolling: boolean;
}

const ROW_HEIGHT = 24;
const TIME_WINDOWS: { label: string; minutes: number }[] = [
  { label: "5m", minutes: 5 },
  { label: "15m", minutes: 15 },
  { label: "1h", minutes: 60 },
  { label: "6h", minutes: 360 },
  { label: "24h", minutes: 24 * 60 },
  { label: "all", minutes: 0 },
];
const DECISIONS: { value: string; label: string }[] = [
  { value: "all", label: "All decisions" },
  { value: "allowed", label: "Allowed" },
  { value: "coalesced", label: "Coalesced" },
  { value: "rate_limited", label: "Rate limited" },
];
const MSG_TYPES = ["all", "Query", "Parse", "Bind", "Execute"];

// AuditFeed renders a virtualized list of audit rows with a toolbar above.
// The toolbar is a single 36px-tall row; rows are 24px. At 1440×900 inside
// the ProxyPane that leaves room for ~25 rows below the toolbar + header.
//
// Decision badges (brief #3): no distinct hue per decision. We use a small
// glyph in front of the timestamp instead, so the eye reads density from
// shape, not color. `allowed` is the default (no glyph).
//
// Keyboard nav (brief #6): the scroll container is focusable; j/↓ moves
// the highlighted row down, k/↑ moves up, Enter sets the agent filter to
// the row's agent. The selection lives locally — parent only needs to
// know when the list wants focus (focusList()) or when the filter does
// (focusFilter()).
export const AuditFeed = forwardRef<AuditFeedHandle, Props>(function AuditFeed(
  {
    rows,
    agentFilter,
    setAgentFilter,
    windowMinutes,
    setWindowMinutes,
    msgTypeFilter,
    setMsgTypeFilter,
    decisionFilter,
    setDecisionFilter,
    agentOptions,
    isPolling,
  },
  handleRef,
) {
  const filtered = useMemo(() => {
    if (msgTypeFilter === "all") return rows;
    return rows.filter((r) => r.msg_type === msgTypeFilter);
  }, [rows, msgTypeFilter]);

  const parentRef = useRef<HTMLDivElement | null>(null);
  const filterRef = useRef<HTMLSelectElement | null>(null);
  const [selectedIdx, setSelectedIdx] = useState<number>(-1);

  useImperativeHandle(handleRef, () => ({
    focusFilter: () => filterRef.current?.focus(),
    focusList: () => parentRef.current?.focus(),
  }));

  const virt = useVirtualizer({
    count: filtered.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 12,
  });

  // Clamp selectedIdx into [0, len-1] whenever the filtered set changes.
  // Polling can replace `rows`, so we keep the selection bounded but don't
  // try to track row identity across polls — selection resets to top if
  // the new list is shorter.
  useEffect(() => {
    if (filtered.length === 0) {
      setSelectedIdx(-1);
      return;
    }
    setSelectedIdx((cur) => {
      if (cur < 0) return -1;
      if (cur >= filtered.length) return filtered.length - 1;
      return cur;
    });
  }, [filtered.length]);

  const move = (delta: number) => {
    setSelectedIdx((cur) => {
      const len = filtered.length;
      if (len === 0) return -1;
      const next = cur < 0 ? (delta > 0 ? 0 : len - 1) : Math.max(0, Math.min(len - 1, cur + delta));
      virt.scrollToIndex(next, { align: "auto" });
      return next;
    });
  };

  const onKey = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key === "j" || e.key === "ArrowDown") {
      e.preventDefault();
      move(1);
    } else if (e.key === "k" || e.key === "ArrowUp") {
      e.preventDefault();
      move(-1);
    } else if (e.key === "Enter" && selectedIdx >= 0 && selectedIdx < filtered.length) {
      e.preventDefault();
      const row = filtered[selectedIdx];
      if (row.agent_id) setAgentFilter(row.agent_id);
    }
  };

  return (
    <section
      aria-label="Audit feed"
      data-testid="audit-feed"
      className="flex flex-col flex-1 min-w-0 min-h-0"
    >
      <div className="flex items-center gap-2 px-3 h-9 border-b border-vigil-rule">
        <h3 className="text-[10px] uppercase tracking-[0.10em] text-vigil-mute mr-2 flex items-center gap-1.5">
          Live audit
          {isPolling && (
            <span
              aria-label="Polling for new audit rows"
              data-testid="audit-live-indicator"
              className="inline-flex items-center gap-1 text-[10px] text-vigil-accent normal-case tracking-normal"
            >
              <span className="w-1 h-1 rounded-full bg-vigil-accent animate-pulse-alive" />
              Live
            </span>
          )}
        </h3>
        <Select
          value={agentFilter ?? "all"}
          onChange={(v) => setAgentFilter(v === "all" ? null : v)}
          options={[
            { value: "all", label: "All agents" },
            ...agentOptions.map((a) => ({ value: a.id, label: a.name })),
          ]}
        />
        <Select
          value={String(windowMinutes)}
          onChange={(v) => setWindowMinutes(Number(v))}
          options={TIME_WINDOWS.map((w) => ({ value: String(w.minutes), label: w.label }))}
        />
        <Select
          value={msgTypeFilter}
          onChange={setMsgTypeFilter}
          options={MSG_TYPES.map((m) => ({ value: m, label: m }))}
        />
        <Select
          firstRef={filterRef}
          value={decisionFilter}
          onChange={setDecisionFilter}
          options={DECISIONS}
          title="Filter audit rows by proxy decision"
        />
        <span className="ml-auto text-[11px] text-vigil-mute tabular-nums">
          {filtered.length.toLocaleString()} rows
        </span>
      </div>

      <div className="grid grid-cols-[16px_84px_120px_72px_1fr_60px] gap-2 px-3 h-6 items-center text-[10px] uppercase tracking-[0.10em] text-vigil-mute border-b border-vigil-rule">
        <div aria-hidden></div>
        <div>Time</div>
        <div>Agent</div>
        <div>Type</div>
        <div>Query</div>
        <div className="text-right">Bytes</div>
      </div>

      <div
        ref={parentRef}
        className="flex-1 overflow-y-auto focus:outline-none"
        data-testid="audit-scroll"
        tabIndex={0}
        onKeyDown={onKey}
      >
        {filtered.length === 0 ? (
          <div className="px-3 py-3 text-[12px] text-vigil-mute">No matching rows.</div>
        ) : (
          <div style={{ height: virt.getTotalSize(), position: "relative" }}>
            {virt.getVirtualItems().map((vi) => {
              const r = filtered[vi.index];
              const isSelected = vi.index === selectedIdx;
              return (
                <div
                  key={r.id}
                  data-testid={`audit-row-${r.id}`}
                  data-selected={isSelected ? "true" : undefined}
                  className={`grid grid-cols-[16px_84px_120px_72px_1fr_60px] gap-2 items-center px-3 text-[12px] absolute left-0 right-0 ${
                    isSelected ? "bg-vigil-surface" : "hover:bg-vigil-surface/60"
                  }`}
                  style={{ transform: `translateY(${vi.start}px)`, height: vi.size }}
                >
                  <DecisionGlyph decision={r.decision} />
                  <div className="text-vigil-mute tabular-nums font-mono text-[11px]">
                    {formatTime(r.ts)}
                  </div>
                  <div className="truncate text-vigil-ink">
                    {r.agent_name ?? <span className="text-vigil-mute">unauthenticated</span>}
                  </div>
                  <div className="text-vigil-mute">{r.msg_type}</div>
                  <div className="truncate font-mono text-[11px] text-vigil-ink/85">
                    {r.query_text ?? <span className="text-vigil-mute">—</span>}
                  </div>
                  <div className="text-right text-vigil-mute tabular-nums">{r.bytes}</div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
});

// DecisionGlyph is the brief's "no distinct hue" answer. allowed → empty,
// coalesced → ◌ (faint circle, "served from cache"), rate_limited → ◌·
// (a beat). Both glyphs are vigil-mute — the row's text carries the data,
// the glyph carries the category.
function DecisionGlyph({ decision }: { decision?: string }) {
  if (decision === "coalesced") {
    return (
      <span
        aria-label="coalesced"
        title="coalesced"
        className="text-vigil-mute text-[10px] font-mono"
      >
        ◇
      </span>
    );
  }
  if (decision === "rate_limited") {
    return (
      <span
        aria-label="rate limited"
        title="rate limited"
        className="text-vigil-mute text-[10px] font-mono"
      >
        ⏵
      </span>
    );
  }
  return <span aria-hidden></span>;
}

function Select({
  value,
  onChange,
  options,
  disabled,
  title,
  firstRef,
}: {
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
  disabled?: boolean;
  title?: string;
  firstRef?: React.Ref<HTMLSelectElement>;
}) {
  return (
    <select
      ref={firstRef}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      disabled={disabled}
      title={title}
      className="bg-vigil-surface border border-vigil-rule rounded-sm text-[12px] text-vigil-ink px-2 py-0.5 disabled:text-vigil-mute disabled:cursor-not-allowed focus:outline-none focus:border-vigil-accent"
    >
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

function formatTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "?";
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  const ss = String(d.getSeconds()).padStart(2, "0");
  return `${hh}:${mm}:${ss}`;
}
