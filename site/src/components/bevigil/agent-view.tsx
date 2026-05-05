import Link from "next/link"
import {
  primitives,
  withoutVigil,
  withVigil,
  trafficMismatch,
  notList,
  beliefs,
  quickstart,
  REPO_URL,
  PROXY_URL,
  VERSION,
} from "./content"
import { SiteHeader } from "./site-header"

const MONO = "var(--font-mono), ui-monospace, SFMono-Regular, Menlo, monospace"

// Plain README-in-terminal rendering for ?view=agent.
// The persistent SiteHeader (logo + nav + view toggle + version) renders
// above this view so users always have a way home; below the header sits
// a slim terminal "file path" strip and then the prose body.
// Section headings as `#`/`##`/`###`, inline link refs, monospace.
// Server component — works without client JS once mounted.

interface AgentViewProps {
  page: "home" | "about" | "docs"
}

export function AgentView({ page }: AgentViewProps) {
  // Map agent-view page key onto SiteHeader's pathname prop so the nav
  // ribbon highlights the active route consistently with the human view.
  const pathname = page === "home" ? "/" : page === "about" ? "/about" : "/docs"
  return (
    <div
      className="min-h-screen bg-white text-stone-900"
      style={{ fontFamily: MONO }}
    >
      <SiteHeader pathname={pathname} view="agent" />
      <TerminalPathStrip page={page} />
      <main className="mx-auto w-full max-w-[760px] px-6 py-10 text-[14px] leading-[1.7]">
        {page === "home" ? <HomeProse /> : null}
        {page === "about" ? <AboutProse /> : null}
        {page === "docs" ? <DocsProse /> : null}
      </main>
    </div>
  )
}

// Slim secondary strip — preserves the "README in terminal" framing
// (a file path you're "viewing") under the persistent top nav.
// The redundant in-prose nav row is intentionally retained per design
// review (useful as inline reference inside the README itself).
function TerminalPathStrip({ page }: { page: AgentViewProps["page"] }) {
  return (
    <div className="border-b border-stone-200 bg-stone-50">
      <div className="mx-auto flex w-full max-w-[760px] items-center justify-between gap-4 px-6 py-2 text-[12px]">
        <span className="text-stone-500">
          ~/bevigil/{page === "home" ? "README.md" : `${page}.md`}
        </span>
        <div className="flex items-center gap-3 text-[11px]">
          <NavLink href="/" label="home" page={page} target="home" />
          <span aria-hidden className="text-stone-300">·</span>
          <NavLink href="/about" label="about" page={page} target="about" />
          <span aria-hidden className="text-stone-300">·</span>
          <NavLink href="/docs" label="docs" page={page} target="docs" />
        </div>
      </div>
    </div>
  )
}

function NavLink({
  href,
  label,
  page,
  target,
}: {
  href: string
  label: string
  page: AgentViewProps["page"]
  target: AgentViewProps["page"]
}) {
  // Preserve ?view=agent on internal nav.
  const url = `${href}?view=agent`
  const active = page === target
  return (
    <Link
      href={url}
      className={`${active ? "text-stone-900" : "text-stone-500"} hover:text-cyan-700`}
    >
      {label}
    </Link>
  )
}

function H1({ children }: { children: React.ReactNode }) {
  return (
    <h1 className="mb-4 mt-2 text-[20px] font-semibold leading-tight text-stone-900">
      <span className="text-cyan-700"># </span>
      {children}
    </h1>
  )
}
function H2({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="mb-3 mt-10 text-[16px] font-semibold leading-tight text-stone-900">
      <span className="text-cyan-700">## </span>
      {children}
    </h2>
  )
}
function H3({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="mb-2 mt-6 text-[14px] font-semibold text-stone-900">
      <span className="text-cyan-700">### </span>
      {children}
    </h3>
  )
}
function P({ children }: { children: React.ReactNode }) {
  return <p className="mb-4 text-stone-700">{children}</p>
}
function Hr() {
  return <hr className="my-8 border-stone-200" />
}
function CodeBlock({ children }: { children: React.ReactNode }) {
  return (
    <pre className="my-4 overflow-x-auto rounded border border-stone-200 bg-stone-50 p-4 text-[13px] leading-relaxed text-stone-800">
      <code>{children}</code>
    </pre>
  )
}

function HomeProse() {
  return (
    <>
      <H1>Vigil — agent-aware data plane</H1>
      <P>
        Vigil is the agent-aware data plane that sits between AI agents and the
        systems they touch (databases, APIs, services). It speaks both
        languages: it knows what agents are trying to do, and it speaks SQL,
        HTTP, and gRPC to the backend.
      </P>
      <P>
        Open source. Single binary. Free for individuals. Version {VERSION}.
        Source: <code>{REPO_URL}</code>
      </P>

      <Hr />

      <H2>The problem</H2>
      <P>
        Today&apos;s infrastructure (Postgres, Redis, Cloudflare rate limiters,
        AWS API Gateway) was tuned for human-shaped traffic. Agents shift the
        traffic shape from <em>1 user → 1 request → 1 response</em> to{" "}
        <em>1 agent goal → 5,000 sub-requests → many of them redundant</em>.
        Legacy infrastructure interprets agent traffic as a DDoS attack.
      </P>

      <H3>Humans vs. agents</H3>
      <ul className="mb-4 list-none pl-0">
        {trafficMismatch.map((row, i) => (
          <li key={i} className="mb-2 text-stone-700">
            - human: {row.humans}
            <br />
            <span className="ml-2">+ agent: {row.agents}</span>
          </li>
        ))}
      </ul>

      <Hr />

      <H2>What it does</H2>
      <ol className="mb-4 list-decimal pl-6 text-stone-700 marker:text-cyan-700">
        {primitives.map((p) => (
          <li key={p.title} className="mb-3">
            <strong className="text-stone-900">{p.title}.</strong>{" "}
            <span>{p.body}</span>
          </li>
        ))}
      </ol>

      <Hr />

      <H2>Scenario: 10-person startup, 5 coding agents</H2>

      <H3>Without Vigil</H3>
      <ul className="mb-4 list-none pl-0 text-stone-700">
        {withoutVigil.map((row, i) => (
          <li key={i} className="mb-1.5">
            <span className="text-stone-500">[{row.time}]</span> {row.body}
          </li>
        ))}
      </ul>

      <H3>With Vigil</H3>
      <ul className="mb-4 list-none pl-0 text-stone-700">
        {withVigil.map((row, i) => (
          <li key={i} className="mb-1.5">
            <span className="text-stone-500">[{row.time}]</span> {row.body}
          </li>
        ))}
      </ul>

      <P>Not glamorous. Deeply useful.</P>

      <Hr />

      <H2>Where Vigil fits</H2>
      <ul className="mb-4 list-disc pl-6 text-stone-700 marker:text-cyan-700">
        {notList.map((line) => (
          <li key={line} className="mb-2">
            {line}
          </li>
        ))}
      </ul>

      <Hr />

      <H2>Get the binary</H2>
      <P>
        Vigil ships as a single Go binary. Drop it between an agent and your
        data store, point it at a config file, watch the audit trail land. Free
        for individuals; paid tiers when you need team policy and cloud
        retention.
      </P>
      <P>
        Source: <code>{REPO_URL}</code>
        <br />
        Proxy quickstart: <code>{PROXY_URL}</code>
      </P>
    </>
  )
}

function AboutProse() {
  return (
    <>
      <H1>About Vigil</H1>
      <P>
        Vigil is built by Costa Xanthos, started 2026. Founder-led; no team-size
        embellishments.
      </P>

      <Hr />

      <H2>Why Vigil</H2>
      <P>
        AI agents are about to be the dominant traffic shape on the internet.
        Today&apos;s control plane — rate limiters keyed by IP, identity
        providers built around one-human-one-token, observability tools that
        only describe what happened — was built for a world where requests
        originate from people clicking buttons.
      </P>
      <P>
        Agents fan out. One goal becomes thousands of sub-requests. They share
        keys, repeat themselves, and casually take down their own databases.
        The infrastructure interprets this as an attack and either crashes or
        rate-limits everything indiscriminately.
      </P>
      <P>
        Vigil is the agent-aware data plane. It sits between the agents and the
        systems they touch and shapes traffic the way agent traffic actually
        behaves. Per-agent identity. Smart rate limiting that understands which
        agent is which. Fan-out coalescing for the redundant queries. Blast-
        radius policies enforced at the proxy, not in the agent&apos;s prompt.
        Signed audit trail for everything that flows through.
      </P>
      <P>
        The bet is structural: foundation labs can&apos;t build this — they
        live in the LLM call path, not in the application call path. Vigil sits
        in your VPC, in front of your Postgres, in the part of the stack the
        labs can&apos;t see.
      </P>

      <Hr />

      <H2>What we believe</H2>
      <ul className="mb-4 list-disc pl-6 text-stone-700 marker:text-cyan-700">
        {beliefs.map((b) => (
          <li key={b} className="mb-2">
            {b}
          </li>
        ))}
      </ul>

      <Hr />

      <H2>Get involved</H2>
      <P>
        Source: <code>{REPO_URL}</code>
        <br />
        Proxy: <code>{PROXY_URL}</code>
      </P>
    </>
  )
}

function DocsProse() {
  return (
    <>
      <H1>Get started with Vigil</H1>
      <P>
        Vigil ships as a single Go binary. The quickstart below mints an agent
        identity through the proxy&apos;s HTTP API. State persists under{" "}
        <code>~/.vigil/</code>.
      </P>

      <Hr />

      <H2>Quickstart</H2>
      {quickstart.map((s) => (
        <div key={s.step}>
          <H3>{s.step}</H3>
          <P>{s.description}</P>
          <CodeBlock>{s.command}</CodeBlock>
        </div>
      ))}

      <Hr />

      <H2>More</H2>
      <P>
        Full docs coming soon. For now the code is the source of truth:
        <br />
        <code>{REPO_URL}</code>
      </P>
    </>
  )
}
