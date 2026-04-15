export default function SettingsView() {
  return (
    <div className="p-6 space-y-6">
      <div>
        <h3 className="text-xs text-text-muted uppercase tracking-wider mb-3">Application</h3>
        <div className="bg-surface rounded-xl divide-y divide-border">
          <div className="flex items-center justify-between px-4 py-3">
            <span className="text-[12px] text-text-secondary">Version</span>
            <span className="text-[12px] text-text-primary font-mono">0.1.0</span>
          </div>
          <div className="flex items-center justify-between px-4 py-3">
            <span className="text-[12px] text-text-secondary">Database</span>
            <span className="text-[12px] text-text-primary font-mono truncate ml-4">~/.vigil/vigil.db</span>
          </div>
          <div className="flex items-center justify-between px-4 py-3">
            <span className="text-[12px] text-text-secondary">Refresh Interval</span>
            <span className="text-[12px] text-text-primary font-mono">2s</span>
          </div>
        </div>
      </div>

      <div>
        <h3 className="text-xs text-text-muted uppercase tracking-wider mb-3">CLI Commands</h3>
        <div className="bg-surface rounded-xl divide-y divide-border">
          <div className="px-4 py-3">
            <code className="text-[11px] text-accent font-mono">vigil watch &lt;dir&gt;</code>
            <p className="text-[11px] text-text-muted mt-0.5">Start file system monitoring</p>
          </div>
          <div className="px-4 py-3">
            <code className="text-[11px] text-accent font-mono">vigil cost --hours 24</code>
            <p className="text-[11px] text-text-muted mt-0.5">View cost breakdown</p>
          </div>
          <div className="px-4 py-3">
            <code className="text-[11px] text-accent font-mono">vigil sessions</code>
            <p className="text-[11px] text-text-muted mt-0.5">List agent sessions</p>
          </div>
          <div className="px-4 py-3">
            <code className="text-[11px] text-accent font-mono">vigil rollback</code>
            <p className="text-[11px] text-text-muted mt-0.5">Selective rollback by session</p>
          </div>
        </div>
      </div>
    </div>
  );
}
