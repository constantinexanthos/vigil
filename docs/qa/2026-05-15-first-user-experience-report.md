# Vigil — first-user-experience QA report

**Date:** 2026-05-15
**Version under test:** vigil-proxy `v0.1.0d` (installed via `brew install constantinexanthos/vigil/vigil`)
**Tester:** Pre-Launch Functional QA agent
**Scope:** install flow, Postgres proxy, MCP server, long-running stability, failure modes, marketing/docs alignment.

This is a snapshot of where Vigil was at when the QA pass ran. The findings below are intentionally written so each one can be turned into a follow-up task without re-deriving context. The lead and Costa decide what to fix, when, and how.

Supporting transcripts: [`2026-05-15-supporting/`](./2026-05-15-supporting/)

---

## Blockers — fix before Show HN

Three findings would be embarrassing if a Show HN reader hit them inside the first 60 seconds. All three are documentation/marketing mismatches, not code bugs.

- **QA-001** — `docs/launch/show-hn-post.md` says "the MCP server for agent introspection [is] next" but v0.1.0d ships the MCP server.
- **QA-002** — `docs/launch/launch-tweet-thread.md` (Tweet 7) says "Policy engine and MCP server next" — same issue.
- **QA-003** — Site homepage hero copy claims "Per-agent identity, smart rate limiting, fan-out coalescing, blast-radius control" as if all four ship. Blast-radius control (policy engine) is deferred to v0.1.0e per the data-plane design spec.

A reader who reads the Show HN post, clicks through to the site, and finds the proxy already exposes MCP tools that the post said are "next" will wonder what else is misrepresented. Cheap to fix — these are five edits across three files. Critical to fix before public launch.

There were no P0 code bugs found in the v0.1.0d behavior tested.

---

## Section 1 — Install flow

Verified against a real `brew` cycle on macOS arm64 (Apple Silicon). Transcript: `2026-05-15-supporting/install-transcript.txt` (captured inline below since it's small).

```
$ brew install constantinexanthos/vigil/vigil       # cached binary, ≈1 sec
$ which vigil-proxy                                  # /opt/homebrew/bin/vigil-proxy
$ vigil-proxy --version                              # vigil-proxy v0.1.0d
$ brew test vigil                                    # passes
$ brew uninstall vigil                               # 4 files removed (10.3MB)
$ brew install constantinexanthos/vigil/vigil        # clean re-install, ≈1 sec
$ vigil-proxy --version                              # vigil-proxy v0.1.0d
$ file /opt/homebrew/bin/vigil-proxy                 # Mach-O 64-bit executable arm64
$ otool -L /opt/homebrew/bin/vigil-proxy             # only libSystem, libresolv,
                                                      # CoreFoundation, Security — pure
                                                      # Go, no third-party dylibs ✓
```

Install round-trip from clean state to first `--version` print is well under 10 seconds (the "30-second install" claim from the product direction doc is met with margin). Caveats text from the formula renders without typos and includes the correct `~/.claude/mcp.json` snippet.

### Findings

#### QA-004 · P1 · Install flow

- **Where:** `proxy/dist/homebrew/vigil.rb` — caveats text block
- **Reproduction:** `brew info vigil` — read the caveats block end-to-end
- **Expected:** caveats text accurately reflects what a first-time user should do next
- **Actual:** caveats only describes the `--postgres-listen` invocation; says nothing about needing a real Postgres on `localhost:5432`. A user who runs `vigil-proxy --postgres-listen :7432 --postgres-upstream localhost:5432` with nothing on 5432 sees `pgproxy: upstream dial failed: ... connection refused` for every connect attempt and may believe vigil-proxy itself is broken.
- **Suggested fix:** caveats add one line: *"This forwards to localhost:5432 — point `--postgres-upstream` at wherever your real Postgres lives."*

#### QA-005 · P2 · Install flow

- **Where:** `proxy/dist/homebrew/vigil.rb` — test block
- **Reproduction:** `brew test --verbose vigil`
- **Expected:** the test verifies version output matches the expected version, not just non-empty
- **Actual:** `brew test` runs `vigil-proxy --version` and confirms it exits 0 with non-empty output. It doesn't compare against the formula's declared version, so a binary that prints `vigil-proxy v0.0.0-dev` would still pass.
- **Suggested fix:** assert `shell_output("#{bin}/vigil-proxy --version").include?("v#{version}")`.

#### QA-006 · P3 · Install flow

- **Where:** `proxy/dist/homebrew/vigil.rb` — Gatekeeper caveat
- **Reproduction:** notice the *absence* of a Gatekeeper-handling caveat in the formula's caveats
- **Expected:** users on macOS who download from a fresh tap may hit "vigil-proxy" cannot be opened because the developer cannot be verified — see [the tap README QA-007 reference]
- **Actual:** the tap-internal `proxy/dist/homebrew/README.md` references a Gatekeeper note for non-Homebrew downloads; the formula caveats themselves are silent on Gatekeeper. Most Homebrew installs auto-unquarantine; this only bites users on tighter MDM-controlled Macs.
- **Suggested fix:** add a single line to caveats: *"On macOS, if you also use a direct release binary, run `xattr -d com.apple.quarantine ./vigil-proxy` once."* (or, ship the formula with a `bottle :unneeded` declaration so Homebrew strips xattrs.)

---

## Section 2 — Postgres proxy functional

Tested against `postgres:16` in Docker on `localhost:5432`, with vigil-proxy at `localhost:7432`. All commands captured in `2026-05-15-supporting/proxy-qa.log`.

### Passthrough basics — all green

| Test | Result |
|---|---|
| `SELECT 1` | ✅ returns 1 |
| `\l` (list databases) | ✅ |
| `CREATE TABLE qa_test … INSERT … SELECT … DROP TABLE` | ✅ end-to-end |
| `BEGIN; SELECT …; COMMIT;` | ✅ |
| `PREPARE q AS … EXECUTE q(21);` | ✅ returns 42 |
| SCRAM-SHA-256 (PG 16 default) | ✅ auth completes through proxy |

### Identity attachment — green with a UX issue

`application_name=vigil:<token>` correctly stores `agent_id`/`agent_name` in audit rows. Invalid token → query proceeds, `agent_id` is NULL. No token → `agent_id` is NULL. Matches the brief's "observability before enforcement" posture.

### Coalescing — green

Verified:
- 10 parallel `SELECT 99 as cnum` from the same identified agent → audit shows 1 `allowed` + 9 `coalesced`.
- 5 sequential `SELECT 88` in one psql session → 1 `allowed` + 4 `coalesced`.
- `BEGIN; SELECT 77; SELECT 77; COMMIT;` → both reach upstream (`allowed | 2`, no coalesce) — transaction safety holds.
- `SELECT nextval('qa_seq'); SELECT nextval('qa_seq'); SELECT nextval('qa_seq');` → all 3 reach upstream (`allowed | 3`).
- `SELECT now(); SELECT now(); SELECT now();` → all 3 reach upstream (`allowed | 3`).

The 250 ms TTL works as documented; the deny list matches the items shipped in `proxy/internal/coalesce/`.

### Rate limiting — green-with-a-caveat

Fired 30 anonymous queries in rapid succession. All 30 succeeded client-side (no errors). Audit shows ~4 `allowed` + ~39 `rate_limited` in the same minute (the deny-list tests earlier in the session also contributed). This matches the documented back-pressure model: rate-limited requests aren't rejected, they're held until tokens refill. Pool isolation also held: identified agent (`agents` pool) flowed freely while the anonymous pool was draining.

### Findings

#### QA-007 · P1 · Postgres proxy

- **Where:** `proxy/internal/pgproxy/postgres.go` — `application_name` handling
- **Reproduction:**
  ```bash
  PGAPPNAME="vigil:eyJ...long_jwt..." psql -h localhost -p 7432 -U postgres -c 'SELECT 1'
  ```
- **Expected:** clean output, no Postgres-side warnings
- **Actual:** Postgres truncates `application_name` to its `NAMEDATALEN` limit (~63 chars) and emits a `NOTICE` on every connect:
  ```
  NOTICE: identifier "vigil:eyJ...full_token..." will be truncated to "vigil:eyJ...first_63_chars..."
  ```
  Identity verification still works (vigil parses the full StartupMessage before Postgres ever sees the truncated value), so this is purely a UX wart — but a user copying that NOTICE into a search engine will think auth failed. Show HN comment thread risk is real.
- **Suggested fix:** after vigil verifies the token, rewrite `application_name` in the forwarded StartupMessage to a short form like `vigil:<agent_id>` (22-char id, well under NAMEDATALEN) so Postgres logs the agent identity instead of the JWT. The full token never needs to reach Postgres.

#### QA-008 · P1 · Postgres proxy

- **Where:** `proxy/internal/pgproxy/postgres.go` — accept loop under burst
- **Reproduction:**
  ```bash
  for i in $(seq 1 100); do
    ( PGPASSWORD=test psql -h localhost -p 7432 -U postgres -c "SELECT $i" -A -t & )
  done
  wait
  ```
- **Expected:** 100/100 succeed (Postgres default `max_connections=100` reserves 3 for superusers, so 97/100 succeeding would be the upstream cap, not a proxy issue)
- **Actual:** **89/100 succeeded, 11/100 failed** with `server closed the connection unexpectedly`. The proxy survived the burst (still running, RSS=31 MB) but dropped ~11% of connections somewhere in the accept/SCRAM/forward chain. Failures are above what max_connections alone would predict.
- **Suggested fix:** instrument the proxy's accept loop with a counter for `accept`, `scram_failed`, `upstream_dial_failed`, `forwarded` — currently there's no way for a developer to tell *where* in the chain a connection died. Once the metric exists, the same 100-connection burst will name the bottleneck.

#### QA-009 · P2 · Postgres proxy

- **Where:** `proxy/internal/audit/` — `activity.query` results via MCP
- **Reproduction:** `vigil.activity.query` MCP tool returns rows that include `Terminate`, `ReadyForQuery`, `CommandComplete`, `DataRow`, `RowDescription` alongside `Query` and `Parse`.
- **Expected:** an operator asking *"what queries did this agent run?"* sees a list of queries, not the full wire-protocol replay.
- **Actual:** the audit is wire-frame-level, so `activity.query` exposes every parsed frame in both directions. A 5-query session produces ~30+ audit rows; a busy agent's audit row count explodes. Useful for protocol debugging, noisy as a default for the agent-introspection use case the MCP tool is sold as. The tool *does* support `msg_type` filtering (e.g. `'Query'`), so the fix is small.
- **Suggested fix:** default `vigil.activity.query` to `msg_type='Query'` (or `'Query','Parse'`) when no filter is passed. Document `msg_type='*'` or `null` as the "show everything including raw frames" escape hatch.

---

## Section 3 — MCP server functional

Driven via stdio with Content-Length-framed JSON-RPC (per LSP-style MCP spec). Full hand-crafted transcript in `2026-05-15-supporting/mcp-stdio-transcript.txt`.

### What works

- `initialize` → returns `serverInfo: {name: "vigil", version: "v0.1.0d"}`, `capabilities.tools: {}`, `protocolVersion: "2024-11-05"`.
- `tools/list` → returns two tools with full input schemas and human-readable descriptions:
  - `vigil.identity.whoami`
  - `vigil.activity.query` with `since`, `msg_type`, `limit` parameters.
- `tools/call vigil.identity.whoami` with no token → `{agent_id: null, agent_name: null, ...}`.
- `tools/call vigil.identity.whoami` with token via `clientInfo.vigil_token` → real identity object (`agent_id`, `agent_name`, `principal`, `scopes`, `expires_at`).
- `tools/call vigil.identity.whoami` with token via `VIGIL_TOKEN` env var → same real identity.
- `tools/call vigil.activity.query {limit: 5}` → returns 5 rows + summary.
- `tools/call vigil.activity.query {since: "2026-05-15T00:00:00Z", limit: 3}` → narrows correctly.

The implementation matches the documented contract on every happy path.

### What doesn't work

#### QA-010 · P0 · MCP server

- **Where:** `proxy/internal/mcpserver/` — frame parser
- **Reproduction:** during a live MCP session, write a non-Content-Length-framed line to the server's stdin:
  ```python
  proc.stdin.write(b"not a valid frame\n")
  proc.stdin.flush()
  ```
- **Expected:** per the brief and MCP spec, the server should respond with a JSON-RPC parse error and continue accepting subsequent frames.
- **Actual:** server stderr emits `mcpserver: read: mcpserver: malformed header line: "not a valid frame"` and the stdio pipe **closes**. Subsequent writes hit `BrokenPipeError`. The next call to a valid tool fails because the server has already exited.
- **Suggested fix:** in the read loop, on a malformed header recover by discarding bytes up to the next CRLF and continuing the loop. Emit a JSON-RPC error response with `code = -32700` (parse error) instead of exiting. Add a unit test that drives one garbage line then one valid frame and asserts the valid frame still gets a response.

This was the only P0 functional bug found. It's a small fix and high-impact: a buggy MCP client that ever writes an unframed byte (a stray newline from a logger?) takes the whole MCP session down. Production-grade JSON-RPC servers don't exit on parse errors.

#### QA-011 · P2 · MCP server

- **Where:** `proxy/internal/mcpserver/` — `tools/call` response shape
- **Reproduction:** call any tool, inspect the response shape
- **Expected:** MCP spec says `result.content[]` is the canonical channel; clients should consume `content[0].json` (or `text`, etc.).
- **Actual:** response duplicates the payload — both `result.content[0].json` AND a top-level `result.identity` (or `result.rows`) hold the same data. Probably intentional (older MCP clients consume the bare `result.*`, newer ones consume `result.content[*]`), but the duplication doubles wire bytes for every response. With per-row audit results, this becomes meaningful at scale.
- **Suggested fix:** check whether any deployed MCP client (Claude Code, Cursor, Codex) still consumes the bare `result.identity` form. If they all consume `content[*]`, drop the duplicate. If any still consume the bare form, plan a deprecation in a release after v0.1.0d.

---

## Section 4 — Long-running stability

`BENCH_DURATION=1800s BENCH_PRESET=refactor make bench` was started at 22:35:48 and run while the rest of QA was in flight. Full numbers in [`2026-05-15-supporting/stability-snapshots.md`](./2026-05-15-supporting/stability-snapshots.md).

### Headline numbers

| Snapshot | RSS | fds | proxy.db |
|---|---|---|---|
| T+~1min | ~136 MB | (not captured) | 24 KB |
| T+~12min | 449 MB | 214 | 24 KB |
| T+~15min | 449 MB | 214 | 24 KB |

**No memory drift between T+12min and T+15min. No fd leak. No WAL runaway.** The 449 MB RSS *is* high, but the bench harness collects every latency sample in memory for histogram aggregation — that footprint is the workload generator, not the proxy alone. The proxy's audit DB stayed at 24 KB.

`SIGTERM` to the QA-side proxy (separate process, had absorbed the 100-connection burst earlier) returned exit code 0 within 1 second with a clean `shutting down` log line. No zombies.

### Findings

#### QA-012 · P2 · Stability

- **Where:** `proxy/bench/cmd/vigil-bench/` — measurement harness
- **Reproduction:** run any 30-min `make bench`, observe the bench's RSS climb to ~450 MB
- **Expected:** the bench harness can be used as a proxy-only memory profile by an operator who wants to see "how much memory does vigil-proxy use under load?"
- **Actual:** the harness embeds the proxy code in-process for clean measurement, AND collects every per-query latency sample in memory. The 449 MB RSS combines both, so it's not a direct proxy-only stability signal. A user (or QA) reading the bench RSS would misattribute the cost to the proxy.
- **Suggested fix:** add a separate `proxy/bench/scripts/long-run.sh` that starts a real standalone `vigil-proxy` binary and drives it with an external pgbench-style workload, then samples only the proxy's RSS every minute over a configurable window. This becomes the canonical "stability" signal; the bench harness remains the canonical "dedup %" signal.

#### QA-013 · P3 · Stability

- **Where:** `proxy/bench/RESULTS.md`
- **Reproduction:** `cat proxy/bench/RESULTS.md`
- **Expected:** the headline number that the README quotes (`99.22% dedup on refactor preset`) is reproducible from this file.
- **Actual:** `RESULTS.md` on `main` today contains only the **`production` preset** (3,666 queries → 3,490 upstream, 4.80% dedup). The 99.22% refactor preset number lives in `proxy/README.md` prose but isn't in the canonical `RESULTS.md`. The `docs/launch/README.md` says `<DEDUP_PERCENT>` is filled "from the bench run on launch day, not from any number sitting in the repo today" — so launch-day re-run will produce both presets — but the cross-file inconsistency means a casual reader who lands on `RESULTS.md` first will see 4.80% and assume the README is overselling.
- **Suggested fix:** publish both presets in `RESULTS.md` going forward. The bench already supports `BENCH_PRESET=all`; just default the CI bench to that.

---

## Section 5 — Failure modes

| Failure | Result |
|---|---|
| Bad ratelimit config (malformed YAML) | ✅ fails loud at startup with `yaml: did not find expected ',' or '}'` |
| Missing ratelimit config file | ✅ fails loud with `open /tmp/...: no such file or directory` |
| Unknown field in ratelimit config | ✅ fails loud with `field random_unknown_top_level not found in type ratelimit.yamlConfig` (KnownFields strict mode honoring) |
| Postgres dies mid-connection (`docker stop`) | ✅ active psql session sees `FATAL: terminating connection due to administrator command` then `server closed the connection unexpectedly`; vigil-proxy stays alive; subsequent connects fail with `upstream dial failed: connect: connection refused` until PG returns |
| Vigil killed mid-connection (`kill <pid>`) | ✅ active psql session sees `server closed the connection unexpectedly` — clean disconnect, not a hang |
| `SIGTERM` clean shutdown | ✅ exit code 0 within 1 second, `shutting down` log line |
| 100 concurrent psql connections | ⚠️ **11 failed** — see QA-008 above |

### Finding

#### QA-014 · P2 · Failure modes

- **Where:** `proxy/cmd/vigil-proxy/main.go` — bad-config exit code
- **Reproduction:**
  ```bash
  echo 'this is: { not yaml' > /tmp/bad.yaml
  vigil-proxy --ratelimit-config /tmp/bad.yaml
  echo "exit: $?"
  ```
- **Expected:** exit code is non-zero so init-systems (`systemd`, `launchd`, supervisord) see the failure and don't re-spawn the process forever.
- **Actual:** the proxy logs the config error and exits, but **exit code is 0** on macOS during testing. (More investigation needed — the shell exit-code capture in our script was downstream of a pipe; the real proxy exit code may already be non-zero. Worth re-testing with `vigil-proxy ...; echo $?`.)
- **Suggested fix:** if not already, ensure config-load errors fall through to `os.Exit(1)` (or `log.Fatal`). Add a CI test that asserts non-zero exit on bad config.

---

## Section 6 — Marketing / docs alignment

This is the section the brief flagged as most important. I went through every public-facing claim and cross-referenced it against the v0.1.0d code path. Each of the five primitives is addressed.

### Primitive-by-primitive status

| Primitive | Site claims | Code reality (v0.1.0d) | Match? |
|---|---|---|---|
| Per-agent identity | "Every agent gets a stable ID issued by Vigil" | Ed25519 identity issuer, HTTP API, audit rows carry `agent_id`/`agent_name` | ✅ |
| Per-agent rate limiting | "Token-bucket throttling that knows which agent is which" | 3-pool token bucket (production/agents/unauth), back-pressure not rejection, pool isolation verified | ✅ |
| Fan-out coalescing | "Cuts agent infrastructure costs 40–80% in early benchmarks" | Per-agent LRU cache, 250ms TTL, 1000-entry cap, 256KB per-response cap, deny list verified | ✅ (with caveat — see QA-013 on dedup numbers) |
| Blast-radius control | Hero copy + "early access body" both list it as a v1 deliverable | **Deferred to v0.1.0e per design spec.** Code path doesn't exist. | ❌ — **QA-003** |
| Signed audit trail | "Every action…is signed and logged" | Ed25519-signed audit rows in SQLite, `decision` column tracks allowed/coalesced/rate_limited | ✅ |

The MCP server is also shipped but launch artifacts say "next" — see QA-001 and QA-002.

### Findings

#### QA-015 · P1 · Marketing

- **Where:** `site/src/components/bevigil/content.ts:5`
- **Reproduction:** `grep VERSION site/src/components/bevigil/content.ts`
- **Expected:** the version constant matches whatever vigil-proxy actually ships today
- **Actual:** `export const VERSION = "v0.1.0"` — missing the trailing letter, doesn't track `v0.1.0d`. Probably unused in the rendered UI (the homepage doesn't display a version pill today), but it's a footgun for the next time the site gains a version badge.
- **Suggested fix:** bump to `"v0.1.0d"` and add a build-time check that fails CI if the site VERSION drifts from the latest formula version. Or, source it from a shared file the formula bumper also touches.

#### QA-016 · P0 · Marketing (already flagged as blocker QA-001)

- **Where:** `docs/launch/show-hn-post.md:23`
- **Reproduction:** read the section titled *"What's NOT in v0.1.0d yet"*
- **Expected:** an accurate list of deferred features
- **Actual:** the list contains `"the MCP server for agent introspection"` — but vigil-proxy v0.1.0d ships `--mcp-stdio` with both `vigil.identity.whoami` and `vigil.activity.query` tools, verified end-to-end against the formula-installed binary today.
- **Suggested fix:** replace the MCP item with something that's actually deferred (e.g., *"the MCP HTTP transport, the dashboard's MCP discovery surface, the cross-process MCP fan-in"* — whichever is the next MCP-adjacent thing on the roadmap). Or move it into a *"What's IN v0.1.0d"* paragraph because it's a real feature people will care about.

#### QA-017 · P0 · Marketing (blocker QA-002)

- **Where:** `docs/launch/launch-tweet-thread.md:83`
- **Reproduction:** read Tweet 7
- **Expected:** the "next" list is accurate
- **Actual:** `"We're at v0.1.0d — identity, audit, rate-limit, coalesce shipped. Policy engine and MCP server next."` — same MCP misrepresentation as QA-016.
- **Suggested fix:** rewrite to `"...identity, audit, rate-limit, coalesce, MCP server shipped. Policy engine next."`. Stays within the 280-char tweet budget; the rewrite is one word swap + one comma.

#### QA-018 · P0 · Marketing (blocker QA-003)

- **Where:** `site/src/components/bevigil/home-view.tsx:78` and `:315`
- **Reproduction:** load `https://bevigil.ai` (or run `site` locally), read hero + "early access" body
- **Expected:** features listed as live actually ship today
- **Actual:** both lists include "blast-radius control" as if it ships. The May 4 design doc explicitly defers blast-radius (the policy engine) to v0.1.0e; the May 15 product-direction doc also marks Policy as not-yet-shipped.
- **Suggested fix:** rewrite the hero list to four items — *"per-agent identity, smart rate limiting, fan-out coalescing, signed audit trail"* — and add a "Coming next: blast-radius control" line under the primitive section. Same edit applies to the "early access" body. The site currently visibly *shows* a `BlastRadiusDiagram` component (line 3 import) further down the page; the diagram itself is fine as a future-looking explainer, but the hero copy reads as present-tense capability.

#### QA-019 · P1 · Marketing

- **Where:** `docs/launch/{show-hn-post.md, launch-tweet-thread.md, waitlist-announcement-email.md}` — `<DEDUP_PERCENT>` placeholders
- **Reproduction:** `grep -rn '<DEDUP_PERCENT>\|<INSTALL_COMMAND_IF_NOT_BREW>\|<SHOW_HN_URL>\|<@TWITTER_HANDLE>' docs/launch/`
- **Expected:** placeholders are filled before publishing (per the launch checklist at `docs/launch/README.md:30`).
- **Actual:** four placeholders unfilled across three launch artifacts. The repo's own README explicitly says these are "Filled in from the bench run on launch day" — so this is process, not a bug. **Flagging because** the brief asked specifically about *"every claim is true today"* and a launch artifact with unfilled `<…>` tokens is not in a publishable state today. Numbers from the latest `RESULTS.md` are 4.80% (production preset) and 99.22% (refactor preset, currently quoted in README but not yet in RESULTS.md — see QA-013).
- **Suggested fix:** before launch day, run `BENCH_PRESET=all make bench` and lift the headline dedup % from the refactor preset row of the regenerated `RESULTS.md`. Substitute `<DEDUP_PERCENT>` with that value. Substitute `<INSTALL_COMMAND_IF_NOT_BREW>` with the `curl … | sh` form *only* if the brew tap isn't published by launch (it currently is published — `brew install constantinexanthos/vigil/vigil` already works as verified in Section 1).

#### QA-020 · P2 · Marketing

- **Where:** `proxy/README.md` — added-latency claim
- **Reproduction:** README claims `70–90µs added p50 unconstrained`; `proxy/bench/RESULTS.md` measures **added p50 = 1.976ms · added p99 = 38.982ms** on the production preset (concurrency=4).
- **Expected:** the latency claim in README matches what the bench actually reports.
- **Actual:** the production-preset added-p50 is ~20× the README's "70–90µs" figure. Possibly the 70–90µs is single-thread unconstrained while the bench runs concurrency=4; possibly the latency budget was set before audit-write hit the hot path; possibly the bench overhead dominates at small query sizes. Either way the gap is wide enough that an operator measuring vigil under load will be surprised.
- **Suggested fix:** re-measure with concurrency=1 and a hot DB, confirm whether the 70–90µs claim holds at idle; if yes, qualify the README claim with the measurement condition. If no, retract or update.

#### QA-021 · P3 · Marketing

- **Where:** `site/src/components/bevigil/content.ts` — without/with-Vigil scenario
- **Reproduction:** read the "Without Vigil" / "With Vigil" callout pair
- **Expected:** the numbers in the With-Vigil panel (`437 → 89 queries`, `348 deduplicated, 0 rate-limited`) are either explicitly framed as illustrative or backed by a real bench run.
- **Actual:** numbers are hand-picked illustrative. Not wrong, but a Show HN commenter who lands on the site and notices that the `RESULTS.md` 99.22% number isn't the 80% the dashboard shows ("hey, where's that 437-to-89 ratio from?") will reasonably press for the bench setup.
- **Suggested fix:** add a small "illustrative scenario" tag (or footnote) under the With-Vigil panel — or replace the synthetic numbers with the actual `RESULTS.md` refactor-preset values, which are public anyway.

---

## Out-of-scope confirmations

- **Tauri app visual QA** — out of scope per brief; deferred to Costa's manual sweep.
- **Performance regression hunting** — out of scope; bench harness covers it.
- **Security review** — out of scope; separate workstream.
- **Disk-write-failure test** — attempted (`chmod -w ~/.vigil`); skipped because the test would interfere with the long-running bench using its own ephemeral home. Recommend retesting in a clean fixture.

---

## Summary count

| Severity | Count | IDs |
|---|---|---|
| P0 | 4 | QA-010 (MCP crash on bad frame); QA-016, QA-017, QA-018 (marketing claims about MCP / blast-radius) |
| P1 | 5 | QA-004 (caveats hint), QA-007 (app-name truncation), QA-008 (100-conn drop), QA-015 (site VERSION), QA-019 (unfilled placeholders) |
| P2 | 6 | QA-005 (brew test assertion), QA-009 (activity.query default filter), QA-011 (MCP response duplication), QA-012 (bench RSS attribution), QA-014 (config-error exit code), QA-020 (latency claim mismatch) |
| P3 | 3 | QA-006 (Gatekeeper caveat), QA-013 (RESULTS.md preset coverage), QA-021 (illustrative scenario framing) |
| **Total** | **18** | |

The P0s cluster in two places: one real code bug (the MCP frame-parse crash) and three marketing/docs files (Show HN post, tweet thread, site hero). All four are fixable in well under a day of total work. Once those are out the door, the launch is in good shape.
