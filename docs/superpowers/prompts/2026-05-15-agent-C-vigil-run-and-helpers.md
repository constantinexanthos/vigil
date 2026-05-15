# Conductor Prompt — Agent C: vigil-run wrapper + per-language helpers + per-harness docs

You are working on **Vigil**, an agent-aware Postgres data-plane proxy. Sub-project B (process introspection) makes Tier-1 inferred identity work for free — most users get per-agent rate-limit + audit attribution without any opt-in. **Your job is the convenience layer for richer Tier-2 declared identity:** users who want signed identity (cryptographic verification, principal/scope metadata, the prerequisite for future policy enforcement) need a turnkey path to opt in.

You ship three things: (1) `vigil-run`, a CLI binary that mints + injects identity for any subprocess; (2) per-language helper packages so user code can attach identity inline; (3) one doc page per supported harness telling users which path to use.

## Required reading before you write any code

1. `docs/superpowers/specs/2026-05-15-post-pivot-product-cleanup-design.md` — your full mandate. Read every section, especially "Sub-project C." Pay attention to the 3-tier identity model and the harness coverage list.
2. `docs/superpowers/specs/2026-05-15-product-direction-design.md` — strategic frame.
3. `docs/superpowers/specs/2026-05-04-vigil-data-plane-design.md` — canonical product spec; explains how `application_name=vigil:<token>` carries identity into the proxy.
4. `proxy/internal/identity/http.go` — the existing HTTP API for issuing identities (`POST /identities`). `vigil-run` calls this.
5. `proxy/internal/identity/identity.go` — the Issuer + Token shape. Tokens are Ed25519-signed strings prefixed `vigil:`.
6. `proxy/cmd/vigil-proxy/main.go` — confirms the HTTP server runs at `:7878` by default (configurable via `--addr`).

## What you ship — three deliverables

### Deliverable 1 — `vigil-run` CLI binary

A small Go program (~300 lines) that wraps any subprocess, ensuring it runs with a Vigil identity injected via `VIGIL_TOKEN` env var (which the per-language helpers + manual user code can then read).

**Path:** `proxy/cmd/vigil-run/`
- `main.go` — the entry point + arg parsing
- `keychain.go` — token cache helpers (macOS Keychain, Linux libsecret, Windows Credential Manager)
- `*_test.go` — tests

**Usage:**
```bash
vigil-run claude                                   # wraps Claude Code CLI
vigil-run codex                                    # wraps OpenAI Codex
vigil-run python my_script.py                      # wraps a script
vigil-run --principal=costa@example.com claude     # explicit principal
vigil-run --scopes=read,write claude               # explicit scopes
vigil-run --proxy=http://localhost:7878 claude     # custom proxy address
vigil-run --rotate claude                          # force-mint a new token, ignore cache
vigil-run --help                                   # print help
```

**Behavior:**
1. Parse flags + identify the wrapped command + its args
2. Look up cached token in keychain under key `vigil-run:<principal>:<agent_name>`
3. If cache miss OR `--rotate`:
   - HTTP POST to `vigil-proxy`'s `/identities` endpoint with the resolved name/principal/scopes
   - Receive a signed Token
   - Cache it in keychain (with reasonable TTL — match the issuer's token expiration)
4. Set `VIGIL_TOKEN=<token>` in the env
5. `exec` the wrapped command (use `syscall.Exec` so the wrapper process is replaced — clean signal handling, no zombie process)

**Error handling:**
- Vigil proxy not reachable on `--proxy` URL → print clear error explaining "is vigil-proxy running on `:7878`?", exit 2
- Keychain unavailable → fall back to in-memory token (warn user it won't persist across vigil-run invocations)
- Invalid wrapped command → exit code from `exec`

**Auto-resolve agent_name from the wrapped command's basename:**
- `vigil-run claude ...` → agent_name="claude-code"
- `vigil-run codex ...` → agent_name="codex"
- Otherwise → agent_name=basename of the wrapped command (e.g. `python`, `node`)
- Override with `--name=<custom>` flag

### Deliverable 2 — Per-language helper packages

Three small connection-library wrappers, one per language. Each ~50–100 lines plus tests.

**Go: `proxy/clients/go/vigil/`** (Go module `github.com/costaxanthos/vigil/clients/go/vigil`)
- `vigil.go` exposes:
  ```go
  // WrapPgxConfig adds application_name=vigil:<token> to a pgx ConnConfig.
  // Reads VIGIL_TOKEN from env; no-op if env is unset.
  func WrapPgxConfig(cfg *pgx.ConnConfig) *pgx.ConnConfig

  // WrapDSN adds application_name to a Postgres DSN string. Same behavior as
  // WrapPgxConfig but for code that doesn't use pgx config objects.
  func WrapDSN(dsn string) string
  ```
- Single dependency: `github.com/jackc/pgx/v5`
- Tests verify env-on / env-off behavior, that existing application_name is preserved if user already set one

**Python: `proxy/clients/python/vigil/`**
- Publishable to PyPI as `vigil-client` (defer the actual publish — just structure the package)
- `vigil/__init__.py`, `vigil/wrap.py`
- Public API:
  ```python
  from vigil import wrap_psycopg, wrap_dsn

  wrap_psycopg()  # monkey-patches psycopg2 + psycopg3 to inject application_name
  conn_str = wrap_dsn("postgresql://...")  # for SQLAlchemy / asyncpg
  ```
- Reads `VIGIL_TOKEN` env; no-op if unset
- Tests via pytest, mock psycopg2/3

**Node: `proxy/clients/node/vigil/`**
- Publishable to npm as `@vigil/client` (defer the actual publish — just structure)
- `index.js`, `index.d.ts`
- Public API:
  ```javascript
  const { wrapPg, wrapDSN } = require('@vigil/client');
  wrapPg();  // monkey-patches `pg` to inject application_name
  const dsn = wrapDSN("postgres://...");  // for direct connection-string users
  ```
- Reads `VIGIL_TOKEN` env; no-op if unset
- Tests via jest or node:test

Each language helper:
- ~50–100 lines of source
- ≤2 dependencies (the language's standard pg client + nothing else)
- Has its own README with install + 3-line usage snippet
- Lives under `proxy/clients/<lang>/`

### Deliverable 3 — Per-harness docs

One Markdown page per supported harness, in `proxy/docs/harnesses/`. Each page is short (≤200 words) and answers: "I'm a Vigil user using <harness>; what's the easiest way to get my agents identified?"

**Required pages:**
- `proxy/docs/harnesses/claude-code.md` — Claude Code CLI users
- `proxy/docs/harnesses/codex.md` — OpenAI Codex users
- `proxy/docs/harnesses/cursor.md` — Cursor users
- `proxy/docs/harnesses/vscode.md` — VS Code users (Copilot / extension agents)
- `proxy/docs/harnesses/conductor.md` — Conductor users
- `proxy/docs/harnesses/custom.md` — custom scripts using pgx/psycopg/pg directly

Each page follows this template:

```markdown
# Vigil + <Harness>

## How <Harness> talks to your database

(1–2 sentences explaining: it's a CLI / IDE / orchestrator; how the agent's database connections are made.)

## Tier 1 — works automatically (no setup)

When `vigil-proxy` is running and you point your `<harness>` agent at it instead of Postgres directly, the proxy detects `<harness>` from the process tree and tags every audit row + applies the `<harness>` rate-limit pool. **You don't need to do anything beyond installing Vigil and pointing your connection at port 7432.**

## Tier 2 — opt in to richer signed identity (optional)

If you want signed identity (per-principal attribution, custom scopes, future policy enforcement), there are two paths:

**Easiest: wrap the command with `vigil-run`.**

```bash
vigil-run <harness-command>
```

That mints a Vigil identity, caches it in your keychain, and sets `VIGIL_TOKEN` for the wrapped process to read.

**For your own scripts: import the helper.**

(Show 3-line snippet for the harness's likely language(s). Cursor/VS Code/Conductor likely run Python or Node scripts; Claude Code/Codex are CLIs that mostly invoke their own tooling.)

## What gets identified vs. what doesn't

- `<harness>` agent connections from your machine → Tier 1 inferred (always)
- Wrapped via `vigil-run` → Tier 2 declared signed identity
- Containerized / remote → Tier 3 anonymous (still rate-limited and audited, no per-agent attribution)

## Limitations

(1–2 honest sentences about what doesn't work — Docker, remote agents, etc.)
```

Customize each page for the specific harness:
- **claude-code.md**: emphasize `vigil-run claude`, no script integration needed
- **codex.md**: same as claude-code, just `vigil-run codex`
- **cursor.md**: emphasize that Cursor's agents write Python/Node code → import the helper inside that code (or just use Tier 1)
- **vscode.md**: similar to Cursor
- **conductor.md**: explain that Conductor spawns harness commands → wrap each command with `vigil-run` in your Conductor config
- **custom.md**: focus on "set `application_name=vigil:<token>` from env"; show snippets for pgx (Go), psycopg (Python), pg (Node)

## Files you own

New:
- `proxy/cmd/vigil-run/` — CLI binary source
- `proxy/clients/go/vigil/` — Go helper package
- `proxy/clients/python/vigil/` — Python helper package
- `proxy/clients/node/vigil/` — Node helper package
- `proxy/docs/harnesses/*.md` — six harness doc pages

Modify:
- `proxy/Makefile` — add `make build-vigil-run` target; include `vigil-run` in `make release` and `release-all` matrix builds
- `proxy/dist/homebrew/vigil.rb` — formula installs BOTH `vigil-proxy` and `vigil-run` (currently installs only `vigil-proxy`)
- `proxy/README.md` — add "Identity" section explaining the three tiers + linking to the harness docs

## Files you MUST NOT touch

- `proxy/internal/` — your work is at the cmd/ level + new clients/ + new docs; no internal modifications needed
- `app/`, `daemon/` (deleted by Sub-project A), `site/`, anything in `docs/superpowers/specs/` or `docs/launch/` or `docs/qa/`
- The proxy bench harness — your wrapper isn't load-bearing for the bench

## Acceptance criteria

1. **`vigil-run claude` works end-to-end.** Running it spawns Claude Code (or any wrapped command) with `VIGIL_TOKEN` set; the wrapped command's database connections (when the helper or manual code uses the env var) carry identity → audit rows have `agent_source='declared'` and a populated `agent_id`.
2. **Token caching works across invocations.** Second `vigil-run claude` call uses the same token from keychain; doesn't re-mint.
3. **`vigil-run --rotate claude` forces re-mint.**
4. **Cross-platform builds.** `vigil-run` builds for darwin/arm64, darwin/amd64, linux/amd64, linux/arm64. Released alongside `vigil-proxy` via the same release.yml workflow.
5. **Helper packages work end-to-end with their respective DB clients.**
   - Go: write a small program that calls `WrapPgxConfig` + connects via pgx to a Postgres → verify the Postgres-side `pg_stat_activity` shows the application_name carrying the Vigil token.
   - Python: same for psycopg2 + psycopg3.
   - Node: same for `pg`.
6. **Helper packages are no-ops without VIGIL_TOKEN env.** Tests verify: env unset → connection works as if helper wasn't called.
7. **Each helper has its own README + CHANGELOG starter + license.**
8. **Per-harness docs exist** for all six (claude-code, codex, cursor, vscode, conductor, custom).
9. **README integration.** `proxy/README.md` has a new "Identity" section linking to `docs/harnesses/`.
10. **Homebrew formula installs both binaries.** `brew install vigil` puts both `vigil-proxy` and `vigil-run` on PATH.
11. **`go test ./...` passes** for the proxy + new wrapper + new Go helper.
12. **Python tests pass** under pytest in CI (add a `proxy/clients/python/Makefile` target or just document `make test-python`).
13. **Node tests pass** under `npm test` in `proxy/clients/node/vigil/`.

## Out of scope

- The Rip (Sub-project A) — separate
- Process introspection (Sub-project B) — separate
- Native Cursor / VS Code extensions — deferred until users ask
- Conductor SDK plugin — deferred until users ask
- Publishing to PyPI / npm registries — defer until v0.2; the packages exist in-repo for now
- A `vigil-run --watch` mode that re-wraps if the token expires mid-run — defer
- Windows full support (helpers should still work; just no Windows Credential Manager integration in v1)
- The MCP server — separate concern
- Marketing the wrapper / helpers on the website — separate copy task

## Edge cases + gotchas

- **Keychain on macOS without Keychain Access prompt.** Use the `keychain` Go library `github.com/keybase/go-keychain` or `github.com/zalando/go-keyring` (which abstracts macOS/Linux/Windows).
- **`syscall.Exec` vs `exec.Cmd`.** Use `syscall.Exec` so the wrapper PID is replaced by the wrapped command's PID — important so process introspection (Sub-project B) sees the real command, not vigil-run, as the connection's source.
- **Token expiration.** The Issuer's tokens have an expiration. The wrapper should mint fresh on cache miss OR when the cached token's expiration is within 1 hour of now.
- **Helper packages and existing `application_name`.** If user code already sets `application_name=my-app`, the helper should preserve it (`application_name=my-app:vigil:<token>` or just don't override). Document the behavior choice.
- **Vigil proxy not running.** `vigil-run`'s HTTP call to `/identities` will fail. Print: "vigil-proxy is not running. Start it with `vigil-proxy --postgres-listen :7432 --postgres-upstream localhost:5432` and try again." Exit 2.
- **Inheriting env.** The wrapped process inherits the wrapper's env, including `VIGIL_TOKEN`. Make sure no other VIGIL_* vars accidentally leak.
- **Conductor + vigil-run.** Conductor users will configure their agent commands as e.g. `vigil-run claude --some-flag`. Make sure `vigil-run`'s arg parsing terminates after the first non-flag token (everything after that is the wrapped command).

## How to know you are done

- A user can install Vigil, start the proxy, run `vigil-run claude`, do real work, and see Claude Code session traffic show up in the audit table with `agent_source='declared'`, the right `agent_id`, and an Anthropic-API-key-style principal
- A Python user can `from vigil import wrap_psycopg; wrap_psycopg()` once at the top of their script and have the rest of their psycopg connections carry identity
- The 6 harness doc pages are in place, each follows the template, each is honest about what works and what doesn't
- `brew install vigil` puts both binaries on PATH
- The PR's screenshots show the Tauri app's Audit feed with `agent_source='declared'` rows attributed to the identity vigil-run minted

## When you finish

Open a PR against `main`. Lead reviews with the cleanup spec open. Critique focuses on (a) wrapper UX (does `vigil-run claude` Just Work?), (b) helper-package APIs feeling natural in their respective ecosystems, (c) doc clarity for the 6 harnesses.

## When you get stuck

If the keychain library you pick has poor Linux support, fall back to a plain ~/.config/vigil/token file (mode 0600). Document the fallback. Cross-platform secrets storage is genuinely annoying.

If the Python or Node helper monkey-patching turns out fragile (different versions of psycopg behave differently), prefer a pure wrapper function `from vigil import wrap_dsn; conn = psycopg.connect(wrap_dsn(my_dsn))` over a global monkey-patch. Document the trade-off in the helper's README.

If you find that integrating with one harness requires knowledge you don't have (e.g., Conductor's actual command-spawning mechanism), write the doc page with a `<TODO: confirm with Costa>` placeholder rather than fabricating; lead will fill it in.
