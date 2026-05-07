import { useMemo, useRef } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import type { AuditRow } from "../../types";

interface Props {
  rows: AuditRow[];
  // Filter state lives in the parent; the feed is a pure renderer plus the
  // toolbar that fires onChange callbacks. The parent re-runs the Tauri
  // query when agent/window change; msg_type and decision are filtered in
  // memory because they cut from already-loaded rows.
  agentFilter: string | null;
  setAgentFilter: (v: string | null) => void;
  windowMinutes: number;
  setWindowMinutes: (v: number) => void;
  msgTypeFilter: string;
  setMsgTypeFilter: (v: string) => void;
  decisionFilter: string;
  setDecisionFilter: (v: string) => void;
  agentOptions: { id: string; name: string }[];
}

const ROW_HEIGHT = 28;
const TIME_WINDOWS: { label: string; minutes: number }[] = [
  { label: "5m", minutes: 5 },
  { label: "15m", minutes: 15 },
  { label: "1h", minutes: 60 },
  { label: "6h", minutes: 360 },
  { label: "24h", minutes: 24 * 60 },
  { label: "all", minutes: 0 },
];
// Decision values are placeholders until v0.1.0c lands. Wired through the UI
// today so the filter shape doesn't churn when the column arrives.
const DECISIONS: { value: string; label: string }[] = [
  { value: "all", label: "All decisions" },
  { value: "allowed", label: "Allowed" },
  { value: "coalesced", label: "Coalesced" },
  { value: "rate-limited", label: "Rate-limited" },
  { value: "denied", label: "Denied" },
];
const MSG_TYPES = ["all", "Query", "Parse", "Bind", "Execute"];

export function AuditFeed({
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
}: Props) {
  const filtered = useMemo(() => {
    if (msgTypeFilter === "all") return rows;
    return rows.filter((r) => r.msg_type === msgTypeFilter);
  }, [rows, msgTypeFilter]);

  const parentRef = useRef<HTMLDivElement | null>(null);
  const virt = useVirtualizer({
    count: filtered.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 12,
  });

  return (
    <section
      aria-label="Audit feed"
      className="flex flex-col flex-1 min-w-0 min-h-0"
    >
      <div className="flex items-center gap-2 px-3 py-2 border-b border-white/[0.06] flex-wrap">
        <h3 className="text-[9px] uppercase tracking-[0.08em] text-white/35 mr-2">
          Live audit
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
          options={TIME_WINDOWS.map((w) => ({
            value: String(w.minutes),
            label: w.label,
          }))}
        />
        <Select
          value={msgTypeFilter}
          onChange={setMsgTypeFilter}
          options={MSG_TYPES.map((m) => ({ value: m, label: m }))}
        />
        <Select
          value={decisionFilter}
          onChange={setDecisionFilter}
          options={DECISIONS}
          // The decision column doesn't exist in v0.1.0b. Showing the filter
          // grayed-out makes the future surface visible without lying about
          // the data backing it.
          disabled
          title="Ships in v0.1.0c"
        />
        <span className="ml-auto text-[10px] text-white/40 tabular-nums">
          {filtered.length.toLocaleString()} rows
        </span>
      </div>

      <div className="grid grid-cols-[80px_120px_70px_1fr_60px] gap-2 px-3 py-1.5 text-[9px] uppercase tracking-[0.08em] text-white/30 border-b border-white/[0.04]">
        <div>Time</div>
        <div>Agent</div>
        <div>Type</div>
        <div>Query</div>
        <div className="text-right">Bytes</div>
      </div>

      <div
        ref={parentRef}
        className="flex-1 overflow-y-auto"
        data-testid="audit-scroll"
      >
        {filtered.length === 0 ? (
          <div className="px-3 py-4 text-[11px] text-white/40">
            No matching rows.
          </div>
        ) : (
          <div style={{ height: virt.getTotalSize(), position: "relative" }}>
            {virt.getVirtualItems().map((vi) => {
              const r = filtered[vi.index];
              return (
                <div
                  key={r.id}
                  className="grid grid-cols-[80px_120px_70px_1fr_60px] gap-2 items-center px-3 text-[11px] hover:bg-white/[0.025] absolute left-0 right-0"
                  style={{
                    transform: `translateY(${vi.start}px)`,
                    height: vi.size,
                  }}
                >
                  <div className="text-white/55 tabular-nums">
                    {formatTime(r.ts)}
                  </div>
                  <div className="truncate text-white/80">
                    {r.agent_name ?? (
                      <span className="text-white/35">unauthenticated</span>
                    )}
                  </div>
                  <div className="text-white/55">{r.msg_type}</div>
                  <div className="truncate font-mono text-[10.5px] text-white/65">
                    {r.query_text ?? <span className="text-white/30">—</span>}
                  </div>
                  <div className="text-right text-white/45 tabular-nums">
                    {r.bytes}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
}

function Select({
  value,
  onChange,
  options,
  disabled,
  title,
}: {
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
  disabled?: boolean;
  title?: string;
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      disabled={disabled}
      title={title}
      className="bg-white/[0.04] border border-white/[0.08] rounded-sm text-[11px] text-white/80 px-1.5 py-0.5 disabled:text-white/35 disabled:cursor-not-allowed focus:outline-none focus:border-white/25"
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
  const ms = String(d.getMilliseconds()).padStart(3, "0");
  return `${hh}:${mm}:${ss}.${ms}`;
}
