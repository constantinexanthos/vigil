interface TopBarProps {
  agents: string[];
  agentFilter: string;
  onAgentFilterChange: (v: string) => void;
  timeRange: string;
  onTimeRangeChange: (v: string) => void;
  connected: boolean;
  hasNewEvents: boolean;
}

export default function TopBar({
  agents,
  agentFilter,
  onAgentFilterChange,
  timeRange,
  onTimeRangeChange,
  connected,
  hasNewEvents,
}: TopBarProps) {
  return (
    <div className="sticky top-0 z-50 flex items-center justify-between pl-[78px] pr-5 py-3 border-b border-border frosted-header titlebar-drag">
      <div className="flex items-center gap-2">
        <img
          src="/logo.png"
          alt="Vigil"
          width={20}
          height={20}
          style={{ imageRendering: 'auto' }}
          onError={(e) => {
            const span = document.createElement('span');
            span.textContent = 'V';
            span.className = 'text-[16px] font-bold text-text-heading';
            (e.target as HTMLElement).replaceWith(span);
          }}
        />
        <span className="text-[16px] font-medium text-text-heading">Vigil</span>
        <span
          className={`w-[7px] h-[7px] rounded-full ml-1 flex-shrink-0 ${
            connected
              ? hasNewEvents
                ? "bg-success status-pulse"
                : "bg-success"
              : "bg-text-faint"
          }`}
          title={connected ? "Connected" : "Disconnected"}
        />
      </div>
      <div className="flex items-center gap-3 titlebar-no-drag">
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
