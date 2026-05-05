import { REPO_URL, VERSION } from "./content"
import { GithubGlyph } from "./icons"

const MONO = "var(--font-mono), ui-monospace, SFMono-Regular, Menlo, monospace"

// Site-wide v2 footer. Clearly the end of the page — heavier top border,
// generous padding, full-width spread of meta links so it doesn't read as
// "another section that got cut".
export function SiteFooter() {
  return (
    <footer className="relative mt-32 border-t-2 border-stone-200 bg-stone-50">
      <div className="mx-auto w-full max-w-[1180px] px-6 py-14">
        <div
          className="flex flex-col items-start justify-between gap-6 text-[11.5px] uppercase tracking-[0.18em] text-stone-500 sm:flex-row sm:items-center"
          style={{ fontFamily: MONO }}
        >
          <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
            <span className="text-stone-700">bevigil.ai</span>
            <span aria-hidden className="text-stone-300">
              /
            </span>
            <span>open source</span>
            <span aria-hidden className="text-stone-300">
              /
            </span>
            <span>MIT</span>
            <span aria-hidden className="text-stone-300">
              /
            </span>
            <span>made by costa</span>
            <span aria-hidden className="text-stone-300">
              /
            </span>
            <span>{VERSION}</span>
          </div>
          <a
            href={REPO_URL}
            target="_blank"
            rel="noreferrer noopener"
            aria-label="Vigil on GitHub"
            className="inline-flex items-center gap-1.5 rounded-full px-2 py-1 text-stone-500 transition-colors hover:text-cyan-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-700/40"
          >
            <GithubGlyph />
            <span>github</span>
          </a>
        </div>

        <p className="mt-10 max-w-[60ch] text-[13px] leading-relaxed text-stone-500">
          Vigil is the agent-aware data plane that sits between AI agents and
          the systems they touch. Per-agent identity, smart rate limiting,
          fan-out coalescing, blast-radius control, signed audit trail. One
          binary. Free for individuals.
        </p>
      </div>
    </footer>
  )
}
