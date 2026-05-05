import Link from "next/link"
import { EarlyAccessForm } from "@/components/bevigil/early-access-form"
import { RainingBackground } from "@/components/raining-background"

const ACCENT = "#22d3ee"
const VERSION = "v0.1.0"

// Five primitives — text lifted verbatim from vigil-candidate-a.html.
const primitives: { title: string; body: string }[] = [
  {
    title: "Per-agent identity",
    body: "Every agent gets a stable ID issued by Vigil. The proxy attaches it to every request. Now the database, the logs, and the rate limiter can all distinguish “Claude doing the refactor” from “Cursor running tests” from “your production web traffic.”",
  },
  {
    title: "Per-agent rate limiting",
    body: "Token-bucket throttling that knows which agent is which. The analytics agent gets 100 q/sec, the refactor agent gets 20 q/sec. They don’t starve each other and they don’t starve production.",
  },
  {
    title: "Fan-out coalescing",
    body: "When an agent fires the same query repeatedly (which they do constantly), Vigil deduplicates and serves cached results. The single biggest cost-saver — cuts agent infrastructure costs 40–80% in early benchmarks.",
  },
  {
    title: "Blast-radius control",
    body: "“Agent X cannot DELETE from production. Agent Y cannot touch the migrations folder. Agent Z requires human approval before touching auth.” Policies enforced at the proxy, not in the agent’s prompt where it can be jailbroken out of.",
  },
  {
    title: "Audit trail",
    body: "Every action — what agent, what request, what response, was it cached, was it rate-limited, was it blocked by policy — is signed and logged. When something does go wrong, you can replay it. When auditors come, you have answers.",
  },
]

// Without/With Vigil scenario — verbatim from vigil-candidate-a.html.
const withoutVigil: { time: string; body: string }[] = [
  {
    time: "11:30",
    body: "Agent A is refactoring. It runs SELECT * FROM users WHERE email = ? 200 times in 30 seconds because the LLM keeps “rediscovering” the same query.",
  },
  {
    time: "11:31",
    body: "Agent B starts an analytics task. Giant aggregation query against the same table.",
  },
  {
    time: "11:32",
    body: "Postgres CPU hits 100%. Query latency goes from 5ms to 800ms.",
  },
  {
    time: "11:33",
    body: "Your production website starts timing out. Customers complain.",
  },
  {
    time: "11:35",
    body: "Slack war room. Three engineers stop what they’re doing.",
  },
  {
    time: "11:50",
    body: "Database load is the obvious culprit, but nobody knows which agent did what — they all share the same DB credentials.",
  },
  {
    time: "12:15",
    body: "Identified and killed.",
  },
  {
    time: "12:30",
    body: "Postmortem. “We need rate limits.” Cloudflare rate limits are per-IP. All your agents come from the same Kubernetes pod.",
  },
]

const withVigil: { time: string; body: string }[] = [
  {
    time: "11:30",
    body: "Agent A makes its 1st query. Vigil sees the agent’s identity, runs the query.",
  },
  {
    time: "11:30",
    body: "Agent A makes its 11th identical query. Vigil notices, serves cached result instantly. Logs “Coalesced 10 redundant queries from Agent A.”",
  },
  {
    time: "11:31",
    body: "Agent B starts the analytics aggregation. Vigil sees it competing with Agent A’s hammering and throttles Agent A first — Agent A is in a low-priority pool.",
  },
  {
    time: "11:31",
    body: "Production web traffic is isolated in a separate rate-limit pool entirely. Untouched.",
  },
  {
    time: "11:32",
    body: "Postgres CPU stays at 30%. Customers don’t notice anything.",
  },
  {
    time: "12:00",
    body: "You glance at the Vigil dashboard out of curiosity: Agent A: 437 queries → 89 actually executed (348 deduplicated, 0 rate-limited). Agent B: 14 queries → 14 executed. Production: unaffected.",
  },
  {
    time: "12:05",
    body: "You realize you saved yourself a war room.",
  },
]

// Human-vs-agent table — verbatim from vigil-candidate-a.html.
const trafficMismatch: { humans: string; agents: string }[] = [
  {
    humans: "Click a button, wait for one response",
    agents: "Fire 50 queries in 2 seconds",
  },
  {
    humans: "One person = one identity",
    agents: "5 agents share one API key, indistinguishable",
  },
  {
    humans: "Don’t repeat themselves",
    agents: "Re-fire the same query 200 times because the LLM forgot",
  },
  {
    humans: "Rarely take down their own DB",
    agents: "Do it casually",
  },
]

// Positioning row — verbatim from the brief.
const notList: string[] = [
  "Not an orchestrator (Conductor does that).",
  "Not an LLM observability tool (Langfuse does that).",
  "Not an agent identity provider (Keycard does that).",
  "Vigil sits below all of them, in the data path.",
]

const SERIF =
  "var(--font-serif), 'Newsreader', ui-serif, Georgia, Cambria, 'Times New Roman', serif"
const SANS =
  "var(--font-inter), -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Inter', 'Helvetica Neue', Arial, sans-serif"
const MONO = "var(--font-mono), ui-monospace, SFMono-Regular, Menlo, monospace"

// Section backdrop — sits above RainingBackground, dims the falling
// chars enough that body copy is readable. Keep transparent enough that
// the signature still bleeds through.
const SECTION_BACKDROP = "bg-[rgba(10,10,10,0.85)]"

export default function BevigilLanding() {
  return (
    <div
      className="relative min-h-screen overflow-x-hidden bg-[#0a0a0a] text-stone-100"
      style={{ fontFamily: SANS }}
    >
      {/* Falling-character signature — fixed, full-screen, behind everything. */}
      <RainingBackground />

      {/* Subtle vignette to settle the chars at top/bottom edges. */}
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0 z-[1]"
        style={{
          background:
            "radial-gradient(ellipse at top, rgba(10,10,10,0) 0%, rgba(10,10,10,0.55) 70%, rgba(10,10,10,0.85) 100%)",
        }}
      />

      <div className="relative z-10">
        {/* HEADER */}
        <header className="sticky top-0 z-40 border-b border-white/5 bg-[rgba(10,10,10,0.65)] backdrop-blur-md">
          <div className="mx-auto flex w-full max-w-[1180px] items-center justify-between px-6 py-4">
            <Link
              href="/"
              className="flex items-center gap-2.5 text-[14px] font-medium tracking-tight text-stone-100"
            >
              <span
                aria-hidden
                className="inline-block h-2 w-2 rounded-full"
                style={{
                  background: ACCENT,
                  boxShadow: "0 0 10px rgba(34, 211, 238, 0.7)",
                }}
              />
              <span>bevigil.ai</span>
            </Link>

            <nav
              className="hidden items-center gap-1.5 rounded-full border border-white/5 bg-white/[0.025] px-1.5 py-1 text-[12.5px] text-stone-400 sm:flex"
              aria-label="Primary"
              style={{ fontFamily: SANS }}
            >
              <NavItem href="/" active>
                home
              </NavItem>
              <NavItem href="#what-it-does">proxy</NavItem>
              <NavItem href="/old">docs</NavItem>
              <NavItem
                href="https://github.com"
                ariaLabel="View Vigil on GitHub"
                external
              >
                <span className="inline-flex items-center gap-1.5">
                  <GithubGlyph />
                  github
                </span>
              </NavItem>
            </nav>

            <div className="flex items-center gap-3">
              <span
                className="hidden text-[11px] tracking-tight text-stone-500 md:inline"
                style={{ fontFamily: MONO }}
              >
                {VERSION}
              </span>
              <a
                href="#early-access"
                className="inline-flex h-8 items-center rounded-full border border-cyan-400/30 bg-cyan-400/[0.08] px-3 text-[12px] font-medium tracking-tight text-cyan-200 transition hover:border-cyan-400/60 hover:bg-cyan-400/[0.14]"
              >
                early access
              </a>
            </div>
          </div>
        </header>

        <main>
          {/* HERO */}
          <section className="relative">
            <div className="mx-auto w-full max-w-[1180px] px-6 pt-24 pb-24 sm:pt-32 sm:pb-32">
              <span
                className="mb-9 inline-flex items-center gap-2 text-[11px] uppercase tracking-[0.18em] text-stone-500"
                style={{ fontFamily: MONO }}
              >
                <span
                  aria-hidden
                  className="h-px w-6 bg-stone-700"
                />
                Open source · Single binary · Free for individuals
              </span>

              <h1
                className="max-w-[18ch] text-[44px] font-normal leading-[1.02] tracking-[-0.02em] text-stone-50 sm:text-[64px] md:text-[72px]"
                style={{ fontFamily: SERIF }}
              >
                The seatbelt for your{" "}
                <span className="italic text-stone-200">agent fleet.</span>
              </h1>

              <p className="mt-7 max-w-[600px] text-[18px] leading-[1.55] text-stone-400 sm:text-[19px]">
                Vigil is the agent-aware data plane that sits between your AI
                agents and your databases, APIs, and services. Per-agent
                identity, smart rate limiting, fan-out coalescing, blast-radius
                control. Open source. Single binary. Free for individuals.
              </p>

              <div className="mt-10 flex flex-col gap-5 sm:max-w-md">
                <EarlyAccessForm />
                <a
                  href="#"
                  className="text-[13.5px] font-medium tracking-tight text-stone-400 underline-offset-4 transition hover:text-cyan-300 hover:underline"
                >
                  <span className="inline-flex items-center gap-1.5">
                    <GithubGlyph />
                    View on GitHub
                    <span aria-hidden>&rarr;</span>
                  </span>
                </a>
              </div>
            </div>
          </section>

          {/* THE PROBLEM */}
          <section id="problem" className={`relative ${SECTION_BACKDROP}`}>
            <div className="absolute inset-x-0 top-0 h-px bg-white/5" />
            <div className="mx-auto w-full max-w-[1180px] px-6 py-24 sm:py-28">
              <div className="mb-12 max-w-[640px]">
                <SectionLabel>The problem</SectionLabel>
                <h2
                  className="mt-5 text-[32px] font-normal leading-[1.1] tracking-[-0.02em] text-stone-50 sm:text-[44px]"
                  style={{ fontFamily: SERIF }}
                >
                  Today&rsquo;s infrastructure was built for humans. Agents look
                  like a <span className="italic">DDoS</span>.
                </h2>
                <p className="mt-5 max-w-[580px] text-[16.5px] leading-relaxed text-stone-400">
                  Postgres, Redis, Cloudflare rate limiters, AWS API Gateway
                  were tuned for human-shaped traffic. Agents shift the shape
                  from one user, one request to one goal, thousands of
                  sub-requests, many of them redundant.
                </p>
              </div>

              <div className="grid gap-px overflow-hidden rounded-md border border-white/5 bg-white/5 sm:grid-cols-2">
                <div className="bg-[#0a0a0a] p-7 sm:p-8">
                  <div
                    className="mb-5 text-[10.5px] uppercase tracking-[0.2em] text-stone-500"
                    style={{ fontFamily: MONO }}
                  >
                    Humans
                  </div>
                  <ul className="space-y-4 text-[15px] leading-relaxed text-stone-400">
                    {trafficMismatch.map((row) => (
                      <li
                        key={row.humans}
                        className="flex gap-3 border-b border-white/[0.04] pb-4 last:border-b-0 last:pb-0"
                      >
                        <span
                          aria-hidden
                          className="mt-2 h-1 w-1 shrink-0 rounded-full bg-stone-600"
                        />
                        <span>{row.humans}</span>
                      </li>
                    ))}
                  </ul>
                </div>
                <div className="bg-[#0a0a0a] p-7 sm:p-8">
                  <div
                    className="mb-5 text-[10.5px] uppercase tracking-[0.2em] text-cyan-300"
                    style={{ fontFamily: MONO }}
                  >
                    Agents
                  </div>
                  <ul className="space-y-4 text-[15px] leading-relaxed text-stone-100">
                    {trafficMismatch.map((row) => (
                      <li
                        key={row.agents}
                        className="flex gap-3 border-b border-white/[0.04] pb-4 last:border-b-0 last:pb-0"
                      >
                        <span
                          aria-hidden
                          className="mt-2 h-1 w-1 shrink-0 rounded-full"
                          style={{ background: ACCENT }}
                        />
                        <span>{row.agents}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>
          </section>

          {/* WHAT IT DOES */}
          <section
            id="what-it-does"
            className={`relative ${SECTION_BACKDROP}`}
          >
            <div className="absolute inset-x-0 top-0 h-px bg-white/5" />
            <div className="mx-auto w-full max-w-[1180px] px-6 py-24 sm:py-28">
              <div className="mb-14 max-w-[640px]">
                <SectionLabel>What it does</SectionLabel>
                <h2
                  className="mt-5 text-[32px] font-normal leading-[1.1] tracking-[-0.02em] text-stone-50 sm:text-[44px]"
                  style={{ fontFamily: SERIF }}
                >
                  Five primitives, one binary in your{" "}
                  <span className="italic">data path.</span>
                </h2>
              </div>

              <ol className="grid gap-px overflow-hidden rounded-md border border-white/5 bg-white/5 sm:grid-cols-2 lg:grid-cols-3">
                {primitives.map((p, i) => (
                  <li
                    key={p.title}
                    className="flex flex-col gap-4 bg-[#0a0a0a] p-7 sm:p-8"
                  >
                    <span
                      className="text-[36px] font-light leading-none text-cyan-300/90"
                      style={{ fontFamily: SERIF }}
                    >
                      {String(i + 1).padStart(2, "0")}
                    </span>
                    <h3
                      className="text-[20px] font-medium leading-tight tracking-tight text-stone-100"
                      style={{ fontFamily: SANS }}
                    >
                      {p.title}
                    </h3>
                    <p className="text-[14.5px] leading-[1.65] text-stone-400">
                      {p.body}
                    </p>
                  </li>
                ))}
              </ol>
            </div>
          </section>

          {/* SCENARIO */}
          <section id="scenario" className={`relative ${SECTION_BACKDROP}`}>
            <div className="absolute inset-x-0 top-0 h-px bg-white/5" />
            <div className="mx-auto w-full max-w-[1180px] px-6 py-24 sm:py-28">
              <div className="mb-12 max-w-[640px]">
                <SectionLabel>A concrete scenario</SectionLabel>
                <h2
                  className="mt-5 text-[32px] font-normal leading-[1.1] tracking-[-0.02em] text-stone-50 sm:text-[44px]"
                  style={{ fontFamily: SERIF }}
                >
                  10-person startup. Postgres, Redis, five coding agents.
                </h2>
                <p className="mt-5 text-[16.5px] leading-relaxed text-stone-400">
                  Same Tuesday morning, told two ways.
                </p>
              </div>

              <div className="grid gap-6 lg:grid-cols-2">
                {/* Without */}
                <div className="overflow-hidden rounded-md border border-white/5 bg-[#0d0a0a]">
                  <div
                    className="border-t-2 px-6 py-4"
                    style={{ borderColor: "#6b1d1d" }}
                  >
                    <div className="flex items-center gap-2">
                      <span
                        aria-hidden
                        className="h-1.5 w-1.5 rounded-full"
                        style={{ background: "#b85050" }}
                      />
                      <span
                        className="text-[10.5px] uppercase tracking-[0.2em] text-[#d99090]"
                        style={{ fontFamily: MONO }}
                      >
                        Without Vigil
                      </span>
                    </div>
                  </div>
                  <ul className="divide-y divide-white/[0.04] px-6 py-2">
                    {withoutVigil.map((row, i) => (
                      <li
                        key={`${row.time}-${i}`}
                        className="flex gap-5 py-4 text-[14.5px] leading-relaxed text-stone-400"
                      >
                        <span
                          className="text-[12px] font-medium tracking-wider text-[#a96d6d]"
                          style={{
                            fontFamily: MONO,
                            minWidth: "3.25rem",
                          }}
                        >
                          {row.time}
                        </span>
                        <span>{row.body}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                {/* With */}
                <div className="overflow-hidden rounded-md border border-white/5 bg-[#0a0d0b]">
                  <div
                    className="border-t-2 px-6 py-4"
                    style={{ borderColor: "#1d4d2e" }}
                  >
                    <div className="flex items-center gap-2">
                      <span
                        aria-hidden
                        className="h-1.5 w-1.5 rounded-full"
                        style={{ background: "#5fb37b" }}
                      />
                      <span
                        className="text-[10.5px] uppercase tracking-[0.2em] text-[#9bd3ae]"
                        style={{ fontFamily: MONO }}
                      >
                        With Vigil
                      </span>
                    </div>
                  </div>
                  <ul className="divide-y divide-white/[0.04] px-6 py-2">
                    {withVigil.map((row, i) => (
                      <li
                        key={`${row.time}-${i}`}
                        className="flex gap-5 py-4 text-[14.5px] leading-relaxed text-stone-400"
                      >
                        <span
                          className="text-[12px] font-medium tracking-wider text-[#6fa185]"
                          style={{
                            fontFamily: MONO,
                            minWidth: "3.25rem",
                          }}
                        >
                          {row.time}
                        </span>
                        <span>{row.body}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>

              <p
                className="mt-10 text-[15px] italic text-stone-500"
                style={{ fontFamily: SERIF }}
              >
                Not glamorous. Deeply useful.
              </p>
            </div>
          </section>

          {/* POSITIONING */}
          <section id="positioning" className="relative">
            <div className="absolute inset-x-0 top-0 h-px bg-white/5" />
            <div className="mx-auto w-full max-w-[1180px] px-6 py-24 sm:py-28">
              <div className="mb-10 max-w-[640px]">
                <SectionLabel>Where Vigil fits</SectionLabel>
                <h2
                  className="mt-5 text-[32px] font-normal leading-[1.1] tracking-[-0.02em] text-stone-50 sm:text-[44px]"
                  style={{ fontFamily: SERIF }}
                >
                  We sit below the stack you already have.
                </h2>
              </div>

              <ul className="grid gap-px overflow-hidden rounded-md border border-white/5 bg-white/5 sm:grid-cols-2">
                {notList.map((line) => (
                  <li
                    key={line}
                    className="bg-[rgba(10,10,10,0.92)] px-7 py-6 text-[15.5px] leading-snug text-stone-300"
                  >
                    {line}
                  </li>
                ))}
              </ul>
            </div>
          </section>

          {/* EARLY ACCESS */}
          <section
            id="early-access"
            className={`relative ${SECTION_BACKDROP}`}
          >
            <div className="absolute inset-x-0 top-0 h-px bg-white/5" />
            <div className="mx-auto w-full max-w-[1180px] px-6 py-24 sm:py-28">
              <div className="grid gap-12 lg:grid-cols-[1.1fr_1fr] lg:items-center">
                <div className="max-w-[560px]">
                  <SectionLabel>Early access</SectionLabel>
                  <h2
                    className="mt-5 text-[32px] font-normal leading-[1.1] tracking-[-0.02em] text-stone-50 sm:text-[44px]"
                    style={{ fontFamily: SERIF }}
                  >
                    Get the binary. Run it next to your{" "}
                    <span className="italic">database.</span>
                  </h2>
                  <p className="mt-5 text-[16.5px] leading-relaxed text-stone-400">
                    Vigil ships as a single Go binary. Drop it between an agent
                    and your data store, point it at a config file, watch the
                    audit trail land. Free for individuals; paid tiers when you
                    need team policy + cloud retention.
                  </p>
                </div>
                <div className="rounded-md border border-white/5 bg-[rgba(10,10,10,0.92)] p-7 sm:p-8">
                  <p className="mb-5 text-[14px] font-medium text-stone-300">
                    Drop your work email. We&rsquo;ll send the binary and a
                    walkthrough.
                  </p>
                  <EarlyAccessForm id="ea-email-bottom" />
                  <p
                    className="mt-5 text-[11.5px] uppercase tracking-[0.18em] text-stone-500"
                    style={{ fontFamily: MONO }}
                  >
                    No spam. Unsubscribe in one click.
                  </p>
                </div>
              </div>
            </div>
          </section>
        </main>

        {/* FOOTER */}
        <footer className="relative border-t border-white/5 bg-[rgba(10,10,10,0.92)]">
          <div
            className="mx-auto flex w-full max-w-[1180px] flex-col items-start justify-between gap-3 px-6 py-10 text-[11.5px] uppercase tracking-[0.18em] text-stone-500 sm:flex-row sm:items-center"
            style={{ fontFamily: MONO }}
          >
            <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
              <span className="text-stone-400">bevigil.ai</span>
              <span aria-hidden className="text-stone-700">
                /
              </span>
              <span>open source</span>
              <span aria-hidden className="text-stone-700">
                /
              </span>
              <span>MIT</span>
              <span aria-hidden className="text-stone-700">
                /
              </span>
              <span>made by costa</span>
              <span aria-hidden className="text-stone-700">
                /
              </span>
              <span>{VERSION}</span>
            </div>
            <a
              href="#"
              aria-label="Vigil on GitHub"
              className="inline-flex items-center gap-1.5 text-stone-500 transition-colors hover:text-cyan-300"
            >
              <GithubGlyph />
              <span>github</span>
            </a>
          </div>
        </footer>
      </div>
    </div>
  )
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <span
      className="inline-flex items-center gap-2 text-[10.5px] uppercase tracking-[0.2em] text-cyan-300/90"
      style={{ fontFamily: "var(--font-mono), ui-monospace, monospace" }}
    >
      <span aria-hidden className="h-px w-5 bg-cyan-400/40" />
      {children}
    </span>
  )
}

function NavItem({
  href,
  active,
  children,
  ariaLabel,
  external,
}: {
  href: string
  active?: boolean
  children: React.ReactNode
  ariaLabel?: string
  external?: boolean
}) {
  const className = `inline-flex items-center rounded-full px-3 py-1 transition-colors ${
    active
      ? "bg-white/[0.06] text-stone-100"
      : "text-stone-400 hover:text-stone-100"
  }`
  if (external) {
    return (
      <a
        href={href}
        aria-label={ariaLabel}
        className={className}
        target="_blank"
        rel="noreferrer noopener"
      >
        {children}
      </a>
    )
  }
  if (href.startsWith("#")) {
    return (
      <a href={href} aria-label={ariaLabel} className={className}>
        {children}
      </a>
    )
  }
  return (
    <Link href={href} aria-label={ariaLabel} className={className}>
      {children}
    </Link>
  )
}

function GithubGlyph() {
  return (
    <svg
      aria-hidden
      viewBox="0 0 16 16"
      width="14"
      height="14"
      fill="currentColor"
      className="shrink-0"
    >
      <path d="M8 .2a8 8 0 0 0-2.5 15.6c.4.07.55-.17.55-.38v-1.34c-2.22.48-2.69-1.07-2.69-1.07-.36-.92-.89-1.17-.89-1.17-.73-.5.06-.49.06-.49.8.06 1.23.83 1.23.83.72 1.23 1.88.87 2.34.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.83-2.15-.08-.2-.36-1.02.08-2.13 0 0 .67-.21 2.2.82a7.6 7.6 0 0 1 4 0c1.53-1.03 2.2-.82 2.2-.82.44 1.11.16 1.93.08 2.13.51.56.83 1.28.83 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48v2.19c0 .21.15.46.55.38A8 8 0 0 0 8 .2Z" />
    </svg>
  )
}
