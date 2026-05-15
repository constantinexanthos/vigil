# Conductor Prompt — Agent: Install + Perf Polish (Tailscale-tier pass)

You are working on **Vigil**, an agent-aware data plane proxy. Your job is to take the install + first-30-seconds experience from "works if you know Go" to "Tailscale-tier" — `brew install vigil` and you're running.

This is the Layer 1 polish per the product direction doc. The premier reference is **Tailscale + sqlite**: single binary, zero ceremony, works in 30 seconds, you can read the source. The current state isn't bad — `go build` produces a 14MB debug binary that works. The gap to Tailscale-tier is: a Homebrew formula, a stripped release binary, defaults that produce clean numbers without operator tuning, and a README install snippet that just works.

## Required reading before you write any code

1. `docs/superpowers/specs/2026-05-15-product-direction-design.md` — the strategic frame. Layer 1 section + the three winning dimensions. Install simplicity is dimension #1.
2. `proxy/README.md` — the current install story. Note where `brew install vigil` is implied but not yet real.
3. `proxy/cmd/vigil-proxy/main.go` — defaults you may need to tune.
4. `proxy/internal/ratelimit/ratelimit.go` + `config.go` — default pool sizes; note that the `agents` pool of 100/50 is what's currently throttling the bench.
5. `proxy/bench/RESULTS.md` — current numbers. The integrated 63.64% dedup is real but the 22ms p50 is dominated by rate-limit waiting. After your tuning, the number that goes on the homepage should be honest *and* favorable.
6. Homebrew formula docs: https://docs.brew.sh/Formula-Cookbook — read the section on Go formulae and on creating a tap.

## What you ship

Five things, in priority order:

### 1. Homebrew formula (in a tap repo)

Vigil isn't notable enough yet for `homebrew-core`. Standard path: create a tap (a separate GitHub repo named `homebrew-vigil` under `constantinexanthos`) and host the formula there. Then users do:

```bash
brew tap constantinexanthos/vigil
brew install vigil
```

Or as a one-liner: `brew install constantinexanthos/vigil/vigil` (no separate `tap` step).

**Deliverables:**
- Formula file (`vigil.rb`) drafted in a new file `proxy/dist/homebrew/vigil.rb` (this PR doesn't push to the tap repo — that's a manual step Costa owns. The formula lives here as the source of truth, and you document the manual tap-publish steps in `proxy/dist/homebrew/README.md`).
- Formula uses `go install` build pattern with `-ldflags="-s -w"` for stripping.
- Installs the binary to the default Homebrew prefix.
- `brew test` runs `vigil-proxy --version` and asserts it succeeds.
- Documents how to bump the formula's `version` and `sha256` for future releases.

### 2. Stripped release binary

Default `go build` is unstripped (debug symbols, DWARF, large). Add a `Makefile` target `make release` that:

- Builds with `-ldflags="-s -w"` (strip symbol table + DWARF debug info)
- Builds with `-trimpath` (no embedded build paths — privacy + reproducibility)
- Outputs to `dist/vigil-proxy-<version>-<os>-<arch>` (e.g. `dist/vigil-proxy-v0.1.0d-darwin-arm64`)
- Asserts the resulting binary is ≤8MB (currently ~14MB unstripped)
- Computes and prints the SHA256 (used by the Homebrew formula bump)

For multi-arch:
- `make release-all` builds darwin-arm64, darwin-amd64, linux-amd64, linux-arm64 (cross-compile via `GOOS`/`GOARCH`)
- Each binary asserted ≤8MB

### 3. Default tuning so bench numbers don't get dominated by rate-limit

The integrated trunk bench shows 22ms p50 because the bench's identity goes into the `agents` pool (100 burst / 50 refill/sec). The bench fires more than 50 q/sec, so it spends most of its time waiting for refill. That's rate-limiting working as designed but it muddies the dedup story.

**Two options, do one:**

A. **Bump default `agents` pool refill** to 500/sec (match `production`). Reasoning: the pool is meant as default-safe-for-development, not strict throttling. Operators who want strict throttling configure it via YAML. The default should pass-through unless explicitly limited.

B. **Add a special "bench mode"** that the bench harness opts into: when the bench startup includes `application_name=vigil:bench` (or similar), the proxy assigns a higher-throughput pool. Cleaner conceptually but more code.

**Recommendation: A.** Bump default refill to 500/sec. Document the change in the README. The default is meant to detect a runaway agent, not to throttle normal use.

After the change, re-run `make bench` and update `proxy/bench/RESULTS.md` with the new numbers. Target: dedup% holds (≥40% on refactor) AND proxy p50 drops back below 1ms.

### 4. Install snippet in the README

Update `proxy/README.md` and root `README.md`. The first thing visitors see should be:

```bash
brew install constantinexanthos/vigil/vigil
vigil-proxy --postgres-listen :7432 --postgres-upstream localhost:5432
```

That's it. Then Postgres clients connect to `:7432` and audit/dedup happens automatically. Anything more in the headline install is too much.

A "From source" section below for Go developers: `go install github.com/constantinexanthos/vigil/proxy/cmd/vigil-proxy@latest`.

A "Linux" section: download the binary from GitHub Releases (which you'll set up in deliverable #5).

### 5. GitHub Releases automation

A GitHub Actions workflow (`.github/workflows/release.yml`) that:

- Triggers on tags matching `v*.*.*` (e.g. `v0.1.0d`)
- Builds release binaries for all 4 platforms (darwin-arm64/amd64, linux-arm64/amd64)
- Computes SHA256 for each
- Creates a GitHub Release with the binaries attached and a release-notes template
- Outputs the SHA256s in the workflow log so the formula bump is one copy-paste

This means future releases are: `git tag v0.1.0e && git push --tags` → GitHub builds + publishes → bump formula manually with the SHA256.

## Files you own

New:
- `proxy/dist/homebrew/vigil.rb` — the Homebrew formula (source of truth; manually pushed to tap)
- `proxy/dist/homebrew/README.md` — how to publish a formula update to the tap repo
- `Makefile` — additive: `release`, `release-all` targets (the `bench` target already exists from PR #12; preserve it)
- `.github/workflows/release.yml` — release automation

Modify:
- `proxy/internal/ratelimit/ratelimit.go` (or `config.go`) — bump default `agents` pool refill to 500/sec
- `proxy/bench/RESULTS.md` — re-run bench, commit new numbers
- `proxy/README.md` — install snippet at the top
- Root `README.md` (if it exists; create if not) — same install snippet, plus the bevigil.ai link

## Files you MUST NOT touch

- `proxy/internal/coalesce/`, `proxy/internal/pgproxy/`, `proxy/internal/audit/`, `proxy/internal/identity/` — feature code is stable
- `app/`, `daemon/`, `site/` — out of scope
- The bench harness internals (`proxy/bench/internal/`) — only the resulting `RESULTS.md` changes

## Acceptance criteria

1. **Binary size.** `make release` produces a binary ≤8MB. Verify via `ls -lh dist/`.
2. **Cold start.** `time vigil-proxy --version` runs in <100ms on a developer laptop.
3. **`brew install` works.** Running `brew install --build-from-source proxy/dist/homebrew/vigil.rb` (after manual setup of a local tap) installs the binary and `brew test vigil` passes. Document the steps in the PR body so the lead can verify.
4. **Bench numbers favorable.** After the default rate-limit bump, `make bench BENCH_PRESET=refactor` reports:
   - dedup% ≥ 40% (the spec bar)
   - proxy p50 < 1ms (no longer dominated by rate-limit waiting)
   - `RESULTS.md` reflects the new numbers
5. **README install snippet.** The first code block in `proxy/README.md` is the 2-line `brew install` + `vigil-proxy ...` snippet. No prerequisites paragraph above it.
6. **Multi-arch builds.** `make release-all` produces 4 binaries, each ≤8MB. Verified by listing the dist/ contents.
7. **GitHub Actions workflow valid.** `actionlint` (or just visual review of the YAML) shows no syntax errors. The workflow doesn't actually run in CI for this PR (no tag), but the file is correct.
8. **No regression in existing tests.** Full Go suite still green: `go test ./...`.

## Out of scope

- Pushing to the tap repo (manual step Costa owns; this PR creates the formula source-of-truth file only)
- macOS notarization (deferred — tap-installed binaries are unsigned for v1; users get the Gatekeeper warning once and approve)
- Snap / apt / rpm / Chocolatey packages (Linux for now is "download the binary"; package managers come after adoption signal)
- Auto-update mechanism (`vigil-proxy --upgrade`) — defer
- Telemetry / phone-home — defer (and probably never; the product is local-first and we shouldn't violate that)

## How to know you are done

- Someone who has never used Vigil opens the README, runs the 2 commands, and is auditing Postgres queries within 60 seconds. Test this: ask a friend / colleague who's never seen Vigil to follow only the README. Time them. If it takes >60s, the README needs more work.
- The bench numbers in `RESULTS.md` are honest and favorable — what we'd quote on the homepage without an asterisk.
- The release workflow YAML is correct. (Costa will tag a version after this PR merges; that's when the workflow first runs.)

## When you finish

Open a PR against `main`. Lead reviews with the direction doc open. The first question they'll ask: "did you run the README from scratch on a clean machine?" — be ready to answer.

## When you get stuck

The most likely stuck point is the Homebrew formula's go-build invocation. Look at how other Go projects publish formulae (e.g. `bat`, `fzf`, `ripgrep`) — their `.rb` files are in the homebrew-core repo and are good references. Don't try to invent the pattern.

If the multi-arch cross-compile breaks for cgo reasons, the proxy uses `modernc.org/sqlite` (pure Go, no cgo) explicitly to avoid this — verify by `go env CGO_ENABLED` is `0` during the release build. If something else dragged in cgo, find it and remove it.
