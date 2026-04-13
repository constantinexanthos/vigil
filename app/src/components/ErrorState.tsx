export default function ErrorState() {
  return (
    <div className="flex flex-col items-center justify-center h-full px-8">
      <div className="w-8 h-8 rounded-full border-2 border-text-muted flex items-center justify-center mb-4">
        <span className="text-text-muted text-sm">!</span>
      </div>
      <p className="text-text-secondary text-xs text-center leading-relaxed">
        Daemon not running. Start with:
      </p>
      <code className="text-accent text-xs mt-2 bg-surface border border-border px-3 py-1.5 rounded">
        vigil watch &lt;dir&gt;
      </code>
    </div>
  );
}
