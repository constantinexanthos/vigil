import { EarlyAccessForm } from "./early-access-form"
import { SiteHeader } from "./site-header"
import { SiteFooter } from "./site-footer"
import { Section } from "./section"
import { beliefs, REPO_URL } from "./content"
import { GithubGlyph } from "./icons"

const SERIF =
  "var(--font-serif), 'Newsreader', ui-serif, Georgia, Cambria, 'Times New Roman', serif"
const SANS =
  "var(--font-inter), -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Inter', 'Helvetica Neue', Arial, sans-serif"
const MONO = "var(--font-mono), ui-monospace, SFMono-Regular, Menlo, monospace"

export function AboutView() {
  return (
    <div
      className="relative min-h-screen bg-white text-stone-900"
      style={{ fontFamily: SANS }}
    >
      <SiteHeader pathname="/about" />

      <main>
        {/* HERO */}
        <section className="relative">
          <div className="mx-auto w-full max-w-[860px] px-6 pt-24 pb-32 sm:pt-32 sm:pb-40">
            <span
              className="mb-9 inline-flex items-center text-[11px] uppercase tracking-[0.18em] text-stone-500"
              style={{ fontFamily: MONO }}
            >
              About
            </span>

            <h1
              className="max-w-[20ch] text-[42px] font-normal leading-[1.04] tracking-[-0.02em] text-stone-900 sm:text-[58px]"
              style={{ fontFamily: SERIF }}
            >
              Built by Costa Xanthos in{" "}
              <span className="italic text-stone-700">2026.</span>
            </h1>

            <p className="mt-7 max-w-[60ch] text-[18px] leading-[1.6] text-stone-600">
              One person, one repo, one bet: the data plane between agents and
              the systems they touch is the part of the agent infrastructure
              stack that nobody owns yet.
            </p>
          </div>
        </section>

        {/* WHY VIGIL */}
        <Section eyebrow="Why Vigil" maxWidth={860}>
          <h2
            className="text-[32px] font-normal leading-[1.15] tracking-[-0.02em] text-stone-900 sm:text-[40px]"
            style={{ fontFamily: SERIF }}
          >
            A trillion users walk into a database.
          </h2>
          <div className="mt-8 max-w-[68ch] space-y-5 text-[17px] leading-[1.7] text-stone-700">
            <p>
              AI agents are about to be the dominant traffic shape on the
              internet. Today&rsquo;s control plane &mdash; rate limiters keyed
              by IP, identity providers built around one-human-one-token,
              observability tools that only describe what happened &mdash; was
              built for a world where requests originate from people clicking
              buttons.
            </p>
            <p>
              Agents fan out. One goal becomes thousands of sub-requests. They
              share keys, repeat themselves, and casually take down their own
              databases. Your infrastructure interprets this as a DDoS attack
              and either crashes or rate-limits everything indiscriminately.
            </p>
            <p>
              Vigil is the agent-aware data plane. It sits between the agents
              and the systems they touch and shapes traffic the way agent
              traffic actually behaves. Per-agent identity. Smart rate limiting
              that knows which agent is which. Fan-out coalescing for the
              redundant queries. Blast-radius policies enforced at the proxy,
              not in the agent&rsquo;s prompt where it can be jailbroken out
              of. Signed audit trail for everything that flows through.
            </p>
            <p>
              The bet is structural: foundation labs can&rsquo;t build this.
              They live in the LLM call path, between you and the language
              model. Vigil lives in the application call path, in your VPC, in
              front of your Postgres. That&rsquo;s the part of the stack the
              labs can&rsquo;t see.
            </p>
          </div>
        </Section>

        {/* BELIEFS */}
        <Section eyebrow="What we believe" maxWidth={860}>
          <h2
            className="text-[32px] font-normal leading-[1.15] tracking-[-0.02em] text-stone-900 sm:text-[40px]"
            style={{ fontFamily: SERIF }}
          >
            Five things we&rsquo;re betting on.
          </h2>

          <ol className="mt-12 space-y-1">
            {beliefs.map((b, i) => (
              <li
                key={b}
                className="flex gap-6 border-t border-stone-200 py-6 last:border-b last:border-stone-200"
              >
                <span
                  className="mt-1 inline-flex w-8 shrink-0 text-[12.5px] font-semibold text-cyan-700"
                  style={{ fontFamily: MONO }}
                >
                  {String(i + 1).padStart(2, "0")}
                </span>
                <p className="text-[17px] leading-[1.6] text-stone-800">{b}</p>
              </li>
            ))}
          </ol>
        </Section>

        {/* CTA / EARLY ACCESS */}
        <Section eyebrow="Stay close" maxWidth={860}>
          <div className="grid gap-10 lg:grid-cols-[1.1fr_1fr] lg:items-center">
            <div className="max-w-[560px]">
              <h2
                className="text-[28px] font-normal leading-[1.15] tracking-[-0.02em] text-stone-900 sm:text-[36px]"
                style={{ fontFamily: SERIF }}
              >
                Join the waitlist.
              </h2>
              <p className="mt-4 text-[16.5px] leading-relaxed text-stone-600">
                Vigil is open source and under active development. The proxy
                source is on GitHub today; the waitlist gets the first
                tagged release, the hosted control plane, and the on-call
                playbook.
              </p>
              <a
                href={REPO_URL}
                target="_blank"
                rel="noreferrer noopener"
                className="mt-6 inline-flex items-center gap-1.5 rounded-md border border-stone-200 px-4 py-2 text-[13.5px] font-medium tracking-tight text-stone-700 transition hover:border-cyan-700/40 hover:text-cyan-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-700/40"
              >
                <GithubGlyph />
                <span>github.com/constantinexanthos/vigil</span>
              </a>
            </div>
            <div className="rounded-md border border-stone-200 bg-stone-50 p-7 sm:p-8">
              <p className="mb-5 text-[14px] font-medium text-stone-700">
                Drop your work email.
              </p>
              <EarlyAccessForm id="ea-email-about" />
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
  )
}

