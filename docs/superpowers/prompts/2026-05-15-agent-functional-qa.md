# Conductor Prompt — Agent: Pre-Launch Functional QA

You are working on **Vigil**, an agent-aware data plane proxy. v0.1.0d just shipped. Before public launch (Show HN, waitlist email, Twitter), we need to find the bugs that synthetic tests miss — the friction a brand-new user hits when they walk the docs end-to-end.

**You produce a report, not a fix.** Find issues, document them with repro steps, categorize by severity. The lead (Claude) and Costa decide what to fix, when, and how. The exception: trivial typos in docs are fair game to fix inline as you go.

## Required reading

1. `proxy/README.md` — the install + run docs. Every command in here is a contract.
2. `proxy/dist/homebrew/README.md` — the tap publish workflow.
3. `proxy/dist/homebrew/vigil.rb` — the formula end users install via.
4. `docs/superpowers/specs/2026-05-15-product-direction-design.md` — the strategic frame. Helps you spot mismatch between marketing claims and shipped reality.
5. `docs/superpowers/specs/2026-05-04-vigil-data-plane-design.md` — the canonical product spec. Lists the 5 primitives + which ones ship in v0.1.0d.
6. `site/src/components/bevigil/home-view.tsx` and `site/src/components/bevigil/content.ts` — the public marketing copy. Compare against shipped reality.
7. `docs/launch/show-hn-post.md`, `launch-tweet-thread.md`, `waitlist-announcement-email.md` — the launch artifacts. Check that every claim is true today.
8. `proxy/bench/RESULTS.md` — the latest measured numbers.

## What you ship

A single comprehensive QA report at `docs/qa/2026-05-15-first-user-experience-report.md` plus any supporting log/transcript files in `docs/qa/2026-05-15-supporting/`.

The report has six sections:

1. **Install flow** — does `brew install constantinexanthos/vigil/vigil` work? Does the binary land on PATH? Does `vigil-proxy --version` print the right version? Are the caveats helpful?
2. **Postgres proxy functional** — every behavior promised by the README + spec, verified against a real Docker Postgres.
3. **MCP server functional** — every tool, every auth path, end-to-end via stdio JSON-RPC.
4. **Long-running stability** — 30+ minutes of continuous traffic; memory, fd, sqlite WAL growth; clean shutdown.
5. **Failure modes** — what happens when things go wrong (Postgres dies, disk fills, bad config, etc).
6. **Marketing/docs alignment** — does the site + README + launch artifacts match shipped reality?

Each finding gets:
- **ID** (e.g. `QA-001`)
- **Severity** (P0 = blocks launch / P1 = embarrassing, fix before launch / P2 = nice to fix / P3 = future)
- **Where** (file:line, URL, or scenario)
- **Reproduction steps** (exact commands, exact inputs)
- **Expected behavior** (what the docs/spec claim should happen)
- **Actual behavior** (what you observed)
- **Suggested fix** (one-line proposal — the lead may take or revise)

## Test plan in detail

### 1. Install flow (~10 min)

```bash
# Fresh shell, no prior vigil install
brew install constantinexanthos/vigil/vigil
which vigil-proxy   # → /opt/homebrew/bin/vigil-proxy
vigil-proxy --version   # → v0.1.0d (or current)
brew test vigil
brew uninstall vigil
brew install constantinexanthos/vigil/vigil   # second install — clean re-install path
```

Findings to look for: 404s on download, SHA256 mismatch, wrong version printed, broken `brew test`, weird PATH issues, the caveats text being unhelpful or wrong.

### 2. Postgres proxy functional (~30 min)

Spin up a real Postgres in Docker. Then exercise:

- **Bytes-equivalent passthrough.** `psql` with no Vigil identity in `application_name` — every Postgres feature should work identically to direct connection. Test: `SELECT 1`, `\d`, `\l`, `CREATE TABLE x (a int); INSERT; SELECT; DROP;`, transactions, prepared statements (`PREPARE ... EXECUTE`), `COPY FROM STDIN`, `LISTEN/NOTIFY`.
- **SCRAM-SHA-256.** Postgres 16 default. Verify auth completes through the proxy.
- **Identity attachment.** `psql` with `application_name=vigil:<token>`. Verify a real identity gets stored, audit rows have populated `agent_id`/`agent_name`. Test with valid token, invalid token (audit rows should still happen with NULL agent), no token.
- **Coalescing.** Fire the same `SELECT 1` 10 times in quick succession from the same identified agent. Audit table should show 1 query forwarded + 9 with `decision='coalesced'`. Verify TTL: same query 500ms later should re-fetch (default TTL 250ms).
- **Coalescing — transaction safety.** Inside `BEGIN; SELECT 1; SELECT 1; COMMIT;` — both SELECTs should reach upstream (NOT cached). Verify in audit.
- **Coalescing — deny list.** `SELECT nextval('seq'); SELECT nextval('seq');` — both should reach upstream.
- **Rate limiting.** Connect with no identity (anonymous). Fire >10 q/sec — verify the bucket starts blocking after 10. Audit should show `decision='rate_limited'` on the blocked ones.
- **Rate limiting — per-pool isolation.** Two psql sessions, one with valid identity (in `agents` pool), one anonymous (in `unauth` pool). Drain `unauth` pool — verify identified agent still flows freely.

### 3. MCP server functional (~15 min)

```bash
vigil-proxy --mcp-stdio
```

Drive over stdio with hand-crafted JSON-RPC + Content-Length framing. Verify:

- `initialize` returns the server info + protocol version
- `tools/list` returns `vigil.identity.whoami` + `vigil.activity.query`
- `tools/call vigil.identity.whoami` with no token → `{agent_id: null}`
- `tools/call vigil.identity.whoami` with valid token in `clientInfo.vigil_token` → real identity object
- `tools/call vigil.identity.whoami` with `VIGIL_TOKEN` env var instead of clientInfo → same result
- `tools/call vigil.activity.query` scoped to calling agent
- `tools/call vigil.activity.query` with `since` filter narrows correctly
- Bad JSON-RPC frames → server returns proper error, doesn't crash
- Server exits cleanly when stdin closes

### 4. Long-running stability (~30 min)

```bash
# 30-minute bench with continuous traffic
BENCH_DURATION=1800s make bench BENCH_PRESET=mixed
```

While it runs, in another terminal monitor:
- `ps -o rss= -p <vigil-proxy-pid>` — memory should stabilize, not grow unboundedly
- `lsof -p <pid> | wc -l` — fd count should stabilize
- `du -sh ~/.vigil/proxy.db` — sqlite WAL size, audit table size
- After 30 min, send `SIGTERM` — verify clean shutdown (no fd leaks, no zombies, exit code 0)

If any of these grow unboundedly, that's a P0 (will OOM or hit fd limit in production).

### 5. Failure modes (~20 min)

- **Postgres dies mid-connection.** `docker stop postgres` while a session is mid-query. vigil-proxy should not crash; the client should see a clean error.
- **Vigil killed mid-connection.** `pkill vigil-proxy` while a session is mid-query. The psql client should see a clean disconnect, not a hang.
- **Bad config file.** `--ratelimit-config /tmp/garbage.yaml` (file with malformed YAML). Should fail loud at startup, not silently fall back to defaults.
- **Disk write failure.** Mount `~/.vigil/` on a tiny tmpfs (or just chmod -w it briefly). Audit writes should fail loud, not corrupt state.
- **Many concurrent connections.** 100 psql sessions in parallel. Verify no race conditions, audit ordering preserved per-connection.

### 6. Marketing/docs alignment (~30 min)

This is the most important section because public launch hangs on it.

- **Site → reality.** Walk every claim on bevigil.ai's homepage. For each one: is it true today as of v0.1.0d? Specifically:
  - "Per-agent identity" — yes, in v0.1.0a/b
  - "Smart rate limiting" — yes, in v0.1.0c
  - "Fan-out coalescing" — yes, in v0.1.0d
  - "Blast-radius control" — **NO, not shipped in v0.1.0d** (deferred to v0.1.0e). Site implies it's live. Document this mismatch.
  - "Signed audit trail" — yes
  - "Open source · Single binary · Free for individuals" — yes
  - "The seatbelt for your agent fleet" — accurate framing
  - "Concrete scenario" — hypothetical text. Could be backed by real bench numbers now.
- **README → reality.** Walk every command in `proxy/README.md`. Does every one work as documented?
- **Launch artifacts → reality.** Walk `docs/launch/show-hn-post.md`, `launch-tweet-thread.md`, `waitlist-announcement-email.md`. Replace `<DEDUP_PERCENT>` with `99.31%`. Check every claim. Suggest tightenings.

## Files you own

- New: `docs/qa/2026-05-15-first-user-experience-report.md` — the report
- New: `docs/qa/2026-05-15-supporting/` — any supporting transcripts, log excerpts, json-rpc captures
- Trivial doc fixes (typos, broken links) inline — commit separately so they're easy to revert

## Files you MUST NOT touch

- `proxy/`, `app/`, `daemon/`, `site/` — observation only. You report bugs; you don't fix them.
- The launch artifacts in `docs/launch/` — flag issues in your report; the lead will edit.

## Acceptance criteria

1. Report exists with sections 1–6 covered
2. ≥15 distinct findings (if Vigil really is that polished, fewer is OK but explain why)
3. Each finding has all six fields (ID, severity, where, repro, expected, actual, suggested fix)
4. P0 findings get a "blocker" call-out at the top of the report
5. Marketing/docs alignment section explicitly addresses each of the 5 primitives' claim status
6. Long-running stability section includes memory/fd/sqlite numbers from the actual run

## Out of scope

- Tauri app visual QA — Costa does this manually (you can't screenshot native macOS apps)
- Fixing the bugs you find — report only
- Performance regression hunting — bench harness already covers this
- Security review — separate workstream

## How to know you are done

- The report exists, is well-structured, and has at least 15 findings
- A future Costa or future you can read it and reproduce every issue
- The most embarrassing P0 / P1 issues are surfaced before they get to a public Show HN comment thread

## When you finish

Open a PR with the report (and any trivial typo fixes as separate commits). The lead reviews, files the P0/P1 work into actionable fix tasks for follow-up agents, and merges the report regardless of whether the bugs are fixed (the report is a snapshot, not a passing grade).

## When you get stuck

If a tool you need (e.g., the Tauri shell) isn't available in your environment, document the gap and skip the section — don't fake the testing. A report that says "section X not testable from headless context, requires Costa to do manually" is more useful than a section that pretends to have been tested.

If you find Vigil is in *significantly worse* shape than expected (lots of P0s), stop after ~10 P0s and flag it for the lead — at some point the right move is "this isn't ready for QA, it's ready for fixes" and we re-plan.
