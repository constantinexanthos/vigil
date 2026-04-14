export default function ErrorState() {
  return (
    <div className="flex-1 flex flex-col items-center justify-center px-8 w-full">
      <div
        className="w-10 h-10 rounded-full flex items-center justify-center mb-5"
        style={{ border: "1.5px solid #1e2028" }}
      >
        <div className="w-2.5 h-2.5 rounded-full bg-text-muted" />
      </div>
      <p className="text-text-secondary text-sm mb-1">Waiting for daemon</p>
      <p className="text-text-muted text-xs mb-4">Start monitoring to see agent activity</p>
      <code className="text-accent text-xs bg-surface border border-border px-3 py-1.5 rounded font-mono">
        vigil watch &lt;dir&gt;
      </code>
    </div>
  );
}
