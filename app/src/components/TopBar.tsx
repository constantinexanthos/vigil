import logo from "/logo.png";

interface Props {
  connected: boolean;
  hasNewEvents: boolean;
  onOpenCmd: () => void;
}

export function TopBar({ connected, hasNewEvents, onOpenCmd }: Props) {
  return (
    <header className="h-11 flex items-center justify-between px-3.5 border-b border-white/5 bg-[#121214]">
      <div className="flex items-center gap-2">
        <img src={logo} alt="Vigil" className="w-5 h-5" />
        <span className="text-[13px] text-white font-semibold">Vigil</span>
        <span
          role="status"
          aria-label={connected ? "Daemon connected" : "Daemon disconnected"}
          className={`w-1.5 h-1.5 rounded-full ml-1.5 ${connected ? "bg-emerald-400" : "bg-rose-400"}`}
          style={{ boxShadow: connected ? `0 0 6px ${hasNewEvents ? "#4ade80" : "#10b981"}` : "none" }}
        />
      </div>
      <button
        type="button"
        onClick={onOpenCmd}
        aria-label="Open command palette"
        title="Open command palette (⌘K)"
        className="text-[11px] text-white/50 hover:text-white/80 border border-white/10 px-2 py-0.5 rounded font-mono transition-colors duration-fast focus-visible:outline focus-visible:outline-1 focus-visible:outline-offset-1 focus-visible:outline-white/40"
      >
        ⌘K
      </button>
    </header>
  );
}
