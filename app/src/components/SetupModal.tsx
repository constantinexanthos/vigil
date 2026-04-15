interface SetupModalProps {
  open: boolean;
  onClose: () => void;
}

export default function SetupModal({ open, onClose }: SetupModalProps) {
  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center"
      style={{ backgroundColor: "rgba(0,0,0,0.6)" }}
      onClick={onClose}
    >
      <div
        className="bg-surface border border-border rounded-lg p-6 max-w-md w-full mx-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-[16px] font-medium text-text-heading">Connect your first agent</h2>
          <button
            onClick={onClose}
            className="text-text-faint hover:text-text-muted"
            style={{ background: "none", border: "none", cursor: "pointer", fontSize: "18px", lineHeight: 1 }}
          >
            &times;
          </button>
        </div>

        <p className="text-[13px] text-text-muted mb-4">Quick setup (30 seconds):</p>

        <div className="space-y-4">
          <div className="flex gap-3">
            <span className="text-[13px] text-text-faint w-5 flex-shrink-0 text-right">1.</span>
            <div>
              <p className="text-[13px] text-text-primary mb-1">Start the Vigil daemon:</p>
              <code className="text-[12px] font-mono text-text-subtle bg-bg px-3 py-1.5 rounded block">
                $ vigil watch ~/projects
              </code>
            </div>
          </div>

          <div className="flex gap-3">
            <span className="text-[13px] text-text-faint w-5 flex-shrink-0 text-right">2.</span>
            <p className="text-[13px] text-text-primary">
              Run any AI coding agent (Claude Code, Cursor, Windsurf, etc.)
            </p>
          </div>

          <div className="flex gap-3">
            <span className="text-[13px] text-text-faint w-5 flex-shrink-0 text-right">3.</span>
            <p className="text-[13px] text-text-primary">
              Vigil automatically detects and monitors all agents.
            </p>
          </div>
        </div>

        <p className="text-[12px] text-text-faint mt-5 pt-4 border-t border-border">
          That's it. No config files, no API keys.
        </p>
      </div>
    </div>
  );
}
