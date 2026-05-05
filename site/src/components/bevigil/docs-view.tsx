import { SiteHeader } from "./site-header"
import { SiteFooter } from "./site-footer"
import { quickstart, REPO_URL } from "./content"
import { GithubGlyph } from "./icons"

const SERIF =
  "var(--font-serif), 'Newsreader', ui-serif, Georgia, Cambria, 'Times New Roman', serif"
const SANS =
  "var(--font-inter), -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Inter', 'Helvetica Neue', Arial, sans-serif"
const MONO = "var(--font-mono), ui-monospace, SFMono-Regular, Menlo, monospace"

export function DocsView() {
  return (
    <div
      className="relative min-h-screen bg-white text-stone-900"
      style={{ fontFamily: SANS }}
    >
      <SiteHeader pathname="/docs" />

      <main>
        {/* HERO */}
        <section className="relative">
          <div className="mx-auto w-full max-w-[860px] px-6 pt-24 pb-24 sm:pt-32 sm:pb-32">
            <span
              className="mb-9 inline-flex items-center gap-2 text-[11px] uppercase tracking-[0.18em] text-stone-500"
              style={{ fontFamily: MONO }}
            >
              <span aria-hidden className="h-px w-6 bg-stone-300" />
              Docs · {quickstart.length} steps to first identity
            </span>

            <h1
              className="max-w-[18ch] text-[42px] font-normal leading-[1.04] tracking-[-0.02em] text-stone-900 sm:text-[58px]"
              style={{ fontFamily: SERIF }}
            >
              Get started with{" "}
              <span className="italic text-stone-700">Vigil.</span>
            </h1>

            <p className="mt-7 max-w-[60ch] text-[17px] leading-[1.6] text-stone-600">
              Vigil ships as a single Go binary. The four steps below mint an
              agent identity through the proxy&rsquo;s HTTP API. State persists
              under <code className="font-mono text-[15.5px] text-stone-700">~/.vigil/</code>.
            </p>
          </div>
        </section>

        {/* QUICKSTART */}
        <Section eyebrow="Quickstart">
          <ol className="space-y-12">
            {quickstart.map((step, i) => (
              <li key={step.step}>
                <div className="flex items-baseline gap-4">
                  <span
                    className="text-[12.5px] font-semibold text-cyan-700"
                    style={{ fontFamily: MONO }}
                  >
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  <h2
                    className="text-[24px] font-normal leading-tight tracking-[-0.01em] text-stone-900 sm:text-[28px]"
                    style={{ fontFamily: SERIF }}
                  >
                    {step.step}
                  </h2>
                </div>
                <p className="mt-3 max-w-[60ch] text-[16px] leading-[1.65] text-stone-600">
                  {step.description}
                </p>
                <pre
                  className="mt-5 overflow-x-auto rounded-md border border-stone-200 bg-stone-50 p-5 text-[13.5px] leading-relaxed text-stone-800"
                  style={{ fontFamily: MONO }}
                >
                  <code>{step.command}</code>
                </pre>
              </li>
            ))}
          </ol>
        </Section>

        {/* MORE */}
        <Section eyebrow="What's next">
          <h2
            className="text-[28px] font-normal leading-[1.15] tracking-[-0.02em] text-stone-900 sm:text-[36px]"
            style={{ fontFamily: SERIF }}
          >
            Full docs are coming. For now, the code is the source of truth.
          </h2>
          <p className="mt-5 max-w-[60ch] text-[16.5px] leading-relaxed text-stone-600">
            The proxy lives in the <code className="text-[15px]">proxy/</code>{" "}
            directory of the main repo. Implementation, tests, and the design
            spec are all there. Open an issue, or read the design doc directly
            in the repo.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <a
              href={REPO_URL}
              target="_blank"
              rel="noreferrer noopener"
              className="inline-flex items-center gap-1.5 rounded-md border border-stone-200 px-4 py-2 text-[13.5px] font-medium tracking-tight text-stone-700 transition hover:border-cyan-700/40 hover:text-cyan-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-700/40"
            >
              <GithubGlyph />
              <span>vigil on github</span>
            </a>
            <a
              href={`${REPO_URL}/tree/main/proxy`}
              target="_blank"
              rel="noreferrer noopener"
              className="inline-flex items-center gap-1.5 rounded-md border border-stone-200 px-4 py-2 text-[13.5px] font-medium tracking-tight text-stone-700 transition hover:border-cyan-700/40 hover:text-cyan-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-700/40"
            >
              <span>proxy/ directory</span>
              <span aria-hidden>&rarr;</span>
            </a>
            <a
              href={`${REPO_URL}/blob/main/docs/superpowers/specs/2026-05-04-vigil-data-plane-design.md`}
              target="_blank"
              rel="noreferrer noopener"
              className="inline-flex items-center gap-1.5 rounded-md border border-stone-200 px-4 py-2 text-[13.5px] font-medium tracking-tight text-stone-700 transition hover:border-cyan-700/40 hover:text-cyan-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-700/40"
            >
              <span>design spec</span>
              <span aria-hidden>&rarr;</span>
            </a>
          </div>
        </Section>
      </main>

      <SiteFooter />
    </div>
  )
}

function Section({
  children,
  eyebrow,
}: {
  children: React.ReactNode
  eyebrow: string
}) {
  return (
    <section className="relative">
      <div className="mx-auto w-full max-w-[860px] px-6 pb-32 pt-20 sm:pb-40 sm:pt-24">
        <SectionLabel>{eyebrow}</SectionLabel>
        <div className="mt-6">{children}</div>
      </div>
      <div
        aria-hidden
        className="mx-auto h-px max-w-[860px] bg-stone-200"
        style={{ marginLeft: "1.5rem", marginRight: "1.5rem" }}
      />
    </section>
  )
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <span
      className="inline-flex items-center gap-2 text-[10.5px] uppercase tracking-[0.2em] text-cyan-700"
      style={{ fontFamily: MONO }}
    >
      <span aria-hidden className="h-px w-5 bg-cyan-700/40" />
      {children}
    </span>
  )
}
