// Shared content for the bevigil.ai v2 site.
// Used by both the human (marketing) and agent (plain-prose) views, so all
// copy lives in one place. Verbatim from vigil-candidate-a.html where noted.

export const VERSION = "v0.1.0"

// Single canonical accent for the v2 light theme.
export const ACCENT = "#0891b2"

export const REPO_URL = "https://github.com/constantinexanthos/vigil"
export const PROXY_URL = "https://github.com/constantinexanthos/vigil/tree/main/proxy"

// Five primitives — text lifted verbatim from vigil-candidate-a.html.
export const primitives: { title: string; body: string; iconKey: PrimitiveIconKey }[] = [
  {
    title: "Per-agent identity",
    body: "Every agent gets a stable ID issued by Vigil. The proxy attaches it to every request. Now the database, the logs, and the rate limiter can all distinguish “Claude doing the refactor” from “Cursor running tests” from “your production web traffic.”",
    iconKey: "identity",
  },
  {
    title: "Per-agent rate limiting",
    body: "Token-bucket throttling that knows which agent is which. The analytics agent gets 100 q/sec, the refactor agent gets 20 q/sec. They don’t starve each other and they don’t starve production.",
    iconKey: "rate-limit",
  },
  {
    title: "Fan-out coalescing",
    body: "When an agent fires the same query repeatedly (which they do constantly), Vigil deduplicates and serves cached results. The single biggest cost-saver: cuts agent infrastructure costs 40–80% in early benchmarks.",
    iconKey: "coalesce",
  },
  {
    title: "Blast-radius control (coming next)",
    body: "Coming in v0.1.0e. “Agent X cannot DELETE from production. Agent Y cannot touch the migrations folder. Agent Z requires human approval before touching auth.” Policies enforced at the proxy, not in the agent’s prompt where it can be jailbroken out of.",
    iconKey: "blast",
  },
  {
    title: "Audit trail",
    body: "Every action — what agent, what request, what response, was it cached, was it rate-limited, was it blocked by policy — is signed and logged. When something does go wrong, you can replay it. When auditors come, you have answers.",
    iconKey: "audit",
  },
]

export type PrimitiveIconKey =
  | "identity"
  | "rate-limit"
  | "coalesce"
  | "blast"
  | "audit"

// Without/With Vigil scenario — verbatim from vigil-candidate-a.html.
export const withoutVigil: { time: string; body: string }[] = [
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
    body: "Database load is the obvious culprit, but nobody knows which agent did what. They all share the same DB credentials.",
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

export const withVigil: { time: string; body: string }[] = [
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
export const trafficMismatch: { humans: string; agents: string }[] = [
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

// Positioning prose — used by the agent (plain-text) view.
// Deliberately names categories, never companies. The human view renders
// the same idea as a layered-stack diagram (see LayeredStackDiagram).
export const positioning = {
  paragraph:
    "Vigil sits in the request path between agents and your systems. Orchestration, observability, and identity tools sit adjacent to it — they spawn agents, watch what they did, and know who they are, but none of them sit in line on every request. Different layer, different job.",
  caption: "in the request path, not adjacent to it",
}

// Quickstart curl examples for the docs page, sourced from proxy/README.md.
export const quickstart: {
  step: string
  description: string
  command: string
  language: string
}[] = [
  {
    step: "Run the proxy",
    description:
      "Install the binary and start the proxy. Listens on :7432 for Postgres clients (configurable) and :7878 for the identity HTTP API. State persists under ~/.vigil/.",
    command:
      "brew install constantinexanthos/vigil/vigil\nvigil-proxy --postgres-listen :7432 --postgres-upstream localhost:5432",
    language: "bash",
  },
  {
    step: "Issue an identity",
    description:
      "Mint a stable ID for an agent. Vigil signs it with an Ed25519 key generated on first start.",
    command:
      "curl -X POST http://localhost:7878/identities \\\n  -H 'content-type: application/json' \\\n  -d '{\"agent_name\":\"claude-code\",\"principal\":\"costa@example.com\",\"scopes\":[\"read\",\"write\"]}'",
    language: "bash",
  },
  {
    step: "Fetch an identity",
    description:
      "Retrieve a previously issued identity by its UUID to verify scopes or replay an audit query.",
    command: "curl http://localhost:7878/identities/{id}",
    language: "bash",
  },
  {
    step: "List identities",
    description:
      "List every identity Vigil has issued. Useful for quick visibility into who's hitting your data path.",
    command: "curl http://localhost:7878/identities",
    language: "bash",
  },
]

// "What we believe" — short list for /about.
export const beliefs: string[] = [
  "Agents are not human users, and infrastructure built for humans will fail under their traffic shape.",
  "The control plane belongs in the data path, not in the agent’s prompt where it can be jailbroken out of.",
  "Per-agent identity is the load-bearing primitive. Everything else is downstream of it.",
  "Boring middleware compounds. Audit trails are stickier than dashboards.",
  "If something goes wrong at 3am, you should be able to replay exactly what an agent did. No exceptions.",
]
