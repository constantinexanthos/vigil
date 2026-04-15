interface Props {
  activeView: string;
  onNavigate: (view: string) => void;
  expanded: boolean;
  onToggle: () => void;
  connected: boolean;
}

const navItems = [
  {
    id: "dashboard",
    label: "Dashboard",
    icon: (
      <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <rect x="2" y="2" width="5.5" height="5.5" rx="1" />
        <rect x="10.5" y="2" width="5.5" height="5.5" rx="1" />
        <rect x="2" y="10.5" width="5.5" height="5.5" rx="1" />
        <rect x="10.5" y="10.5" width="5.5" height="5.5" rx="1" />
      </svg>
    ),
  },
  {
    id: "activity",
    label: "Activity",
    icon: (
      <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <line x1="3" y1="5" x2="15" y2="5" />
        <line x1="3" y1="9" x2="15" y2="9" />
        <line x1="3" y1="13" x2="15" y2="13" />
      </svg>
    ),
  },
  {
    id: "commits",
    label: "Commits",
    icon: (
      <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="9" cy="9" r="6" />
        <circle cx="9" cy="9" r="2" />
      </svg>
    ),
  },
  {
    id: "sessions",
    label: "Sessions",
    icon: (
      <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M2 12l7-4 7 4" />
        <path d="M2 8l7-4 7 4" />
        <path d="M2 16l7-4 7 4" />
      </svg>
    ),
  },
  {
    id: "costs",
    label: "Costs",
    icon: (
      <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <line x1="9" y1="2" x2="9" y2="16" />
        <path d="M13 5.5H7.5a2.5 2.5 0 000 5H10.5a2.5 2.5 0 010 5H5" />
      </svg>
    ),
  },
];

const settingsItem = {
  id: "settings",
  label: "Settings",
  icon: (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="9" cy="9" r="2.5" />
      <path d="M14.7 11.1a1.2 1.2 0 00.24 1.32l.04.04a1.45 1.45 0 11-2.05 2.05l-.04-.04a1.2 1.2 0 00-1.32-.24 1.2 1.2 0 00-.73 1.1v.12a1.45 1.45 0 11-2.9 0v-.06a1.2 1.2 0 00-.79-1.1 1.2 1.2 0 00-1.32.24l-.04.04a1.45 1.45 0 11-2.05-2.05l.04-.04a1.2 1.2 0 00.24-1.32 1.2 1.2 0 00-1.1-.73h-.12a1.45 1.45 0 110-2.9h.06a1.2 1.2 0 001.1-.79 1.2 1.2 0 00-.24-1.32l-.04-.04a1.45 1.45 0 112.05-2.05l.04.04a1.2 1.2 0 001.32.24h.06a1.2 1.2 0 00.73-1.1v-.12a1.45 1.45 0 012.9 0v.06a1.2 1.2 0 00.73 1.1 1.2 1.2 0 001.32-.24l.04-.04a1.45 1.45 0 112.05 2.05l-.04.04a1.2 1.2 0 00-.24 1.32v.06a1.2 1.2 0 001.1.73h.12a1.45 1.45 0 110 2.9h-.06a1.2 1.2 0 00-1.1.73z" />
    </svg>
  ),
};

export default function Sidebar({ activeView, onNavigate, expanded, onToggle, connected }: Props) {
  return (
    <div
      className="h-full flex flex-col border-r border-border bg-surface flex-shrink-0 transition-all duration-200"
      style={{ width: expanded ? 220 : 60 }}
    >
      {/* Logo */}
      <div className="flex items-center justify-center h-[52px] flex-shrink-0">
        <span className="text-accent font-bold text-xl select-none">V</span>
      </div>

      {/* Nav items */}
      <nav className="flex-1 flex flex-col gap-0.5 px-2 mt-1">
        {navItems.map((item) => {
          const isActive = activeView === item.id;
          return (
            <button
              key={item.id}
              onClick={() => onNavigate(item.id)}
              className={`flex items-center gap-3 rounded-lg px-3 py-2.5 transition-colors cursor-pointer text-left w-full ${
                isActive
                  ? "bg-elevated text-text-primary"
                  : "text-text-secondary hover:bg-elevated/50 hover:text-text-primary"
              }`}
              style={isActive ? { borderLeft: "2px solid #3b82f6", paddingLeft: 10 } : {}}
              title={!expanded ? item.label : undefined}
            >
              <span className="flex-shrink-0">{item.icon}</span>
              {expanded && (
                <span className="text-[13px] truncate transition-opacity duration-200">{item.label}</span>
              )}
            </button>
          );
        })}
      </nav>

      {/* Settings at bottom */}
      <div className="border-t border-border px-2 pt-1 pb-1">
        <button
          onClick={() => onNavigate(settingsItem.id)}
          className={`flex items-center gap-3 rounded-lg px-3 py-2.5 transition-colors cursor-pointer text-left w-full ${
            activeView === settingsItem.id
              ? "bg-elevated text-text-primary"
              : "text-text-secondary hover:bg-elevated/50 hover:text-text-primary"
          }`}
          style={activeView === settingsItem.id ? { borderLeft: "2px solid #3b82f6", paddingLeft: 10 } : {}}
          title={!expanded ? settingsItem.label : undefined}
        >
          <span className="flex-shrink-0">{settingsItem.icon}</span>
          {expanded && (
            <span className="text-[13px] truncate transition-opacity duration-200">{settingsItem.label}</span>
          )}
        </button>
      </div>

      {/* Collapse toggle */}
      <button
        onClick={onToggle}
        className="flex items-center justify-center py-3 text-text-muted hover:text-text-secondary transition-colors cursor-pointer"
        title={expanded ? "Collapse" : "Expand"}
      >
        <svg
          width="16"
          height="16"
          viewBox="0 0 16 16"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          className={`transition-transform duration-200 ${expanded ? "" : "rotate-180"}`}
        >
          <polyline points="10 4 6 8 10 12" />
        </svg>
      </button>

      {/* Connection dot */}
      {!connected && (
        <div className="flex justify-center pb-2">
          <span className="w-2 h-2 rounded-full bg-text-muted" title="Disconnected" />
        </div>
      )}
    </div>
  );
}
