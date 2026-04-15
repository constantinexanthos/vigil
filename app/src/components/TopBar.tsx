import { formatCost } from "../types";

interface Props {
  agents: string[];
  agentFilter: string;
  onAgentFilterChange: (v: string) => void;
  timeRange: string;
  onTimeRangeChange: (v: string) => void;
  connected: boolean;
  hasNewEvents: boolean;
  agentCount: number;
  totalCost: number;
  alertCount: number;
  onOpenCmd: () => void;
}

export default function TopBar({
  agents, agentFilter, onAgentFilterChange, timeRange, onTimeRangeChange,
  connected, hasNewEvents, agentCount, totalCost, alertCount, onOpenCmd,
}: Props) {
  return (
    <div className="flex-shrink-0">
      {/* Title bar -- draggable */}
      <div className="flex items-center justify-between px-4 py-2.5 bg-bg-secondary shadow-subtle" style={{ WebkitAppRegion: "drag" } as React.CSSProperties}>
        <div className="flex items-center gap-2" style={{ WebkitAppRegion: "no-drag" } as React.CSSProperties}>
          <img src="/logo.png" alt="" width={18} height={18} style={{ imageRendering: "auto" }}
            onError={(e) => { (e.target as HTMLElement).style.display = "none"; }} />
          <span className="text-lg font-medium text-text-primary">Vigil</span>
          {connected && (
            <span className={`w-1.5 h-1.5 rounded-full bg-green ${hasNewEvents ? "animate-pulse" : ""}`} />
          )}
        </div>
        <div className="flex items-center gap-2" style={{ WebkitAppRegion: "no-drag" } as React.CSSProperties}>
          <select value={agentFilter} onChange={(e) => onAgentFilterChange(e.target.value)}
            className="bg-bg-tertiary text-text-tertiary text-sm px-2 py-1 rounded cursor-pointer border-none outline-none">
            <option value="">All Agents</option>
            {agents.map((a) => <option key={a} value={a}>{a}</option>)}
          </select>
          <select value={timeRange} onChange={(e) => onTimeRangeChange(e.target.value)}
            className="bg-bg-tertiary text-text-tertiary text-sm px-2 py-1 rounded cursor-pointer border-none outline-none">
            <option value="today">Today</option>
            <option value="7d">7 days</option>
            <option value="30d">30 days</option>
            <option value="all">All time</option>
          </select>
          <button onClick={onOpenCmd}
            className="text-xs text-text-muted bg-bg-tertiary px-2 py-1 rounded cursor-pointer hover:bg-bg-elevated transition-colors border-none">
            ⌘K
          </button>
        </div>
      </div>
      {/* Status line */}
      {connected && (
        <div className="px-4 py-1.5 text-sm text-text-muted flex items-center gap-1 border-b border-border">
          <span className="w-1.5 h-1.5 rounded-full bg-green mr-1" />
          <span>{agentCount} agent{agentCount !== 1 ? "s" : ""} active</span>
          <span className="mx-1 opacity-30">·</span>
          <span>{totalCost > 0 ? formatCost(totalCost) : "$0"} today</span>
          {alertCount > 0 && (
            <>
              <span className="mx-1 opacity-30">·</span>
              <span className="text-amber">{alertCount} alert{alertCount !== 1 ? "s" : ""}</span>
            </>
          )}
        </div>
      )}
    </div>
  );
}
