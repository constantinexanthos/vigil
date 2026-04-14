import { formatCost } from "../types";

interface HeaderProps {
  eventCount: number;
  connected: boolean;
  agentCount: number;
  totalCostUsd: number;
}

export default function Header({ eventCount, connected, agentCount, totalCostUsd }: HeaderProps) {
  return (
    <div className="flex items-center justify-between px-5 py-3 border-b border-border w-full">
      <div className="flex items-center gap-3">
        <span className="text-sm font-medium tracking-wide text-accent">Vigil</span>
        {agentCount > 0 && (
          <span className="text-[11px] px-2 py-0.5 rounded-full bg-surface text-text-secondary border border-border">
            {agentCount} agent{agentCount !== 1 ? "s" : ""}
          </span>
        )}
      </div>
      <div className="flex items-center gap-4">
        {totalCostUsd > 0 && (
          <span className="text-[11px] text-text-muted">{formatCost(totalCostUsd)}</span>
        )}
        <span className="text-text-secondary text-[11px]">
          {eventCount.toLocaleString()} events
        </span>
        <span
          className="w-2 h-2 rounded-full flex-shrink-0"
          style={{ backgroundColor: connected ? "#22d3ee" : "#4b5563" }}
        />
      </div>
    </div>
  );
}
