export function ChecksPlaceholder() {
  return (
    <div className="px-4 py-5 text-[12px] text-white/55 leading-relaxed">
      <div className="text-label uppercase text-white/40 font-semibold mb-2">Coming in V2c</div>
      <p className="mb-2">
        Live test and CI status will land here — <code className="font-mono text-white/70">npm test</code> / <code className="font-mono text-white/70">cargo check</code> / <code className="font-mono text-white/70">tsc</code> runs captured as the agent fires them, plus a GitHub Actions section when a PR is open.
      </p>
      <p className="text-white/35 text-[11px]">
        Needs daemon work to preserve Bash tool-call arguments — not shipped yet.
      </p>
    </div>
  );
}
