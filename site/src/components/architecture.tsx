const LAYERS = [
  {
    number: "3",
    title: "Trust Intelligence",
    description:
      "Confidence scoring, hallucination detection, collision alerts, selective rollback",
    accent: "border-cyan text-cyan",
  },
  {
    number: "2",
    title: "Deep Hooks",
    description:
      "Claude Code hooks API, Cursor extension, OpenTelemetry collector",
    accent: "border-cyan/60 text-cyan/80",
  },
  {
    number: "1",
    title: "Universal Capture",
    description:
      "File system events, git activity monitor, process detection",
    accent: "border-cyan/30 text-cyan/60",
  },
];

export default function Architecture() {
  return (
    <section className="px-6 py-24 sm:px-8">
      <div className="mx-auto max-w-5xl">
        <h2 className="font-mono text-2xl font-semibold text-text mb-2">
          Architecture
        </h2>
        <p className="text-text-muted mb-12 max-w-2xl">
          Three layers. Each one adds depth. The product is useful before any
          deep integration exists.
        </p>

        <div className="flex flex-col gap-3 max-w-2xl mx-auto">
          {LAYERS.map((layer) => (
            <div
              key={layer.number}
              className={`rounded-lg border ${layer.accent} bg-surface p-5 transition-colors`}
            >
              <div className="flex items-baseline gap-3 mb-1">
                <span className="font-mono text-xs text-text-muted">
                  Layer {layer.number}
                </span>
                <h3 className={`font-mono text-sm font-semibold ${layer.accent}`}>
                  {layer.title}
                </h3>
              </div>
              <p className="text-sm text-text-muted leading-relaxed">
                {layer.description}
              </p>
            </div>
          ))}
        </div>

        {/* Arrow indicators between layers */}
        <div className="flex flex-col items-center mt-6 gap-1">
          <span className="text-text-muted text-xs font-mono">
            data flows up
          </span>
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            className="w-4 h-4 text-text-muted rotate-180"
          >
            <path d="M12 5v14M5 12l7-7 7 7" />
          </svg>
        </div>
      </div>
    </section>
  );
}
