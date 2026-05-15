# Conductor Prompt — Agent B: Proxy-Side Process Introspection (Tier-1 Detection)

You are working on **Vigil**, an agent-aware Postgres data-plane proxy. Identity is the primary key for every per-agent feature (rate-limit pools, fan-out coalescing, audit attribution, MCP introspection, future policy enforcement). Today identity attaches ONLY when an agent or harness explicitly sets `application_name=vigil:<token>` in the connection string — which nobody does by default. That makes the product's per-agent features anonymous-by-default for first-time users.

**Your job:** build a universal Tier-1 detection mechanism so identity attaches automatically. When a Postgres connection arrives at `vigil-proxy` from localhost, the proxy looks at the source PID and walks its process tree to infer which agent (Claude Code, Cursor, Codex, Conductor child, VS Code, custom script, human) is at the other end. **Without any user opt-in.**

This is the load-bearing feature that makes Vigil deliver on its promise out of the box.

## Required reading before you write any code

1. `docs/superpowers/specs/2026-05-15-post-pivot-product-cleanup-design.md` — your full mandate. Read every section, especially "Sub-project B." Pay close attention to the three-tier identity model, the 88% ship floor / 95% aspirational target, and `agent_source` column.
2. `docs/superpowers/specs/2026-05-15-product-direction-design.md` — strategic frame. Detection is what makes Layer 1 of the product actually work for typical users.
3. `docs/superpowers/specs/2026-05-04-vigil-data-plane-design.md` — canonical spec.
4. `proxy/internal/pgproxy/postgres.go` — the message pump and current identity-attachment logic. You're adding a fallback path.
5. `proxy/internal/pgproxy/interfaces.go` — the interface declarations. You'll likely add a `ProcessDetector` interface here.
6. `proxy/internal/audit/audit.go` — current audit schema. You're adding an `agent_source` column.
7. `proxy/internal/identity/` — the existing identity store. Inferred identities are NOT signed; do not write inferred entries to the identity store. They're metadata that lives on the audit row only.
8. `docs/qa/2026-05-15-first-user-experience-report.md` — pay attention to the 11/100 concurrent connection finding; investigate as part of stability work below.

## What you ship

A new package `proxy/internal/processdetect/` plus integration into `pgproxy` that adds inferred-identity tagging to every audited row, **without touching the existing declared-identity path.** Declared identity still wins when present.

### 1. Core detection logic

New package `proxy/internal/processdetect/`. Public API:

```go
// DetectedIdentity is the metadata processdetect resolves for a connection.
// All fields are best-effort; missing data is acceptable (return zero values).
type DetectedIdentity struct {
    AgentName    string   // "claude-code", "cursor", "codex", "conductor:claude", "vscode", "human-script", "human", or "" if undetectable
    HarnessName  string   // e.g. "conductor", "cursor.app" — the immediate harness, if distinguishable
    Confidence   string   // "high", "medium", "low" — how sure we are. Drives whether this gets attribution.
    ProcessChain []string // ["python", "cursor-agent", "Cursor.app"] for debugging / audit detail
}

// DetectFromConn reads the source PID from conn and walks the parent
// chain, returning a DetectedIdentity. On non-localhost connections or
// permission failures, returns DetectedIdentity{} with no error — caller
// treats empty AgentName as "anonymous" and falls through to Tier-3.
type Detector interface {
    DetectFromConn(conn net.Conn) (DetectedIdentity, error)
}
```

Implementation:
- `proxy/internal/processdetect/detect.go` — top-level Detector interface + factory
- `proxy/internal/processdetect/walk_darwin.go` — macOS: PID-from-socket via `proc_pidinfo` syscall; parent-chain via `KERN_PROC_PID` sysctl
- `proxy/internal/processdetect/walk_linux.go` — Linux: PID-from-socket via reading `/proc/net/tcp` matching `inode`; parent-chain via reading `/proc/<pid>/stat`
- `proxy/internal/processdetect/walk_other.go` — Windows / unknown OS: returns empty DetectedIdentity, never errors
- `proxy/internal/processdetect/signatures.go` — the **harness signature map**, a data-driven table of:
  ```go
  type HarnessRule struct {
      // Match if process name OR any ancestor in chain matches this pattern.
      AncestorMatches []string // glob-shaped strings; case-insensitive
      // Direct process name (the leaf), exact match
      ProcessName string
      // Result
      AgentName   string
      Harness     string
      Confidence  string
  }
  ```
  Seed with at least:
  - `claude` → claude-code, high confidence
  - `codex` → codex, high confidence
  - process chain includes `Cursor.app` → cursor, high confidence
  - process chain includes `Code.app` or `code` (case-sensitive) → vscode, medium
  - process chain includes `conductor` → conductor:<inferred>, medium
  - process chain includes `Visual Studio Code.app` → vscode, high
  - `psql`, `pg_dump` with no AI ancestor → human, high
  - `python` / `node` / `ruby` / `go` with no AI ancestor → human-script, low
  - everything else → unknown, no attribution

Use `gopsutil` (`github.com/shirou/gopsutil/v4`) for cross-platform process introspection if it simplifies the macOS+Linux implementations. Pure Go is preferred over cgo. If `gopsutil` adds significant binary size (>1MB), document and pick the lighter path.

### 2. Schema migration — `agent_source` column

In `proxy/internal/audit/audit.go`:
- Add column `agent_source TEXT NOT NULL DEFAULT 'anonymous'` to the audit table
- Values: `'declared'` (signed Tier-2), `'inferred'` (Tier-1 from processdetect), `'anonymous'` (Tier-3 fallback)
- Idempotent migration: ALTER TABLE in the existing migrateDecision-style pattern (see how the `decision` column was added). Add a new function `migrateAgentSource(db *sql.DB) error` modeled on the existing one.
- Add `agent_source` index for the dashboard:
  ```sql
  CREATE INDEX IF NOT EXISTS idx_audit_agent_source ON audit(agent_source, ts);
  ```
- Extend the `audit.Event` struct with `AgentSource string` (default empty → written as "anonymous")
- Extend `Write` to include the new column in the INSERT

### 3. Wire detection into the pgproxy message pump

In `proxy/internal/pgproxy/postgres.go`:
- Add `Server.ProcessDetector processdetect.Detector` field (nil-default — gracefully no-ops when not set)
- In `handleConn`, when the connection arrives:
  - If `IdentityVerifier` resolves declared identity from `application_name=vigil:<token>` → use it, set `agent_source='declared'` (existing path, unchanged behavior)
  - Else if `ProcessDetector` is set AND `DetectFromConn` returns a non-empty `AgentName` → tag `state.agentName = detected.AgentName`, `state.agentID = ""` (no signed ID), `agent_source='inferred'`
  - Else → leave both empty, `agent_source='anonymous'`
- Thread `agent_source` through to audit writes — `state` should carry it; `auditClientFrame` / `auditServerFrame` should propagate it into the `audit.Event`
- The `agentID` stays empty for inferred (no signed ID); `agentName` carries the harness name. Coalescing still requires `agentID != ""` per the existing spec safety rule, so inferred identities do NOT coalesce (they'd lack the safe RLS-scoping guarantee). Rate limiting buckets, however, key on `agentName` if `agentID` is empty — that's the change to make per-agent rate limiting work for inferred identities.

In `proxy/internal/ratelimit/ratelimit.go` (read-only-ish, you may need to extend):
- The current rate-limit `Acquire(ctx, agentID, route)` keys on agentID. For inferred identities (`agentID == ""`), we need to fall back to bucketing by `agentName`. **Add a new field to the Acquire signature OR introduce a `BucketKey` that the proxy computes** (preferred: `agentID` if non-empty, else `"inferred:" + agentName`, else `"anonymous"`). This is your call — document the trade-off in the PR.
- The pre-existing default pools (`production`, `agents`, `unauth`) should still apply correctly:
  - `agentID != ""` → `agents` pool (or custom override)
  - `agentName == "human" || "psql"` → effectively `production` pool (humans are not throttled hard)
  - `agentName != ""` but `agentID == ""` (inferred) → `agents` pool
  - both empty → `unauth` pool

### 4. Stability investigation (QA-report finding)

The QA report flagged: 100 concurrent psql connections → 11 dropped. This is at or near Postgres' `max_connections=100` default, but the connection drops are higher than just the limit alone would predict. Two possibilities:
- **A.** Vigil holds connections to upstream slightly longer than the client expects, exhausting `max_connections` before the client's pool can recycle. → Documentation, not a bug.
- **B.** There's a race in Vigil's `Accept` loop (e.g., connection-leak under high concurrency). → Real bug, fix.

As part of this PR:
- Reproduce the QA finding (100 concurrent psql → measure drops)
- Diagnose which case it is
- If B, fix the race; document with a test that drives concurrency
- If A, document the limitation in the README + close the QA finding with that explanation

This is a P1 from the spec's Smoothness section; you own it as part of B's stability work.

## Files you own

New:
- `proxy/internal/processdetect/detect.go`
- `proxy/internal/processdetect/walk_darwin.go`
- `proxy/internal/processdetect/walk_linux.go`
- `proxy/internal/processdetect/walk_other.go`
- `proxy/internal/processdetect/signatures.go`
- `proxy/internal/processdetect/*_test.go` — comprehensive tests
- New tests in `proxy/internal/pgproxy/processdetect_integration_test.go` — integration test with mocked Detector

Modify:
- `proxy/internal/pgproxy/postgres.go` — wire detection into handleConn + state plumbing
- `proxy/internal/pgproxy/interfaces.go` — add Detector interface (if cleaner here than in processdetect)
- `proxy/internal/audit/audit.go` — add agent_source column + migration + Event field + Write update
- `proxy/internal/audit/audit_test.go` — new tests for the migration + the new column
- `proxy/internal/ratelimit/ratelimit.go` — extend Acquire signature or BucketKey to handle inferred-identity bucketing
- `proxy/cmd/vigil-proxy/main.go` — wire `pgproxy.Server.ProcessDetector = processdetect.New()` on startup
- `proxy/README.md` — additive: document detection behavior, supported platforms, limitations (Docker, remote connections, sandboxing)
- `proxy/bench/RESULTS.md` — re-run after detection ships; document the new agent_source counts; the detection hit rate becomes a tracked metric

## Files you MUST NOT touch

- `app/`, `daemon/` (which Sub-project A is deleting), `site/`, `docs/superpowers/specs/`, `docs/launch/`, `docs/qa/`
- `proxy/internal/coalesce/` — coalescing logic untouched; the rule "only coalesce when agentID is non-empty" already exists and naturally excludes inferred identities
- `proxy/internal/identity/` — identity store is for declared signed identities; inferred identities don't go in here
- `proxy/internal/mcpserver/` — separate concern

## Acceptance criteria

1. **Detection rate ≥ 88% on dogfood measurement.** Run a sustained workload (e.g., 30-min bench mixed with a real psql session + a manually-spawned Python script) and verify ≥88% of connections get a non-empty agent_name from process introspection. **Document the dogfood test method + raw numbers in the PR body.** Goal is to push toward 95% by tuning the signature map.
2. **Inferred identity does NOT enable coalescing.** Verified with a test: agentID="" + agentName="cursor" → repeated identical SELECT both reach upstream, neither cache-hits.
3. **Inferred identity DOES enable per-agent rate limiting.** Verified with a test: agentName="cursor" connection drains the agents pool; a separate agentName="claude-code" connection still flows freely.
4. **Audit row carries agent_source correctly.** Test: declared connection → row has `agent_source='declared'`; inferred → `'inferred'`; neither → `'anonymous'`. SQL count by agent_source matches.
5. **Schema migration is idempotent.** Tests: fresh DB → has agent_source column; existing v0.1.0d DB → migration adds the column with `'anonymous'` default for old rows; second Open call is a no-op.
6. **Cross-platform builds.** `go build ./...` succeeds on darwin/arm64, darwin/amd64, linux/arm64, linux/amd64. Use GOOS+GOARCH env to verify each (`GOOS=linux GOARCH=arm64 go build ./...`).
7. **Concurrent-connection stability.** Run the QA's 100-concurrent test against the new build. Document the result + your diagnosis (case A or B above) + fix if applicable.
8. **All pre-existing proxy tests pass.** `go test ./...` clean.
9. **`go vet ./...` clean.**
10. **Add a `--debug-detection` flag to vigil-proxy** that logs each detection attempt with the resolved process chain. Helpful for users debugging "why didn't Vigil detect my agent?"

## Out of scope (do not implement)

- The `vigil-run` wrapper (Sub-project C)
- Per-language helper packages (Sub-project C)
- Per-harness docs (Sub-project C)
- Windows detection (return empty; smoke test only)
- Container-aware introspection (Docker network namespace traversal) — deferred, document as limitation
- The Tauri app surfaces for agent_source — the existing decision filter pattern probably extends but defer the UI work to a follow-up
- Removing daemon-related dead code in pgproxy — Sub-project A handles
- Marketing the detection feature on the site — separate copy task

## Edge cases + gotchas

- **macOS sandbox / permission.** `proc_pidinfo` works for own-user processes without root, but Apple sandboxing for distributed apps can restrict it. Document the limitation; gracefully return empty DetectedIdentity on permission errors.
- **Process exits between connection accept and lookup.** The TCP connection is open, the process opening it may have exited milliseconds later (some agents spawn short-lived subprocesses). Cache the lookup result by `(remoteAddr, time)` for ~1s if needed, OR accept that some races produce empty detection. Document.
- **Process name collisions.** Multiple unrelated tools might be named `claude` (e.g., a hypothetical unrelated CLI). The harness signature map should match on **path + ancestors**, not just the basename. Document this in `signatures.go`.
- **Conductor running multiple agent types.** Conductor's child can be claude OR codex OR something else. Detection should return `conductor:<inferred-child>` if it can identify the child, else just `conductor`. The detector might walk one extra level to identify the child.
- **The bench harness runs `vigil-bench` which connects to itself via Vigil.** Make sure the harness still works post-detection — it should detect itself as `vigil-bench` (a known harness, treat as benchmarking-tool not a real agent).
- **`/proc/net/tcp` on Linux requires reading and matching socket inodes — non-trivial.** Use `getsockopt(SO_PEERCRED)` for Unix-domain sockets and `proc_pidinfo` / `lsof`-equivalent for TCP. Pure-Go `gopsutil` may abstract this.

## How to know you are done

- A fresh install + a 30-minute bench + a manually-spawned Cursor agent (or any real agent on your machine) results in ≥88% of connections correctly identified by `agent_name`, with `agent_source='inferred'` on the audit rows
- The QA report's 11/100 concurrent-drop finding has a documented diagnosis (case A or B) and either a fix or a documented Postgres-limitation explanation
- All Cross-platform builds pass
- The proxy/README.md has a "Detection" section explaining the three tiers, supported platforms, and known limitations
- The bench RESULTS.md has fresh numbers under the new build, with detection-rate metrics included

## When you finish

Open a PR against `main`. Lead reviews with the cleanup spec open. Critique will focus on (a) detection hit rate on the dogfood measurement, (b) the rate-limit bucketing change for inferred identities, (c) the migration safety for existing v0.1.0d DBs.

## When you get stuck

If the dogfood detection rate is below 88%, **don't fudge the number** — investigate which harnesses are missing from the signature map and document what's untestable from a headless environment. The lead can run the dogfood test on real Costa-machine. The agent's job is to ship a quality detector + a reproducible test plan.

If `gopsutil` doesn't expose what you need on macOS, the platform-specific `proc_pidinfo` + `KERN_PROC_PID` syscalls via cgo OR pure-Go `golang.org/x/sys/unix` are the fallbacks. Pure Go is preferred — cgo breaks the cross-compile story.

If the concurrent-connection investigation reveals a real race, fix it — that's a P1 and the user explicitly flagged "the app is having issues" / "make sure the product is flawless."
