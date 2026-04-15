interface TopBarProps {
  agents: string[];
  agentFilter: string;
  onAgentFilterChange: (v: string) => void;
  timeRange: string;
  onTimeRangeChange: (v: string) => void;
}

export default function TopBar({
  agents,
  agentFilter,
  onAgentFilterChange,
  timeRange,
  onTimeRangeChange,
}: TopBarProps) {
  return (
    <div className="sticky top-0 z-50 flex items-center justify-between px-5 py-3 border-b border-border bg-bg">
      <div className="flex items-center gap-2">
        <img src="/logo.png" alt="Vigil" className="w-5 h-5" />
        <span className="text-[16px] font-medium text-text-heading">Vigil</span>
      </div>
      <div className="flex items-center gap-3">
        <select
          value={agentFilter}
          onChange={(e) => onAgentFilterChange(e.target.value)}
          className="bg-border text-text-subtle text-[13px] px-2.5 py-1.5 rounded appearance-none cursor-pointer focus:outline-none"
          style={{ border: "none" }}
        >
          <option value="">All Agents</option>
          {agents.map((a) => (
            <option key={a} value={a}>
              {a}
            </option>
          ))}
        </select>
        <select
          value={timeRange}
          onChange={(e) => onTimeRangeChange(e.target.value)}
          className="bg-border text-text-subtle text-[13px] px-2.5 py-1.5 rounded appearance-none cursor-pointer focus:outline-none"
          style={{ border: "none" }}
        >
          <option value="today">Today</option>
          <option value="7d">7d</option>
          <option value="30d">30d</option>
          <option value="all">All</option>
        </select>
      </div>
    </div>
  );
}
