import type { ViewMode } from "../store/selection";

interface Props {
  connected: boolean;
  hasNewEvents: boolean;
  onOpenCmd: () => void;
  viewMode: ViewMode;
  setViewMode: (m: ViewMode) => void;
  hasSelectedSession: boolean;
}

// TopBar is the only chrome above the panes — kept deliberately quiet.
// Tab labels are monospaced and tightly grouped so the eye reads them as a
// single triad; the ⌘K hint and the connection dot share the right edge so
// the left side stays empty for the macOS traffic lights' drag region.
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
      className="h-9 flex items-center justify-between border-b border-vigil-rule"
      style={{ paddingLeft: "82px", paddingRight: "10px" }}
      data-tauri-drag-region
    >
      <div aria-hidden className="flex-1" />

      <nav
        aria-label="App sections"
        className="flex items-center gap-3 font-mono text-[11px] tabular-nums"
      >
        <TabButton
          label="Overview"
          shortcut="⌘1"
          active={viewMode === "overview"}
          onClick={() => setViewMode("overview")}
        />
        <TabButton
          label="Session"
          shortcut="⌘2"
          active={viewMode === "session"}
          disabled={!hasSelectedSession}
          onClick={() => hasSelectedSession && setViewMode("session")}
        />
        <TabButton
          label="Proxy"
          shortcut="⌘3"
          active={viewMode === "proxy"}
          onClick={() => setViewMode("proxy")}
        />
      </nav>

      <div className="flex-1 flex items-center justify-end gap-3">
        <span
          role="status"
          aria-label={connected ? "Daemon connected" : "Daemon disconnected"}
          className={`w-1 h-1 rounded-full ${
            connected ? "bg-vigil-accent" : "bg-vigil-mute/60"
          }`}
          style={{
            // vigil-accent (#5B8DEF) — glow when fresh events arrived since
            // last user interaction. Off otherwise.
            boxShadow:
              connected && hasNewEvents ? "0 0 6px #5B8DEF" : "none",
          }}
        />
        <button
          type="button"
          onClick={onOpenCmd}
          aria-label="Open command palette"
          title="Open command palette (⌘K)"
          className="text-[10px] font-mono text-vigil-mute hover:text-vigil-ink transition-colors duration-fast"
        >
          ⌘K
        </button>
      </div>
    </header>
  );
}

interface TabProps {
  label: string;
  shortcut: string;
  active: boolean;
  disabled?: boolean;
  onClick: () => void;
}

function TabButton({ label, shortcut, active, disabled, onClick }: TabProps) {
  return (
    <button
      type="button"
      title={shortcut}
      aria-current={active ? "page" : undefined}
      disabled={disabled}
      className={
        disabled
          ? "text-vigil-mute/40 cursor-not-allowed"
          : active
            ? "text-vigil-ink border-b border-vigil-accent pb-px"
            : "text-vigil-mute hover:text-vigil-ink transition-colors duration-fast"
      }
      onClick={onClick}
    >
      {label}
    </button>
  );
}
