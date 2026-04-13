interface HeaderProps {
  eventCount: number;
  connected: boolean;
}

export default function Header({ eventCount, connected }: HeaderProps) {
  return (
    <div className="flex items-center justify-between px-4 py-3 border-b border-border">
      <div className="flex items-baseline gap-2">
        <span className="text-text-primary font-bold text-sm tracking-tight">vigil</span>
        <span className="text-text-muted text-[10px]">v0.1.0</span>
      </div>
      <div className="flex items-center gap-3">
        <span className="text-text-secondary text-xs">
          {eventCount.toLocaleString()} events today
        </span>
        <span
          className={`w-2 h-2 rounded-full ${connected ? "bg-accent shadow-[0_0_6px_#22d3ee]" : "bg-text-muted"}`}
        />
      </div>
    </div>
  );
}
