import { EarlyAccessForm } from "./early-access-form"
import { ArchitectureDiagram } from "./architecture-diagram"
import { BlastRadiusDiagram } from "./blast-radius-diagram"
import { LayeredStackDiagram } from "./layered-stack-diagram"
import { PrimitiveIcon, GithubGlyph } from "./icons"
import { SiteHeader } from "./site-header"
import { SiteFooter } from "./site-footer"
import { Section } from "./section"
import { RainingBackground } from "@/components/raining-background"
import {
  primitives,
  trafficMismatch,
  withoutVigil,
  withVigil,
  REPO_URL,
} from "./content"

const SERIF =
  "var(--font-serif), 'Newsreader', ui-serif, Georgia, Cambria, 'Times New Roman', serif"
const SANS =
  "var(--font-inter), -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Inter', 'Helvetica Neue', Arial, sans-serif"
const MONO = "var(--font-mono), ui-monospace, SFMono-Regular, Menlo, monospace"

// Default human-readable home (light theme, RainingBackground watermark
// scoped to hero only via clip).
export function HomeView() {
  return (
    <div
      className="relative min-h-screen overflow-x-hidden bg-white text-stone-900"
      style={{ fontFamily: SANS }}
    >
      {/* RainingBackground sits behind the hero only. The clip-path ensures
          the watermark stops at the hero edge so the rest of the page is
          quiet. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 z-0 h-[760px] overflow-hidden"
      >
        <RainingBackground variant="subtle" />
        {/* Soft fade so chars don't sit hard against the section transition. */}
        <div
          className="pointer-events-none absolute inset-x-0 bottom-0 h-40"
          style={{
            background:
              "linear-gradient(to bottom, rgba(255,255,255,0) 0%, #ffffff 100%)",
          }}
        />
      </div>

      <div className="relative z-10">
        <SiteHeader pathname="/" />

        <main>
          {/* HERO */}
          <section className="relative">
            <div className="mx-auto w-full max-w-[1180px] px-6 pt-20 pb-32 sm:pt-28 sm:pb-40">
              <div className="grid gap-16 lg:grid-cols-[1.05fr_0.95fr] lg:items-center">
                <div>
                  <span
                    className="mb-9 inline-flex items-center text-[11px] uppercase tracking-[0.18em] text-stone-500"
                    style={{ fontFamily: MONO }}
                  >
                    Open source · Single binary · Free for individuals
                  </span>

                  <h1
                    className="max-w-[18ch] text-[42px] font-normal leading-[1.04] tracking-[-0.02em] text-stone-900 sm:text-[58px] md:text-[64px]"
                    style={{ fontFamily: SERIF }}
                  >
                    The seatbelt for your{" "}
                    <span className="italic text-stone-700">agent fleet.</span>
                  </h1>

                  <p className="mt-7 max-w-[560px] text-[17px] leading-[1.55] text-stone-600 sm:text-[18px]">
                    Vigil is the agent-aware data plane that sits between your
                    AI agents and your databases, APIs, and services. Per-agent
                    identity, smart rate limiting, fan-out coalescing,
                    blast-radius control. Open source. Single binary. Free for
                    individuals.
                  </p>

                  <div className="mt-10 flex flex-col gap-7 sm:max-w-md">
                    <EarlyAccessForm />
                    <a
                      href={REPO_URL}
                      target="_blank"
                      rel="noreferrer noopener"
                      className="text-[13.5px] font-medium tracking-tight text-stone-600 underline-offset-4 transition hover:text-cyan-700 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-700/40 rounded-sm"
                    >
                      <span className="inline-flex items-center gap-1.5">
                        <GithubGlyph />
                        View on GitHub
                        <span aria-hidden>&rarr;</span>
                      </span>
                    </a>
                  </div>
                </div>

                <div className="hidden lg:block">
                  <ArchitectureDiagram />
                </div>
              </div>
              {/* Mobile: diagram below hero copy */}
              <div className="mt-14 lg:hidden">
                <ArchitectureDiagram />
              </div>
            </div>
          </section>

          {/* THE PROBLEM */}
          <Section eyebrow="The problem">
            <h2
              className="max-w-[18ch] text-[32px] font-normal leading-[1.1] tracking-[-0.02em] text-stone-900 sm:text-[44px]"
              style={{ fontFamily: SERIF }}
            >
              Today&rsquo;s infrastructure was built for humans. Agents look
              like a <span className="italic">DDoS</span>.
            </h2>
            <p className="mt-5 max-w-[580px] text-[16.5px] leading-relaxed text-stone-600">
              Postgres, Redis, Cloudflare rate limiters, AWS API Gateway were
              tuned for human-shaped traffic. Agents shift the shape from one
              user, one request to one goal, thousands of sub-requests, many of
              them redundant.
            </p>

            <div className="mt-10 grid gap-px overflow-hidden rounded-md border border-stone-200 bg-stone-200 sm:grid-cols-2">
              <div className="bg-white p-7 sm:p-8">
                <div
                  className="mb-5 text-[10.5px] uppercase tracking-[0.2em] text-stone-500"
                  style={{ fontFamily: MONO }}
                >
                  Humans
                </div>
                <ul className="space-y-4 text-[15px] leading-relaxed text-stone-600">
                  {trafficMismatch.map((row) => (
                    <li
                      key={row.humans}
                      className="flex gap-3 border-b border-stone-100 pb-4 last:border-b-0 last:pb-0"
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
              <div className="bg-white p-7 sm:p-8">
                <div
                  className="mb-5 text-[10.5px] uppercase tracking-[0.2em] text-cyan-700"
                  style={{ fontFamily: MONO }}
                >
                  Agents
                </div>
                <ul className="space-y-4 text-[15px] leading-relaxed text-stone-900">
                  {trafficMismatch.map((row) => (
                    <li
                      key={row.agents}
                      className="flex gap-3 border-b border-stone-100 pb-4 last:border-b-0 last:pb-0"
                    >
                      <span
                        aria-hidden
                        className="mt-2 h-1 w-1 shrink-0 rounded-full bg-cyan-700"
                      />
                      <span>{row.agents}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </Section>

          {/* WHAT IT DOES */}
          <Section eyebrow="What it does">
            <h2
              className="max-w-[18ch] text-[32px] font-normal leading-[1.1] tracking-[-0.02em] text-stone-900 sm:text-[44px]"
              style={{ fontFamily: SERIF }}
            >
              Five primitives, one binary in your{" "}
              <span className="italic">data path.</span>
            </h2>

            {/*
              Five-card grid resolution: stack 1-col mobile, 2-col tablet
              (last item spans full width to fill the row), 5-col desktop.
              No empty cells at any breakpoint.
            */}
            <ol className="mt-12 grid gap-px overflow-hidden rounded-md border border-stone-200 bg-stone-200 grid-cols-1 sm:grid-cols-2 md:grid-cols-5">
              {primitives.map((p, i) => (
                <li
                  key={p.title}
                  className={`flex flex-col gap-4 bg-white p-6 sm:p-7 ${
                    // On 2-col tablet, the 5th card spans both columns so the
                    // grid stays full. md+ goes flat to 5-col so this is moot.
                    i === 4 ? "sm:col-span-2 md:col-span-1" : ""
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <span
                      className="inline-flex h-9 w-9 items-center justify-center rounded-md bg-cyan-50 text-cyan-700"
                      aria-hidden
                    >
                      <PrimitiveIcon iconKey={p.iconKey} size={20} />
                    </span>
                    <span
                      className="text-[12px] font-medium tracking-[0.12em] text-stone-400"
                      style={{ fontFamily: MONO }}
                    >
                      {String(i + 1).padStart(2, "0")}
                    </span>
                  </div>
                  <h3
                    className="text-[17px] font-semibold leading-tight tracking-tight text-stone-900"
                    style={{ fontFamily: SANS }}
                  >
                    {p.title}
                  </h3>
                  <p className="text-[14px] leading-[1.65] text-stone-600">
                    {p.body}
                  </p>
                </li>
              ))}
            </ol>
          </Section>

          {/* BLAST RADIUS — second hero-sibling visual, sits between
              the WHAT IT DOES primitives and the Without/With scenario.
              Reinforces a different concept than the hero diagram:
              scoped permissions per agent, not the request data path. */}
          <Section eyebrow="Blast radius">
            <h2
              className="max-w-[20ch] text-[32px] font-normal leading-[1.1] tracking-[-0.02em] text-stone-900 sm:text-[44px]"
              style={{ fontFamily: SERIF }}
            >
              Each agent runs inside a{" "}
              <span className="italic">scope it can&rsquo;t escape.</span>
            </h2>
            <p className="mt-5 max-w-[60ch] text-[16.5px] leading-relaxed text-stone-600">
              Permissions are enforced at the proxy, not in the agent&rsquo;s
              prompt. An agent can issue any query it wants &mdash; Vigil
              decides whether the query reaches the data store.
            </p>
            <div className="mt-12">
              <BlastRadiusDiagram />
            </div>
          </Section>

          {/* SCENARIO */}
          <Section eyebrow="A concrete scenario">
            <h2
              className="text-[32px] font-normal leading-[1.1] tracking-[-0.02em] text-stone-900 sm:text-[44px]"
              style={{ fontFamily: SERIF }}
            >
              10-person startup. Postgres, Redis, five coding agents.
            </h2>
            <p className="mt-5 text-[16.5px] leading-relaxed text-stone-600">
              Same Tuesday morning, told two ways.
            </p>

            <div className="mt-10 grid gap-6 lg:grid-cols-2">
              <ScenarioCard
                tone="bad"
                label="Without Vigil"
                rows={withoutVigil}
              />
              <ScenarioCard tone="good" label="With Vigil" rows={withVigil} />
            </div>

            <p
              className="mt-10 text-[15px] italic text-stone-500"
              style={{ fontFamily: SERIF }}
            >
              Not glamorous. Deeply useful.
            </p>
          </Section>

          {/* POSITIONING — replaces the previous "what we are NOT" text
              list. Names categories, not companies. The visual makes the
              "we sit in the request path, they sit adjacent to it" claim
              self-evident; the prose underneath is just the caption. */}
          <Section eyebrow="Where we sit">
            <h2
              className="max-w-[20ch] text-[32px] font-normal leading-[1.1] tracking-[-0.02em] text-stone-900 sm:text-[44px]"
              style={{ fontFamily: SERIF }}
            >
              In the request path, not{" "}
              <span className="italic">adjacent to it.</span>
            </h2>
            <p className="mt-5 max-w-[60ch] text-[16.5px] leading-relaxed text-stone-600">
              Orchestration, observability, and identity tools watch agents
              from the side. Vigil is in the line between every agent
              request and the system that answers it.
            </p>
            <div className="mt-12">
              <LayeredStackDiagram />
            </div>
          </Section>

          {/* EARLY ACCESS */}
          <Section eyebrow="Early access" id="early-access">
            <div className="grid gap-12 lg:grid-cols-[1.1fr_1fr] lg:items-center">
              <div className="max-w-[560px]">
                <h2
                  className="text-[32px] font-normal leading-[1.1] tracking-[-0.02em] text-stone-900 sm:text-[44px]"
                  style={{ fontFamily: SERIF }}
                >
                  First in line when v1{" "}
                  <span className="italic">ships.</span>
                </h2>
                <p className="mt-5 text-[16.5px] leading-relaxed text-stone-600">
                  Vigil will ship as a single Go binary you drop between an
                  agent and your data store. We&rsquo;re building toward a v1
                  release that bundles identity, rate limiting, fan-out
                  coalescing, blast-radius control, and a signed audit trail.
                  Free for individuals; paid tiers when you need team policy
                  + cloud retention.
                </p>
              </div>
              <div className="rounded-md border border-stone-200 bg-stone-50 p-7 sm:p-8">
                <p className="mb-5 text-[14px] font-medium text-stone-700">
                  Drop your work email. We&rsquo;ll let you know the moment
                  the proxy is ready &mdash; plus the on-call playbook.
                </p>
                <EarlyAccessForm id="ea-email-bottom" />
                <p
                  className="mt-5 text-[11.5px] uppercase tracking-[0.18em] text-stone-400"
                  style={{ fontFamily: MONO }}
                >
                  No spam. Unsubscribe in one click.
                </p>
              </div>
            </div>
          </Section>
        </main>

        <SiteFooter />
      </div>
    </div>
  )
}

function ScenarioCard({
  tone,
  label,
  rows,
}: {
  tone: "bad" | "good"
  label: string
  rows: { time: string; body: string }[]
}) {
  const dot = tone === "bad" ? "#dc2626" : "#16a34a"
  const headerBg = tone === "bad" ? "#fef2f2" : "#f0fdf4"
  const headerColor = tone === "bad" ? "#991b1b" : "#14532d"
  const headerBorder = tone === "bad" ? "#fecaca" : "#bbf7d0"
  return (
    <div className="overflow-hidden rounded-md border border-stone-200 bg-white">
      <div
        className="border-b px-6 py-3"
        style={{ background: headerBg, borderColor: headerBorder }}
      >
        <div className="flex items-center gap-2">
          <span
            aria-hidden
            className="h-1.5 w-1.5 rounded-full"
            style={{ background: dot }}
          />
          <span
            className="text-[10.5px] uppercase tracking-[0.2em] font-semibold"
            style={{
              fontFamily: MONO,
              color: headerColor,
            }}
          >
            {label}
          </span>
        </div>
      </div>
      <ul className="divide-y divide-stone-100 px-6 py-2">
        {rows.map((row, i) => (
          <li
            key={`${row.time}-${i}`}
            className="flex gap-5 py-4 text-[14.5px] leading-relaxed text-stone-700"
          >
            <span
              className="text-[12px] font-medium tracking-wider text-stone-400"
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
  )
}
