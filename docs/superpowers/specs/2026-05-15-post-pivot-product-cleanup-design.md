# Post-Pivot Product Cleanup — Identity-First Architecture

**Date:** 2026-05-15
**Status:** Approved (strategic + executional, blocks the next push)
**Owner:** Costa
**Related:**
- `docs/superpowers/specs/2026-05-04-vigil-data-plane-design.md` — canonical product spec
- `docs/superpowers/specs/2026-05-15-product-direction-design.md` — three-layer model + premier-vibe targets

---

## The problem

Vigil pivoted on 2026-05-04 from "FS-watcher with LLM-summarized session view" to "agent-aware Postgres data-plane proxy." The proxy stack (v0.1.0a → v0.1.0d) ships clean. But the Tauri app and surrounding chrome still carry pre-pivot baggage:

- The app's onboarding gates ALL tabs behind LLM (Claude Code / Codex CLI / Anthropic API key) configuration — required by the OLD product, irrelevant to the new one
- The Sessions tab + FS-watcher daemon + LLM-summarization pipeline are vestigial
- Marketing copy still implies "watches files / writes plain-English summaries"

Worse, the architecture has a load-bearing gap: **identity attachment isn't reliable in practice.** Today identity flows ONLY when the agent (or harness) explicitly sets `application_name=vigil:<token>`. Most agents don't. Without identity, every per-agent feature (rate limit pools, fan-out coalescing, audit attribution, MCP introspection, future policy enforcement) degrades to anonymous treatment — Vigil collapses into "a Postgres proxy with logging," not "the agent-aware data plane."

## What the product actually is, post-cleanup

Vigil is the **agent-aware data plane** for AI agents talking to data systems. Identity is the primary key everything operates on:

- Per-agent rate limit pools key on identity
- Per-agent coalescing keys on identity (cache scoped to one agent's RLS context)
- Audit attribution keys on identity
- MCP introspection (`vigil.identity.whoami`) returns identity
- Future policy enforcement keys on identity

**Identity IS the product.** Without it Vigil drops to Cloudflare-tier value. With it, Vigil is the only system in the data path that knows which agent is at the other end and can shape traffic accordingly.

## The detection model — three tiers, in priority order

Identity gets attached via one of three paths, falling through in order:

### Tier 1 — proxy-side process introspection (universal, no user setup)

When a TCP connection comes in to `vigil-proxy` from localhost, the proxy looks at the source process and walks the parent chain:

- Source `python` whose ancestor includes `Cursor.app` → tagged as **Cursor agent**
- Source `node` whose ancestor includes `claude` (Claude Code CLI) → tagged as **Claude Code**
- Source whose ancestor includes `conductor` → tagged as **Conductor harness**, model unknown
- Source whose ancestor includes `cursor-agent` (specifically) → tagged as **Cursor with detected harness type**
- Source `psql` with no AI ancestor → tagged as **human**

This is the **default detection mechanism**. It works without ANY user opt-in for any agent that runs on the same machine as the proxy. Implementation uses `lsof`-style PID-to-process introspection (cross-platform via `gopsutil` library or platform-specific syscalls).

Tier-1 identity is **inferred**, not signed. It's good enough for grouping, rate-limit pool selection, audit attribution, observability — not good enough for enforcement (you can't enforce "Claude Code can't DROP" against an unsigned identity because Claude Code can lie about its process name).

### Tier 2 — explicit declaration via `application_name=vigil:<token>` (rich, signed)

For agents/harnesses that opt in, they set `application_name=vigil:<base64-token>` in their connection string. The proxy verifies the Ed25519 signature against the identity store and attaches the **signed identity** with full metadata (principal, scopes, model, expiration).

This is what enables:
- Cryptographic verification (audit rows tamper-evident, agents can't impersonate each other)
- Policy enforcement (v0.1.0e — "this signed identity has these explicit scopes")
- MCP `vigil.identity.whoami` returning rich data
- Per-principal rollups (which human is this agent acting for)

How it gets set:
- Users who run `vigil-run <command>` (the wrapper sets `VIGIL_TOKEN` env, agent's connection library reads it)
- Users who add one line to their Python/Node code: `conn_string += "&application_name=vigil:" + os.getenv("VIGIL_TOKEN")`
- Agents that natively understand Vigil (future: SDK + harness plugins)

When Tier-2 identity is present, it **overrides** Tier-1 inferred identity (declared > inferred).

### Tier 3 — anonymous fallback

Connections we can't introspect (remote network connections from cloud functions, containers without process tree visibility, weird permission setups) and that don't declare get the `unauth` rate-limit pool, audit with `agent_id=NULL`, no coalescing.

This is the floor — Vigil still does *something* useful (rate limit, audit), just without per-agent attribution.

## What ships in this push

Three sub-projects, ordered by urgency.

### Sub-project A — The Rip (small, blocking)

**Goal:** remove all pre-pivot baggage so the app matches the post-pivot product.

**Scope:**
- Delete `daemon/` directory (the Rust FS-watcher daemon). Stop building/shipping it.
- Remove the Sessions tab from the Tauri app.
- Remove the LLM-summarization onboarding gate from `Onboarding.tsx`. The Tauri app launches straight to the Overview/Proxy tabs.
- Remove all FS-watcher-derived data flows: `useProxyData` already reads from `~/.vigil/proxy.db`; the legacy daemon's `~/.vigil/db.db` (if any) and the LLM summarization Tauri commands get deleted.
- Update `proxy/README.md` and `README.md` (root): remove FS-watcher references; the install snippet stays.
- Update `bevigil.ai` site copy: remove any claim that implies file/git watching or plain-English summaries. The 5 primitives stay (identity, rate-limit, coalesce, blast-radius, audit) — those are accurate.
- Update Tauri app's onboarding (now scoped to "did you start the proxy" not "did you connect Claude Code") — single CTA: "Start vigil-proxy and your agents will appear here."
- Remove `Onboarding.tsx`'s API-key handling, keychain code, CLI detection. All gone.

**Files affected:**
- DELETE: `daemon/` (entire directory)
- DELETE: `app/src/components/Onboarding.tsx` (replace with simpler `EmptyStateOnboarding` already in `app/src/components/proxy/`)
- MODIFY: `app/src/App.tsx` (remove the gate logic, route directly to overview/proxy)
- MODIFY: `app/src/components/MiddlePane.tsx` (remove session-detail rendering)
- DELETE: `app/src/components/SessionHeader.tsx`, `SessionFooter.tsx`, `MilestoneFeed.tsx`, `SummaryBlock.tsx`, `ActivityStream.tsx`, `DiffViewer.tsx`, `ConfidenceDonut.tsx`, `PulseLine.tsx` (or keep if used elsewhere — verify)
- MODIFY: `app/src/components/TopBar.tsx` (remove "Session" tab, leave Overview + Proxy)
- DELETE: `app/src-tauri/src/sessions*` (any session-related Tauri commands)
- MODIFY: `app/src-tauri/Cargo.toml` (drop daemon-related deps)
- MODIFY: `proxy/README.md`, root `README.md`
- MODIFY: `site/src/components/bevigil/*` (copy audit pass)

**Acceptance:**
1. Tauri app launches to Overview tab (or Proxy tab) on first run, no onboarding gate
2. No "Connect a Claude" or "Sessions" UI exists
3. `daemon/` directory does not exist; `cargo build` from root works without it
4. README files have no FS-watcher claims
5. Site has no FS-watcher claims
6. Existing proxy tests still pass (daemon removal does not affect proxy)
7. Tauri app tests still pass for Overview + Proxy tab functionality

### Sub-project B — Process introspection in the proxy (universal detection)

**Goal:** the proxy automatically tags every localhost connection with inferred identity from process tree, so per-agent features work even when nothing opted in.

**Scope:**
- New package `proxy/internal/processdetect/` that exposes:
  ```go
  type DetectedIdentity struct {
      AgentName string  // "claude-code", "cursor-agent", "conductor:claude", "human"
      Source    string  // "process_tree" (vs "declared")
      ProcessChain []string  // ["python", "cursor-agent", "Cursor.app"] for debugging
  }
  func DetectFromConnection(conn net.Conn) (*DetectedIdentity, error)
  ```
- Use `gopsutil` library or platform-specific syscalls (`getsockopt(SO_PEERCRED)` on Linux, `proc_pidinfo` on macOS) to map source PID → process name → walk parent chain
- Maintain a **harness signature map** — pattern matching: process names + parent chains → agent_name
  - `claude` (Anthropic CLI) → `claude-code`
  - `cursor-agent` or process-with-Cursor.app-ancestor → `cursor`
  - `codex` → `codex`
  - process-with-conductor-ancestor → `conductor:<inferred-child>`
  - Generic Python/Node script with no AI ancestor → `human-script`
  - psql/pg_dump with no AI ancestor → `human`
- Wire into `pgproxy/postgres.go` — when `IdentityVerifier.Verify` doesn't return a declared identity, fall back to `processdetect.DetectFromConnection` and tag with the inferred identity (Source: "process_tree")
- The `audit` table records both: `agent_id` (NULL if anonymous), `agent_name` (always populated when detected, either from declared or inferred), `agent_source` (new column: 'declared' | 'inferred' | 'anonymous')
- Schema migration: add `agent_source` column to audit table (idempotent ALTER, default 'anonymous')

**Acceptance:**
1. Connection from `psql` started by Costa's terminal → audit row has `agent_name='human'`, `agent_source='inferred'`
2. Connection from a Python script started by Cursor → audit row has `agent_name='cursor-agent'`, `agent_source='inferred'`
3. Connection from Claude Code CLI → `agent_name='claude-code'`, `agent_source='inferred'`
4. When `application_name=vigil:<valid-token>` is also set, declared identity wins → `agent_source='declared'`, `agent_id` populated
5. Remote (non-localhost) connections that can't be introspected → `agent_source='anonymous'`
6. Per-agent rate limiting works for INFERRED identities (Cursor gets its own bucket even without declaration)
7. Coalescing does NOT apply to inferred identities (still per-spec — only signed declared identities can safely coalesce due to RLS concerns)
8. Per-platform: works on macOS + Linux. Windows can be deferred (smoke test only).

### Sub-project C — `vigil-run` wrapper + per-harness docs (declaration convenience)

**Goal:** for users who want richer Tier-2 declared identity, make the opt-in path turnkey.

**Scope:**
- New CLI binary `vigil-run` (small Go tool, lives at `proxy/cmd/vigil-run/`):
  - Usage: `vigil-run <command> [args...]`
  - On invocation: contacts the local `vigil-proxy` HTTP API, mints a fresh identity for the calling user, gets a token, sets `VIGIL_TOKEN` env var, then `exec`s the command
  - Uses macOS Keychain / Linux libsecret to cache the token across invocations (so `vigil-run claude` doesn't mint a new identity every time)
- Connection-library helpers — small helper packages users can import in their agent code:
  - `vigil-go` — Go package: `vigil.WrapPgxConfig(cfg)` adds `application_name=vigil:<token>` from env
  - `vigil-py` — Python package: `from vigil import wrap_psycopg; wrap_psycopg()` monkey-patches psycopg2/psycopg3 to set application_name from env
  - `vigil-node` — npm package: `require('vigil').wrapPg()` does the same for `pg`
  - Each is ~50 lines, ships v0.1.0 with the proxy
- Documentation page per harness, in `proxy/docs/harnesses/`:
  - `claude-code.md` — "use `vigil-run claude` and you're done"
  - `cursor.md` — "Cursor users: process detection works automatically. For richer identity, prefix shell commands with `vigil-run` or import `vigil-py` in your agent's code"
  - `codex.md` — same as Claude Code
  - `vscode.md` — same as Cursor
  - `conductor.md` — "wrap your agent commands with `vigil-run`; Conductor passes env automatically"
  - `custom.md` — "set `application_name=vigil:<token>` from env in your code; here are snippets for pgx/psycopg/etc."

**Acceptance:**
1. `vigil-run claude` runs Claude Code with `VIGIL_TOKEN` set → audit rows show signed identity (`agent_source='declared'`)
2. Token cached in keychain after first issue; `vigil-run codex` later uses the same one
3. `vigil-go` Wrapper helper works with pgx — single line addition
4. `vigil-py` works with psycopg2 + psycopg3
5. Docs page per harness exists, follows the same structure
6. `vigil-run --help` is helpful

## Order of operations

1. **A (The Rip) ships first.** It's blocking — the Tauri app is unusable today because of the gate. Smallest scope. Single PR, ~1 day of agent work.
2. **B (Process introspection) ships second.** This is the load-bearing detection mechanism. Without it, the post-cleanup product still requires user setup to do anything per-agent. Single PR, ~2-3 days of agent work.
3. **C (vigil-run + libs + docs) ships third.** Convenience layer for richer identity. Can be parallelized into multiple sub-PRs (one per language helper, one for the wrapper, one for the docs). ~1 week of total work, parallelizable.

## Versioning

- A merges → tag `v0.1.0e-cleanup` or fold into the next milestone
- B merges → tag `v0.1.0e-detect` (the detection feature itself)
- C merges → no new tag (additive, no behavior change)

The next "venture-grade demo number" is: **with process detection on, what % of typical real-world agent traffic gets correctly identified?**

- **95% — aspirational target / marketing number** — when we can quote 95%+, it goes on the homepage as the headline detection number
- **88% — ship floor** — sub-project B doesn't get tagged as launch-ready below 88% on dogfood measurement
- Below 88% means the pattern map is incomplete or there's a structural OS issue we need to fix before ship; we tune until we cross the floor

## Decided open questions

These were open in the original draft; now resolved:

- **Delete `daemon/` entirely** — yes. Costa explicitly diverted this call to lead. The daemon is pre-pivot baggage; its FS-watcher purpose doesn't align with the post-pivot product; its presence creates the worst app-UX bugs (LLM gate, "daemon not reachable" banner). Git preserves the code if we ever want to recover any pieces.
- **Detection bar** — see versioning above. 95% aspirational, 88% floor.

## Smoothness P1s — address during the cleanup push

Costa flagged the app as "having issues" — these need attention beyond the strategic Rip:

- **MCP server crashes on malformed JSON-RPC frame** (QA-010 from PR #36 QA report). One bad client message kills the entire stdio session. Fix: catch parse errors, return JSON-RPC error response, keep session alive. Ship as part of the **P0 fix bundle** (separate small PR, not part of A or B).
- **100 concurrent psql connections → 11 dropped** (from QA report). Above what `max_connections=100` alone would predict — possibly a race in Vigil's accept loop. Investigate as part of sub-project B's stability work; if it's a real race, fix; if it's actually Postgres `max_connections` being hit early due to Vigil holding upstream conns, document.
- **Vite cold-start blank screen** (~5–10s on `npm run tauri dev`). Annoying but expected for any Tauri dev mode. Document in dev README; not a real fix item until we ship a production-built `.app` (separate post-launch task).
- **Disk-write-failure path untested** (deferred from QA per process). 5-min follow-up needed in a clean fixture; assigned as part of sub-project A's testing scope (since A touches the audit init path lightly).

## What this push does NOT include

- Policy enforcement (v0.1.0e proper — different push)
- Windows process detection (deferred, smoke test only on initial release)
- Native harness SDK integrations (Conductor SDK plugin, Cursor extension) — deferred to "if users ask"
- Removing the daemon's identity store — proxy keeps using SQLite identity store; only the FS-watcher portion of the daemon goes away
- Marketing site overhaul — the Rip removes wrong claims, but a full site rewrite to match the new identity-first story is a separate push

## Risks + mitigations

| Risk | Mitigation |
|---|---|
| Process introspection requires permissions Vigil doesn't have on macOS (sandboxing, app permissions) | Use `lsof`-equivalent calls that work without root for own-user processes. Fall back gracefully to anonymous when introspection fails. |
| The Rip breaks something the daemon was load-bearing for | The daemon is NOT load-bearing for the proxy stack. The proxy reads/writes its own `~/.vigil/proxy.db`, separate from any daemon DB. Verified earlier this session. |
| Inferred identity ≠ declared identity → policy enforcement gets confused | `agent_source` column distinguishes; policy engine (future) can require `agent_source='declared'` for enforcement |
| Process tree detection misses Docker-containerized agents | Document as known limitation. Tier-3 anonymous fallback applies. |
| Cursor's process model changes (they update their app) | Detection logic in `harness signature map` is data-driven — update the map, redeploy. No core code change. |

## Definition of done

- A: Tauri app launches without onboarding gate, no Sessions tab, no LLM dependencies, README + site copy aligned
- B: 95%+ of localhost agent connections correctly identified by harness without user setup; `agent_source` column exists; rate limiting + audit attribution work for inferred identities
- C: `vigil-run claude` works end-to-end; per-language helper packages published; one doc per harness on the supported list

---

This document is the lens for the next push. If a proposed change doesn't advance Identity (the primary key) or remove pre-pivot baggage, defer it.
