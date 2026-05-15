# Vigil Product Direction

**Date:** 2026-05-15
**Status:** Approved (strategic frame, not a build spec)
**Owner:** Costa
**Related:**
- `docs/superpowers/specs/2026-05-04-vigil-data-plane-design.md` — canonical product spec (technical)
- `docs/superpowers/specs/2026-05-07-mcp-server-design.md` — MCP server design (Layer 2 of this doc)

---

## Strategic frame

Vigil functions as a **launchpad** product. The 12-month outcome that matters is Costa being known in agent infrastructure — by users, by hiring managers, by future co-founders, by investors. Within that frame, when a real market exists for a feature, Vigil should be the **premier** choice on it. Premier doesn't mean expensive; it means "the developer encountering Vigil thinks this is the best product in the category."

OSS is the wedge. Paid monetization is an option that stays open but is not pre-committed: we don't add billing infra, multi-tenant SaaS overhead, or any structural commitment to a paid plane until adoption signal tells us which monetization shape (sponsorship vs cloud-control-plane vs support contracts) makes sense.

This frame implies what we DON'T build:
- No billing system, no paywall, no SaaS-only features
- No mobile app as a primary surface
- No chatbot UI ("ask Vigil questions in natural language")
- No enterprise feature gates

## What Vigil IS to the customer

Three layers, each with a primary surface and a different premier reference.

### Layer 1 — The substrate (`vigil-proxy` binary)

Always running. Sits in the data path between agents and Postgres / Redis / HTTP / gRPC services. Customer interacts with it once at install (`brew install vigil`, `vigil-proxy --postgres-listen :7432 --postgres-upstream localhost:5432`) and after that it's invisible. Like Tailscale's daemon. Like a firewall.

**Premier reference: Tailscale + sqlite.** Single binary, zero ceremony, you can read the source. The win is "I forgot it was even running, but my agents are protected."

**What "premier" means here:**
- Install in 30 seconds, one command
- 5MB single binary, no runtime dependencies
- The default config is correct for 90% of users
- Performance overhead small enough to be invisible (current: 70–90µs added p50 unconstrained)

### Layer 2 — The agent-facing surface (MCP server)

This is the most differentiated and underexplored surface. Lives **inside** Claude Code, Cursor, Codex via MCP. The user doesn't open it — their agent talks to it. Vigil becomes the substrate the agent itself consults to know what it can do and what it has done.

Examples of what this enables:
- User: "Drop the users table" → Cursor calls `vigil.policy.check` → sees agent isn't allowed to DELETE production → asks user before proceeding
- User: "What have you been doing all morning?" → Claude Code calls `vigil.activity.query` → reports its own audit log
- User: "Why is this slow?" → Cursor calls `vigil.activity.summary` → "300 of my queries today were deduped, 12 were rate-limited"

The agent becomes self-aware *through Vigil*. No competitor has this surface today. It is what makes Vigil viral inside the agent ecosystem rather than another tool the developer has to remember to check.

**Premier reference: Linear's shortcuts.** Invisible until invoked, then dense and decisive. No-one teaches you how to use it; the agent figures it out from the tool description.

**What "premier" means here:**
- Two-line install in `~/.claude/mcp.json` (or Cursor / Codex equivalent)
- Tool descriptions tight enough that the agent picks the right tool first try
- Zero-token-when-idle (the MCP server doesn't burn context unless invoked)
- The first time a developer asks their agent "what's my Vigil scope?" and gets a real answer, they tell someone

### Layer 3 — The operator-facing surface (desktop app, future web dashboard)

This is where the human goes when something happened. "Why did my Postgres bill drop?" → see the dedup graph. "Did the new agent we deployed try anything weird?" → see audit feed filtered by that agent. "What's our policy on production writes?" → see the policy view.

Today: the Tauri menu-bar app reading `~/.vigil/proxy.db`. Tomorrow: a hosted web dashboard for teams (deferred until adoption signal warrants it).

**Premier reference: Linear + Honeycomb.** Information density, taste, restraint. The dashboard isn't pretty for pretty's sake; it's the fastest way to find out what happened.

**What "premier" means here:**
- Open the app, see the most recent 30 minutes of agent activity in one screen
- Drill from a counter to its underlying audit rows in one click
- Every pixel earns its place; no marketing chrome
- Dark mode + light mode both feel intentional

## The marketing surface

The website (`bevigil.ai`), the GitHub README, the docs site, and the launch artifacts.

**Premier reference: Vercel.** Best-in-class developer experience on every page. Install snippet that you'd want to screenshot. Architecture diagram that explains the product in 10 seconds. Errors in the docs are filed as issues, not embarrassments.

## Three dimensions Vigil wins on (priority order)

1. **Install simplicity** — 30 seconds from `brew install` to your agent's first audited query
2. **Agent-native experience** — the only proxy your agent can introspect via MCP
3. **Operator visibility** — when something happened, you find out what in 10 seconds, not 10 minutes

If we win those three, no competitor can copy us in a quarter. The proxy code is replicable; the MCP integration is hard to retrofit; the dashboard taste takes years to build.

## What this means for sequencing

The next 6–12 weeks of work, ordered by leverage:

1. **Ship Layer 2 (MCP server).** The agent prompt is already written. This is the unique differentiator. Without it Vigil is "another proxy"; with it Vigil is "the only proxy your agent can talk to."
2. **Polish Layer 3 (dashboard).** Today the Tauri Proxy tab is functional but not Linear-tier. Density, restraint, taste pass.
3. **Polish Layer 1 (install + perf).** Homebrew formula. Strip the binary. Tune defaults so the bench shows clean numbers without rate-limit interference.
4. **Launch.** Show HN + tweet thread + waitlist email. Launch artifacts are already drafted (or being drafted by the launch agent).
5. **Listen + iterate for 2–4 weeks.** Real user behavior tells us what to build next.
6. **Decide the monetization fork** based on signal: cloud control plane (C), sponsorship (B), or stay pure OSS (A). Don't decide before signal.

## Things we explicitly defer

- Mobile app (notifications maybe, primary surface no)
- Chatbot / natural language interface
- Hosted control plane / billing / multi-tenant SaaS
- Enterprise features (SAML, audit log retention contracts, support SLAs)
- HTTP / Redis / gRPC proxies (after Postgres v0.1.0d is stable and we have signal that those targets matter to real users)
- Mac App Store / Windows / Linux desktop builds (Mac-only Tauri app is fine for now)

## How we know this is working

Leading indicators (week 1–4):
- GitHub stars trajectory (rate of adds in 7-day windows)
- npm/brew install counts
- Number of distinct external repos referencing `vigil-proxy` in their docs / config
- Mentions in Discord / Slack / Twitter that we didn't seed

Lagging indicators (month 2–6):
- Recurring contributors to the OSS repo
- Inbound recruiter / co-founder / investor messages naming Vigil
- "Production users" — people who admit they run it in front of real Postgres
- One feature request that 5+ unrelated users ask for in a month → that's the real product expansion vector

---

This document is the lens we evaluate every future push against. If a proposed feature doesn't move us toward Layer 1 / 2 / 3 premier or the three winning dimensions, defer it.
