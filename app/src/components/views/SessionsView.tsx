export default function SessionsView() {
  return (
    <div className="flex-1 flex flex-col items-center justify-center px-8">
      <div className="text-center max-w-sm">
        <div className="w-10 h-10 rounded-full bg-surface border border-border flex items-center justify-center mx-auto mb-4">
          <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-text-secondary">
            <path d="M2 12l7-4 7 4" />
            <path d="M2 8l7-4 7 4" />
            <path d="M2 16l7-4 7 4" />
          </svg>
        </div>
        <p className="text-sm text-text-secondary mb-4">
          Session management available via CLI
        </p>
        <div className="space-y-2">
          <code className="block text-xs text-accent bg-surface border border-border px-3 py-2 rounded font-mono">
            vigil sessions
          </code>
          <code className="block text-xs text-accent bg-surface border border-border px-3 py-2 rounded font-mono">
            vigil rollback
          </code>
        </div>
      </div>
    </div>
  );
}
