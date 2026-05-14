import { useState } from "react";

interface Props {
  // onShowDemo flips the tab to fixture-data mode without requiring the proxy
  // to be installed. Useful for product demos and screenshot capture.
  onShowDemo: () => void;
}

// Three commands the user runs to start the proxy. The middle one is a
// multi-line snippet shown as a single copy unit; the comment after the
// last line is intentionally part of the copyable text so a user who
// pastes into a fresh terminal sees the "point your client" reminder.
const STEPS: { n: number; label: string; cmd: string }[] = [
  { n: 1, label: "Install", cmd: "brew install vigil" },
  {
    n: 2,
    label: "Start the proxy",
    cmd:
      "vigil-proxy \\\n  --postgres-listen :7432 \\\n  --postgres-upstream localhost:5432",
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
        <div className="mb-1.5 text-[10px] uppercase tracking-[0.12em] text-white/35">
          Proxy
        </div>
        <h2 className="text-[22px] font-medium text-white mb-2 leading-tight">
          No proxy running yet.
        </h2>
        <p className="text-[12.5px] text-white/55 leading-relaxed mb-8 max-w-lg">
          Vigil sits between your AI agents and your databases. Once you start
          the proxy, every query will appear here — identified, audited, and
          shaped.
        </p>

        <ol className="space-y-3 mb-8">
          {STEPS.map((s) => (
            <li key={s.n} className="flex items-start gap-3">
              <span
                aria-hidden
                className="w-5 h-5 rounded-full bg-white/[0.05] border border-white/10 text-[10px] flex items-center justify-center text-white/55 mt-1.5 shrink-0"
              >
                {s.n}
              </span>
              <div className="flex-1 min-w-0">
                <div className="text-[10px] uppercase tracking-[0.08em] text-white/35 mb-1">
                  {s.label}
                </div>
                <CopyableCommand command={s.cmd} />
              </div>
            </li>
          ))}
        </ol>

        <div className="flex items-center justify-between gap-4 pt-4 border-t border-white/[0.06]">
          <a
            href="https://github.com/constantinexanthos/vigil#readme"
            target="_blank"
            rel="noreferrer"
            className="text-[11.5px] text-white/65 hover:text-white/85 transition-colors duration-fast underline decoration-white/20 underline-offset-2"
          >
            Full guide on GitHub →
          </a>
          <button
            type="button"
            onClick={onShowDemo}
            data-testid="show-demo-link"
            className="text-[11.5px] text-white/40 hover:text-white/65 transition-colors duration-fast"
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
      // Clipboard may be unavailable in some sandboxed environments. We still
      // give visual confirmation so the click feels acknowledged; the user
      // can fall back to manual selection.
    }
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1200);
  };

  return (
    <button
      type="button"
      onClick={onCopy}
      data-testid="copyable-command"
      className="w-full text-left bg-white/[0.025] border border-white/[0.06] rounded px-3 py-2 hover:bg-white/[0.04] hover:border-white/[0.1] transition-colors duration-fast group relative"
      title={copied ? "Copied!" : "Click to copy"}
    >
      <pre className="font-mono text-[11.5px] text-white/85 whitespace-pre-wrap break-all leading-relaxed">
        {command}
      </pre>
      <span
        aria-hidden
        className={`absolute top-1.5 right-2 text-[9px] uppercase tracking-[0.08em] transition-opacity duration-fast ${
          copied ? "text-emerald-300/80 opacity-100" : "text-white/35 opacity-0 group-hover:opacity-100"
        }`}
      >
        {copied ? "Copied" : "Copy"}
      </span>
    </button>
  );
}
