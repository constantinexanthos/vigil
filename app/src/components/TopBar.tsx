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

const controlStyle: React.CSSProperties = {
  fontSize: 12,
  height: 28,
  padding: "0 8px",
  borderRadius: 6,
  border: "none",
  outline: "none",
  cursor: "pointer",
};

export default function TopBar({
  agents, agentFilter, onAgentFilterChange, timeRange, onTimeRangeChange,
  connected, hasNewEvents, onOpenCmd,
}: Props) {
  return (
    <div
      className="flex-shrink-0 flex items-center justify-between px-4 bg-bg"
      style={{
        height: 44,
        boxShadow: "0 1px 0 rgba(255,255,255,0.04)",
        WebkitAppRegion: "drag",
      } as React.CSSProperties}
    >
      <div className="flex items-center gap-2" style={{ WebkitAppRegion: "no-drag" } as React.CSSProperties}>
        <img src="/logo.png" alt="" width={18} height={18} style={{ imageRendering: "auto" }}
          onError={(e) => { (e.target as HTMLElement).style.display = "none"; }} />
        <span style={{ fontSize: 14, fontWeight: 500, color: "#F9FAFB" }}>Vigil</span>
        {connected && (
          <span className={`w-1.5 h-1.5 rounded-full bg-green ${hasNewEvents ? "animate-pulse" : ""}`} />
        )}
      </div>
      <div className="flex items-center gap-2" style={{ WebkitAppRegion: "no-drag" } as React.CSSProperties}>
        <select value={agentFilter} onChange={(e) => onAgentFilterChange(e.target.value)}
          className="bg-bg-tertiary text-text-tertiary" style={controlStyle}>
          <option value="">All Agents</option>
          {agents.map((a) => <option key={a} value={a}>{a}</option>)}
        </select>
        <select value={timeRange} onChange={(e) => onTimeRangeChange(e.target.value)}
          className="bg-bg-tertiary text-text-tertiary" style={controlStyle}>
          <option value="today">Today</option>
          <option value="7d">7 days</option>
          <option value="30d">30 days</option>
          <option value="all">All time</option>
        </select>
        <button onClick={onOpenCmd}
          className="bg-bg-tertiary text-text-muted hover:bg-bg-elevated transition-colors"
          style={{ ...controlStyle, fontSize: 11 }}>
          ⌘K
        </button>
      </div>
    </div>
  );
}
