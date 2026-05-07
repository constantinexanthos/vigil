import type { ProxyCounter } from "../../types";

interface Props {
  counters: ProxyCounter[];
}

// Per-agent rollup. Today this is one row per agent showing queries today,
// queries deduped (placeholder = 0 until v0.1.0d), queries rate-limited
// (placeholder = 0 until v0.1.0c). The placeholder columns render visibly
// so the agentic surface area is obvious — they just stay at zero until the
// underlying primitives ship.
export function CountersPane({ counters }: Props) {
  const sorted = [...counters].sort(
    (a, b) => b.queries_today - a.queries_today,
  );
  return (
    <section
      aria-label="Per-agent counters"
      className="border-b border-white/[0.06]"
    >
      <div className="flex items-center justify-between px-4 pt-3 pb-1.5">
        <h3 className="text-[9px] uppercase tracking-[0.08em] text-white/35">
          Counters · last 24h
        </h3>
      </div>
      {sorted.length === 0 ? (
        <div className="px-4 pb-4 text-[11px] text-white/40">
          No traffic yet.
        </div>
      ) : (
        <div className="grid grid-cols-[1fr_auto_auto_auto] gap-x-6 px-4 pb-3 text-[11px] tabular-nums">
          <div className="text-[9px] uppercase tracking-[0.08em] text-white/30 col-span-1">
            Agent
          </div>
          <div className="text-[9px] uppercase tracking-[0.08em] text-white/30 text-right">
            Queries
          </div>
          <div className="text-[9px] uppercase tracking-[0.08em] text-white/30 text-right">
            Deduped
          </div>
          <div className="text-[9px] uppercase tracking-[0.08em] text-white/30 text-right">
            Rate-limited
          </div>
          {sorted.map((c) => {
            const key = c.agent_id ?? "(unauth)";
            return (
              <div key={key} className="contents">
                <div className="text-white/80 truncate">
                  {c.agent_name ?? <span className="text-white/40">unauthenticated</span>}
                </div>
                <div className="text-right text-white/85">
                  {c.queries_today.toLocaleString()}
                </div>
                <div className="text-right text-white/40" title="ships in v0.1.0d">
                  {c.queries_deduped.toLocaleString()}
                </div>
                <div className="text-right text-white/40" title="ships in v0.1.0c">
                  {c.queries_rate_limited.toLocaleString()}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
