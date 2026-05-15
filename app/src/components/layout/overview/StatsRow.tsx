import { useMemo } from "react";
import { formatCost, type HourBucket } from "../../../types";
import { Sparkline } from "../../proxy/Sparkline";

interface Props {
  burnRatePerHour: number | null;
  activeAgents: number;
  totalAgents: number;
  filesToday: number;
  hourlyActivity?: HourBucket[];
}

// StatsRow is the most prominent surface in the app — the three numbers an
// operator sees when the app opens. Linear-tier treatment: tight typography
// (label / number / suffix is a single visual block, not three separate
// emphases), tabular numerals, sparkline under the only stat with real
// historical data (files today, derived from hourlyActivity).
export function StatsRow({
  burnRatePerHour,
  activeAgents,
  totalAgents,
  filesToday,
  hourlyActivity,
}: Props) {
  const filesSpark = useMemo<number[]>(() => {
    if (!hourlyActivity?.length) return [];
    // hourlyActivity is by-agent-by-hour; collapse to total-by-hour for the
    // sparkline. Ordering matches input — sorted oldest → newest by hour.
    return hourlyActivity
      .map((b) => b.by_agent.reduce((s, a) => s + a.count, 0))
      .filter((v, i, arr) => i > 0 || v > 0 || arr.length === 1);
  }, [hourlyActivity]);

  return (
    <section
      aria-label="Workspace stats"
      className="grid grid-cols-3 border-b border-vigil-rule"
    >
      <Stat
        label="Burn rate"
        value={burnRatePerHour != null ? formatCost(burnRatePerHour) : "—"}
        suffix={burnRatePerHour != null ? "/hr" : null}
      />
      <Stat
        label="Active agents"
        value={String(activeAgents)}
        suffix={`of ${totalAgents}`}
      />
      <Stat
        label="Files today"
        value={filesToday.toLocaleString()}
        suffix={null}
        spark={filesSpark}
      />
    </section>
  );
}

function Stat({
  label,
  value,
  suffix,
  spark,
}: {
  label: string;
  value: string;
  suffix: string | null;
  spark?: number[];
}) {
  return (
    <div className="px-4 py-3 border-r border-vigil-rule last:border-r-0">
      <div className="text-[10px] uppercase tracking-[0.10em] text-vigil-mute mb-1">
        {label}
      </div>
      <div className="flex items-baseline gap-2 text-vigil-ink">
        <span className="text-[18px] font-medium tabular-nums leading-none">
          {value}
        </span>
        {suffix && (
          <span className="text-[11px] text-vigil-mute tabular-nums">
            {suffix}
          </span>
        )}
      </div>
      {spark && spark.length > 1 && (
        <div className="text-vigil-accent/60 mt-1.5">
          <Sparkline
            data={spark}
            width={140}
            height={14}
            ariaLabel={`${label} trend`}
          />
        </div>
      )}
    </div>
  );
}
