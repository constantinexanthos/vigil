import Link from "next/link"
import { EarlyAccessForm } from "@/components/bevigil/early-access-form"

const ACCENT = "#c2410c"

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

export default function BevigilLanding() {
  return (
    <div
      className="min-h-screen bg-white text-stone-900 [--accent:#c2410c]"
      style={{
        fontFamily:
          "var(--font-inter), -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Inter', 'Helvetica Neue', Arial, sans-serif",
      }}
    >
      {/* Header */}
      <header className="sticky top-0 z-40 border-b border-stone-200/80 bg-white/85 backdrop-blur">
        <div className="mx-auto flex w-full max-w-[1100px] items-center justify-between px-6 py-4 sm:py-5">
          <Link
            href="/"
            className="flex items-center gap-2 text-[15px] font-semibold tracking-tight"
          >
            <span
              aria-hidden
              className="inline-block h-2.5 w-2.5 rounded-full"
              style={{ background: ACCENT }}
            />
            <span>bevigil.ai</span>
          </Link>
          <nav className="flex items-center gap-5 text-[13px] font-medium text-stone-600">
            <a
              href="#what-it-does"
              className="hidden transition-colors hover:text-stone-900 sm:inline"
            >
              What it does
            </a>
            <a
              href="#scenario"
              className="hidden transition-colors hover:text-stone-900 sm:inline"
            >
              Scenario
            </a>
            <a
              href="#"
              className="inline-flex items-center gap-1.5 transition-colors hover:text-stone-900"
              aria-label="View Vigil on GitHub"
            >
              <GithubGlyph />
              <span>GitHub</span>
            </a>
          </nav>
        </div>
      </header>

      <main>
        {/* HERO */}
        <section className="border-b border-stone-200/70">
          <div className="mx-auto w-full max-w-[1100px] px-6 pt-16 pb-20 sm:pt-24 sm:pb-28">
            <span
              className="mb-5 inline-flex items-center gap-2 rounded-full border border-[color:var(--accent)]/25 bg-[color:var(--accent)]/[0.06] px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-[color:var(--accent)]"
            >
              <span
                aria-hidden
                className="h-1.5 w-1.5 rounded-full"
                style={{ background: ACCENT }}
              />
              Open source · Single binary · Free for individuals
            </span>
            <h1 className="max-w-3xl text-[40px] font-bold leading-[1.06] tracking-tight text-stone-900 sm:text-[56px] sm:leading-[1.04]">
              The seatbelt for your agent fleet.
            </h1>
            <p className="mt-6 max-w-2xl text-[18px] leading-[1.6] text-stone-600 sm:text-[19px]">
              Vigil is the agent-aware data plane that sits between your AI
              agents and your databases, APIs, and services. Per-agent
              identity, smart rate limiting, fan-out coalescing, blast-radius
              control. Open source. Single binary. Free for individuals.
            </p>

            <div className="mt-9 flex flex-col gap-4 sm:max-w-md">
              <EarlyAccessForm />
              <a
                href="#"
                className="text-[14px] font-medium text-stone-700 underline-offset-4 transition hover:text-[color:var(--accent)] hover:underline"
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

        {/* THE PROBLEM — human vs agent traffic */}
        <section id="problem" className="border-b border-stone-200/70 bg-stone-50/60">
          <div className="mx-auto w-full max-w-[1100px] px-6 py-20 sm:py-24">
            <div className="mb-10 max-w-2xl">
              <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[color:var(--accent)]">
                The problem
              </span>
              <h2 className="mt-3 text-[28px] font-bold leading-tight tracking-tight sm:text-[34px]">
                Today&rsquo;s infrastructure was built for humans. Agents look
                like a DDoS.
              </h2>
              <p className="mt-4 text-[16px] leading-relaxed text-stone-600">
                Postgres, Redis, Cloudflare rate limiters, AWS API Gateway
                were tuned for human-shaped traffic. Agents shift the shape
                from one user, one request to one goal, thousands of
                sub-requests, many of them redundant.
              </p>
            </div>

            <div className="grid gap-px overflow-hidden rounded-xl border border-stone-200 bg-stone-200 sm:grid-cols-2">
              <div className="bg-white p-5 sm:p-6">
                <div className="mb-3 text-[11px] font-semibold uppercase tracking-[0.14em] text-stone-500">
                  Humans
                </div>
                <ul className="space-y-3 text-[15px] leading-relaxed text-stone-700">
                  {trafficMismatch.map((row) => (
                    <li
                      key={row.humans}
                      className="flex gap-3 border-b border-stone-100 pb-3 last:border-b-0 last:pb-0"
                    >
                      <span
                        aria-hidden
                        className="mt-2 h-1 w-1 shrink-0 rounded-full bg-stone-300"
                      />
                      <span>{row.humans}</span>
                    </li>
                  ))}
                </ul>
              </div>
              <div className="bg-white p-5 sm:p-6">
                <div className="mb-3 text-[11px] font-semibold uppercase tracking-[0.14em] text-[color:var(--accent)]">
                  Agents
                </div>
                <ul className="space-y-3 text-[15px] leading-relaxed text-stone-900">
                  {trafficMismatch.map((row) => (
                    <li
                      key={row.agents}
                      className="flex gap-3 border-b border-stone-100 pb-3 last:border-b-0 last:pb-0"
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

        {/* WHAT IT DOES — five primitives */}
        <section id="what-it-does" className="border-b border-stone-200/70">
          <div className="mx-auto w-full max-w-[1100px] px-6 py-20 sm:py-24">
            <div className="mb-12 max-w-2xl">
              <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[color:var(--accent)]">
                What it does
              </span>
              <h2 className="mt-3 text-[28px] font-bold leading-tight tracking-tight sm:text-[34px]">
                Five primitives, one binary in your data path.
              </h2>
            </div>

            <ol className="grid gap-px overflow-hidden rounded-xl border border-stone-200 bg-stone-200 sm:grid-cols-2 lg:grid-cols-3">
              {primitives.map((p, i) => (
                <li
                  key={p.title}
                  className="flex flex-col gap-3 bg-white p-6 sm:p-7"
                >
                  <span
                    className="font-mono text-[12px] font-semibold tracking-wider"
                    style={{ color: ACCENT }}
                  >
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  <h3 className="text-[18px] font-semibold leading-tight tracking-tight text-stone-900">
                    {p.title}
                  </h3>
                  <p className="text-[15px] leading-relaxed text-stone-600">
                    {p.body}
                  </p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        {/* THE SCENARIO — without/with Vigil */}
        <section id="scenario" className="border-b border-stone-200/70 bg-stone-50/60">
          <div className="mx-auto w-full max-w-[1100px] px-6 py-20 sm:py-24">
            <div className="mb-10 max-w-2xl">
              <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[color:var(--accent)]">
                A concrete scenario
              </span>
              <h2 className="mt-3 text-[28px] font-bold leading-tight tracking-tight sm:text-[34px]">
                10-person startup. Postgres, Redis, five coding agents.
              </h2>
              <p className="mt-4 text-[16px] leading-relaxed text-stone-600">
                Same Tuesday morning, told two ways.
              </p>
            </div>

            <div className="grid gap-6 lg:grid-cols-2">
              {/* Without */}
              <div className="overflow-hidden rounded-xl border border-red-200 bg-white shadow-[0_1px_2px_rgba(0,0,0,0.02)]">
                <div className="flex items-center gap-2 border-b border-red-200 bg-red-50 px-5 py-3">
                  <span
                    aria-hidden
                    className="h-1.5 w-1.5 rounded-full bg-red-700"
                  />
                  <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-red-800">
                    Without Vigil
                  </span>
                </div>
                <ul className="divide-y divide-stone-100 px-5 py-2 sm:px-6">
                  {withoutVigil.map((row, i) => (
                    <li
                      key={`${row.time}-${i}`}
                      className="flex gap-4 py-3 text-[14.5px] leading-relaxed text-stone-700"
                    >
                      <span
                        className="font-mono text-[12px] font-semibold uppercase tracking-wider text-red-800"
                        style={{ minWidth: "3.25rem" }}
                      >
                        {row.time}
                      </span>
                      <span>{row.body}</span>
                    </li>
                  ))}
                </ul>
              </div>

              {/* With */}
              <div className="overflow-hidden rounded-xl border border-emerald-200 bg-white shadow-[0_1px_2px_rgba(0,0,0,0.02)]">
                <div className="flex items-center gap-2 border-b border-emerald-200 bg-emerald-50 px-5 py-3">
                  <span
                    aria-hidden
                    className="h-1.5 w-1.5 rounded-full bg-emerald-700"
                  />
                  <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-emerald-800">
                    With Vigil
                  </span>
                </div>
                <ul className="divide-y divide-stone-100 px-5 py-2 sm:px-6">
                  {withVigil.map((row, i) => (
                    <li
                      key={`${row.time}-${i}`}
                      className="flex gap-4 py-3 text-[14.5px] leading-relaxed text-stone-700"
                    >
                      <span
                        className="font-mono text-[12px] font-semibold uppercase tracking-wider text-emerald-800"
                        style={{ minWidth: "3.25rem" }}
                      >
                        {row.time}
                      </span>
                      <span>{row.body}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>

            <p className="mt-8 text-[15px] italic text-stone-500">
              Not glamorous. Deeply useful.
            </p>
          </div>
        </section>

        {/* POSITIONING ROW */}
        <section id="positioning" className="border-b border-stone-200/70">
          <div className="mx-auto w-full max-w-[1100px] px-6 py-20 sm:py-24">
            <div className="mb-8 max-w-2xl">
              <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[color:var(--accent)]">
                Where Vigil fits
              </span>
              <h2 className="mt-3 text-[28px] font-bold leading-tight tracking-tight sm:text-[34px]">
                We sit below the stack you already have.
              </h2>
            </div>

            <ul className="grid gap-3 sm:grid-cols-2">
              {notList.map((line) => (
                <li
                  key={line}
                  className="rounded-lg border border-stone-200 bg-white px-5 py-4 text-[15.5px] leading-snug text-stone-800"
                >
                  {line}
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* EMAIL CAPTURE */}
        <section id="early-access" className="border-b border-stone-200/70 bg-stone-50/60">
          <div className="mx-auto w-full max-w-[1100px] px-6 py-20 sm:py-24">
            <div className="grid gap-10 lg:grid-cols-[1.1fr_1fr] lg:items-center">
              <div className="max-w-xl">
                <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[color:var(--accent)]">
                  Early access
                </span>
                <h2 className="mt-3 text-[28px] font-bold leading-tight tracking-tight sm:text-[34px]">
                  Get the binary. Run it next to your database.
                </h2>
                <p className="mt-4 text-[16px] leading-relaxed text-stone-600">
                  Vigil ships as a single Go binary. Drop it between an agent
                  and your data store, point it at a config file, watch the
                  audit trail land. Free for individuals; paid tiers when you
                  need team policy + cloud retention.
                </p>
              </div>
              <div className="rounded-xl border border-stone-200 bg-white p-6 shadow-[0_1px_2px_rgba(0,0,0,0.02)] sm:p-7">
                <p className="mb-4 text-[14px] font-medium text-stone-700">
                  Drop your work email. We&rsquo;ll send the binary and a
                  walkthrough.
                </p>
                <EarlyAccessForm id="ea-email-bottom" />
                <p className="mt-4 text-[12px] text-stone-500">
                  No spam. Unsubscribe in one click.
                </p>
              </div>
            </div>
          </div>
        </section>
      </main>

      {/* FOOTER */}
      <footer className="bg-white">
        <div className="mx-auto flex w-full max-w-[1100px] flex-col items-start justify-between gap-3 px-6 py-10 text-[13px] text-stone-500 sm:flex-row sm:items-center">
          <div>
            <span className="font-medium text-stone-700">bevigil.ai</span>
            <span className="mx-2 text-stone-300">·</span>
            <span>Vigil is open source</span>
            <span className="mx-2 text-stone-300">·</span>
            <span>MIT licensed</span>
            <span className="mx-2 text-stone-300">·</span>
            <span>Made by Costa</span>
          </div>
          <a
            href="#"
            aria-label="Vigil on GitHub"
            className="inline-flex items-center gap-1.5 text-stone-600 transition-colors hover:text-stone-900"
          >
            <GithubGlyph />
            <span>GitHub</span>
          </a>
        </div>
      </footer>
    </div>
  )
}

function GithubGlyph() {
  return (
    <svg
      aria-hidden
      viewBox="0 0 16 16"
      width="16"
      height="16"
      fill="currentColor"
      className="shrink-0"
    >
      <path d="M8 .2a8 8 0 0 0-2.5 15.6c.4.07.55-.17.55-.38v-1.34c-2.22.48-2.69-1.07-2.69-1.07-.36-.92-.89-1.17-.89-1.17-.73-.5.06-.49.06-.49.8.06 1.23.83 1.23.83.72 1.23 1.88.87 2.34.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.83-2.15-.08-.2-.36-1.02.08-2.13 0 0 .67-.21 2.2.82a7.6 7.6 0 0 1 4 0c1.53-1.03 2.2-.82 2.2-.82.44 1.11.16 1.93.08 2.13.51.56.83 1.28.83 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48v2.19c0 .21.15.46.55.38A8 8 0 0 0 8 .2Z" />
    </svg>
  )
}
