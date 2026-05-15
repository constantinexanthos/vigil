import type { ViewMode } from "../store/selection";

interface Props {
  connected: boolean;
  hasNewEvents: boolean;
  onOpenCmd: () => void;
  viewMode: ViewMode;
  setViewMode: (m: ViewMode) => void;
  hasSelectedSession: boolean;
}

export function TopBar({
  connected,
  hasNewEvents,
  onOpenCmd,
  viewMode,
  setViewMode,
  hasSelectedSession,
}: Props) {
  return (
    <header
      className="h-11 flex items-center justify-between px-3.5"
      style={{ paddingLeft: "82px" }}
      data-tauri-drag-region
    >
      <div className="flex items-center">
        <span
          role="status"
          aria-label={connected ? "Daemon connected" : "Daemon disconnected"}
          className={`w-1.5 h-1.5 rounded-full ${connected ? "bg-emerald-400" : "bg-rose-400"}`}
          style={{ boxShadow: connected ? `0 0 6px ${hasNewEvents ? "#4ade80" : "#4ade80"}` : "none" }}
        />
      </div>

      <div className="flex items-center gap-2 text-[12px]">
        <button
          type="button"
          title="⌘1"
          className={
            viewMode === "overview"
              ? "text-white border-b border-white pb-px"
              : "text-white/45 hover:text-white/75 transition-colors duration-fast"
          }
          onClick={() => setViewMode("overview")}
        >
          Overview
        </button>
        <span className="text-white/25" aria-hidden>·</span>
        <button
          type="button"
          title="⌘2"
          disabled={!hasSelectedSession}
          className={
            !hasSelectedSession
              ? "text-white/25 cursor-not-allowed"
              : viewMode === "session"
                ? "text-white border-b border-white pb-px"
                : "text-white/45 hover:text-white/75 transition-colors duration-fast"
          }
          onClick={() => hasSelectedSession && setViewMode("session")}
        >
          Session
        </button>
        <span className="text-white/25" aria-hidden>·</span>
        <button
          type="button"
          title="⌘3"
          className={
            viewMode === "proxy"
              ? "text-white border-b border-white pb-px"
              : "text-white/45 hover:text-white/75 transition-colors duration-fast"
          }
          onClick={() => setViewMode("proxy")}
        >
          Proxy
        </button>
      </div>

      <button
        type="button"
        onClick={onOpenCmd}
        aria-label="Open command palette"
        title="Open command palette (⌘K)"
        className="text-xs text-white/50 hover:text-white/80 border border-white/10 px-2 py-0.5 rounded font-mono transition-colors duration-fast focus-visible:outline focus-visible:outline-1 focus-visible:outline-offset-1 focus-visible:outline-white/40"
      >
        ⌘K
      </button>
    </header>
  );
}
