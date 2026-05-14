import { useEffect, useRef, useState } from "react";
import type { ProxyCounter } from "../../types";

interface Props {
  counters: ProxyCounter[];
}

export const FLASH_MS = 400;

// FlashingCell renders a numeric value and briefly highlights when the value
// changes — drives the brief's "counter delta animation" criterion. The flash
// is keyed via a data-flash attribute so the CSS transition fires; we don't
// add Framer Motion just for this since plain timeouts + Tailwind classes
// cover it and the brief explicitly calls out keeping deps minimal.
function FlashingCell({
  value,
  className,
  title,
  testId,
}: {
  value: number;
  className?: string;
  title?: string;
  testId?: string;
}) {
  const [flash, setFlash] = useState(false);
  // Use a ref for the previous value so the very first render doesn't
  // trigger a flash — the brief requires "don't animate the initial render".
  const prevRef = useRef<number | null>(null);

  useEffect(() => {
    if (prevRef.current === null) {
      prevRef.current = value;
      return;
    }
    if (prevRef.current !== value) {
      prevRef.current = value;
      setFlash(true);
      const t = setTimeout(() => setFlash(false), FLASH_MS);
      return () => clearTimeout(t);
    }
  }, [value]);

  return (
    <div
      className={`${className ?? ""} transition-colors duration-base ${
        flash ? "bg-cyan-400/15" : ""
      }`}
      title={title}
      data-flash={flash ? "true" : undefined}
      data-testid={testId}
    >
      {value.toLocaleString()}
    </div>
  );
}

// Per-agent rollup. One row per agent showing queries today, queries deduped
// (decision='coalesced'), and queries rate-limited (decision='rate_limited').
// Each numeric cell flashes briefly when its value changes via polling — the
// only motion in the tab, used as a "something new happened" signal.
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
        <div
          className="grid grid-cols-[1fr_auto_auto_auto] gap-x-6 px-4 pb-3 text-[11px] tabular-nums"
          data-testid="counters-grid"
        >
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
                  {c.agent_name ?? (
                    <span className="text-white/40">unauthenticated</span>
                  )}
                </div>
                <FlashingCell
                  value={c.queries_today}
                  className="text-right text-white/85"
                  testId={`counter-queries-${key}`}
                />
                <FlashingCell
                  value={c.queries_deduped}
                  className="text-right text-white/65"
                  testId={`counter-deduped-${key}`}
                />
                <FlashingCell
                  value={c.queries_rate_limited}
                  className="text-right text-white/65"
                  testId={`counter-ratelimited-${key}`}
                />
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
