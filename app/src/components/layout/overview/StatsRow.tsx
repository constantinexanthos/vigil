import { formatCost } from "../../../types";

interface Props {
  burnRatePerHour: number | null;
  activeAgents: number;
  totalAgents: number;
  filesToday: number;
}

export function StatsRow({ burnRatePerHour, activeAgents, totalAgents, filesToday }: Props) {
  return (
    <section
      aria-label="Workspace stats"
      className="grid grid-cols-3 border-b border-white/[0.06]"
    >
      <Stat label="Burn rate" value={burnRatePerHour != null ? formatCost(burnRatePerHour) : "—"} suffix={burnRatePerHour != null ? "/hr" : null} />
      <Stat label="Active agents" value={String(activeAgents)} suffix={`of ${totalAgents}`} />
      <Stat label="Files today" value={filesToday.toLocaleString()} suffix={null} />
    </section>
  );
}

function Stat({ label, value, suffix }: { label: string; value: string; suffix: string | null }) {
  return (
    <div className="px-4 py-3 border-r border-white/[0.06] last:border-r-0">
      <p className="text-[9px] uppercase tracking-[0.08em] text-white/35 mb-1">{label}</p>
      <p className="text-[16px] font-medium text-white/90 tabular-nums">
        {value}
        {suffix && <span className="text-[11px] text-white/45 ml-1.5">{suffix}</span>}
      </p>
    </div>
  );
}
