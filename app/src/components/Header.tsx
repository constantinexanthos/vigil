interface HeaderProps {
  eventCount: number;
  connected: boolean;
  agentCount: number;
}

export default function Header({ eventCount, connected, agentCount }: HeaderProps) {
  return (
    <div className="flex items-center justify-between px-4 py-3 border-b border-border">
      <div className="flex items-center gap-3">
        <span
          className="text-sm font-bold tracking-widest"
          style={{
            color: "#00ff41",
            textShadow: "0 0 7px rgba(0,255,65,0.6), 0 0 20px rgba(0,255,65,0.25)",
          }}
        >
          VIGIL
        </span>
        {agentCount > 0 && (
          <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-elevated text-accent border border-border font-medium">
            {agentCount} agent{agentCount !== 1 ? "s" : ""}
          </span>
        )}
      </div>
      <div className="flex items-center gap-3">
        <span className="text-text-secondary text-[10px]">
          {eventCount.toLocaleString()} events
        </span>
        <span
          className="w-2 h-2 rounded-full flex-shrink-0"
          style={
            connected
              ? {
                  backgroundColor: "#00ff41",
                  animation: "breathe 2s ease-in-out infinite",
                }
              : {
                  backgroundColor: "#3d4150",
                }
          }
        />
      </div>
    </div>
  );
}
