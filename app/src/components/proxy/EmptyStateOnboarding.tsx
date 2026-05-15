import { useState } from "react";

interface Props {
  onShowDemo: () => void;
}

const STEPS: { n: number; label: string; cmd: string }[] = [
  { n: 1, label: "Install", cmd: "brew install vigil" },
  {
    n: 2,
    label: "Start the proxy",
    cmd: "vigil-proxy \\\n  --postgres-listen :7432 \\\n  --postgres-upstream localhost:5432",
  },
  {
    n: 3,
    label: "Point your client",
    cmd: "PGPASSWORD=… psql -h localhost -p 7432 -U postgres",
  },
];

export function EmptyStateOnboarding({ onShowDemo }: Props) {
  return (
    <section
      aria-label="Proxy onboarding"
      data-testid="empty-state-onboarding"
      className="h-full overflow-y-auto flex justify-center"
    >
      <div className="max-w-xl w-full px-8 py-12">
        <div className="mb-2 text-[10px] uppercase tracking-[0.10em] text-vigil-mute">
          Proxy
        </div>
        <h2 className="text-[20px] font-medium text-vigil-ink mb-3 leading-tight">
          No proxy running yet.
        </h2>
        <p className="text-[12px] text-vigil-mute leading-relaxed mb-8 max-w-lg">
          Vigil sits between your AI agents and your databases. Once you start
          the proxy, every query will appear here — identified, audited, and
          shaped.
        </p>

        <ol className="space-y-4 mb-8">
          {STEPS.map((s) => (
            <li key={s.n} className="flex items-start gap-3">
              <span
                aria-hidden
                className="w-5 h-5 rounded-full bg-vigil-surface border border-vigil-rule text-[11px] flex items-center justify-center text-vigil-mute mt-1 shrink-0"
              >
                {s.n}
              </span>
              <div className="flex-1 min-w-0">
                <div className="text-[10px] uppercase tracking-[0.10em] text-vigil-mute mb-1">
                  {s.label}
                </div>
                <CopyableCommand command={s.cmd} />
              </div>
            </li>
          ))}
        </ol>

        <div className="flex items-center justify-between gap-4 pt-4 border-t border-vigil-rule">
          <a
            href="https://github.com/constantinexanthos/vigil#readme"
            target="_blank"
            rel="noreferrer"
            className="text-[12px] text-vigil-ink hover:text-vigil-accent transition-colors duration-fast underline decoration-vigil-rule underline-offset-2"
          >
            Full guide on GitHub →
          </a>
          <button
            type="button"
            onClick={onShowDemo}
            data-testid="show-demo-link"
            className="text-[12px] text-vigil-mute hover:text-vigil-ink transition-colors duration-fast"
          >
            or try the demo dashboard with fixture data →
          </button>
        </div>
      </div>
    </section>
  );
}

function CopyableCommand({ command }: { command: string }) {
  const [copied, setCopied] = useState(false);

  const onCopy = async () => {
    try {
      await navigator.clipboard.writeText(command);
    } catch {
      // Clipboard may be unavailable in some sandboxed environments. Visual
      // confirmation still fires so the click feels acknowledged.
    }
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1200);
  };

  return (
    <button
      type="button"
      onClick={onCopy}
      data-testid="copyable-command"
      className="w-full text-left bg-vigil-surface border border-vigil-rule rounded px-3 py-2 hover:border-vigil-accent transition-colors duration-fast group relative"
      title={copied ? "Copied!" : "Click to copy"}
    >
      <pre className="font-mono text-[12px] text-vigil-ink whitespace-pre-wrap break-all leading-relaxed">
        {command}
      </pre>
      <span
        aria-hidden
        className={`absolute top-1.5 right-2 text-[10px] uppercase tracking-[0.10em] transition-opacity duration-fast ${
          copied ? "text-vigil-accent opacity-100" : "text-vigil-mute opacity-0 group-hover:opacity-100"
        }`}
      >
        {copied ? "Copied" : "Copy"}
      </span>
    </button>
  );
}
