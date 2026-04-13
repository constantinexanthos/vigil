const AGENTS = [
  "Claude Code",
  "Cursor",
  "Codex",
  "Conductor",
  "Aider",
  "Claude Squad",
  "Cline",
  "Any Terminal",
];

export default function Integrations() {
  return (
    <section className="px-6 py-24 sm:px-8">
      <div className="mx-auto max-w-5xl">
        <h2 className="font-mono text-2xl font-semibold text-text mb-2">
          Integrations
        </h2>
        <p className="text-text-muted mb-10 max-w-2xl">
          If it modifies your code, Vigil sees it. Provider-agnostic by design.
        </p>

        <div className="flex flex-wrap gap-3">
          {AGENTS.map((agent) => (
            <span
              key={agent}
              className="rounded-md border border-border bg-surface px-4 py-2 font-mono text-sm text-text-muted transition-colors hover:border-cyan/30 hover:text-text"
            >
              {agent}
            </span>
          ))}
        </div>
      </div>
    </section>
  );
}
