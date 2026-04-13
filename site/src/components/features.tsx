const FEATURES = [
  {
    title: "Universal Capture",
    description:
      "OS-native file system events detect every coding agent on your machine. Zero configuration. If something modifies your code, you see it.",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-6 h-6">
        <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7S2 12 2 12z" />
        <circle cx="12" cy="12" r="3" />
      </svg>
    ),
  },
  {
    title: "Collision Detection",
    description:
      "When two agents from different providers modify the same file, you get an alert before conflicts compound into merge nightmares.",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-6 h-6">
        <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
        <line x1="12" y1="9" x2="12" y2="13" />
        <line x1="12" y1="17" x2="12.01" y2="17" />
      </svg>
    ),
  },
  {
    title: "Confidence Scoring",
    description:
      "0-100 trust scores based on local heuristics: file count, import resolution, test coverage delta, self-correction loops, complexity change.",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-6 h-6">
        <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
      </svg>
    ),
  },
  {
    title: "Cost Intelligence",
    description:
      "Track token usage and spend across every provider. Know exactly what each agent session costs and optimize your burn rate.",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-6 h-6">
        <line x1="12" y1="1" x2="12" y2="23" />
        <path d="M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6" />
      </svg>
    ),
  },
  {
    title: "Hallucination Detection",
    description:
      "Every import and require is verified against real modules. Catch phantom dependencies before they hit production.",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-6 h-6">
        <circle cx="11" cy="11" r="8" />
        <line x1="21" y1="21" x2="16.65" y2="16.65" />
      </svg>
    ),
  },
  {
    title: "Selective Rollback",
    description:
      "Per-file accept/reject after any agent session. Keep the changes you trust, discard the ones you don't. Interactive TUI included.",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-6 h-6">
        <polyline points="1 4 1 10 7 10" />
        <path d="M3.51 15a9 9 0 102.13-9.36L1 10" />
      </svg>
    ),
  },
];

export default function Features() {
  return (
    <section className="px-6 py-24 sm:px-8">
      <div className="mx-auto max-w-5xl">
        <h2 className="font-mono text-2xl font-semibold text-text mb-2">
          Features
        </h2>
        <p className="text-text-muted mb-12 max-w-2xl">
          Everything you need to monitor, verify, and trust AI-generated code.
        </p>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((f) => (
            <div
              key={f.title}
              className="rounded-lg border border-border bg-surface p-6 transition-colors hover:border-cyan/30"
            >
              <div className="mb-4 text-cyan">{f.icon}</div>
              <h3 className="font-mono text-sm font-semibold text-text mb-2">
                {f.title}
              </h3>
              <p className="text-sm leading-relaxed text-text-muted">
                {f.description}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
