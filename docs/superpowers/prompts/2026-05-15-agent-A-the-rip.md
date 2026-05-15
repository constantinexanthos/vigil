# Conductor Prompt — Agent A: The Rip (delete pre-pivot daemon + LLM gate + Sessions tab)

You are working on **Vigil**, an agent-aware Postgres data-plane proxy. Vigil pivoted on 2026-05-04 from "FS-watcher with LLM-summarized session view" to "agent-aware Postgres proxy." The proxy stack ships clean, but the Tauri app and surrounding chrome still carry pre-pivot baggage that is actively harming the product.

**Your job:** rip every trace of the pre-pivot product surfaces out of the codebase. The Tauri app should launch straight to the Proxy/Overview tabs with NO onboarding gate. The FS-watcher daemon (`daemon/` directory) gets deleted entirely. Marketing copy aligned with shipped reality.

**You produce a clean repo, not new features.** Costa explicitly diverted the "delete daemon entirely" call to the lead agent — the answer is yes, delete it. Git preserves it if we ever want pieces back.

## Required reading before you write any code

1. `docs/superpowers/specs/2026-05-15-post-pivot-product-cleanup-design.md` — your full mandate. Read every section. The "Sub-project A — The Rip" section is your literal job description.
2. `docs/superpowers/specs/2026-05-15-product-direction-design.md` — strategic frame. Vigil's three layers; what each is supposed to be after cleanup.
3. `docs/superpowers/specs/2026-05-04-vigil-data-plane-design.md` — the canonical product spec. Confirms the daemon is now Non-Goal.
4. `docs/qa/2026-05-15-first-user-experience-report.md` — bug list from QA. Several P1s are app-UX bugs that this rip naturally fixes (LLM gate, "daemon not reachable" banner).
5. `app/src/App.tsx` — top-level routing; this is where the LLM onboarding gate lives.
6. `app/src/components/Onboarding.tsx` — the gate itself. Gets deleted.
7. `app/src/components/TopBar.tsx` — has Overview / Session / Proxy tabs. Session tab gets removed.
8. `app/src/components/layout/MiddlePane.tsx` — renders Overview vs Session content. Session-detail rendering removed.
9. `daemon/` — entire directory. Goes away.
10. `proxy/README.md` and root `README.md` — copy edits.
11. `site/src/components/bevigil/home-view.tsx`, `content.ts` — verify post-rip copy still tells the truth (the P0 bundle in PR #39 already did the blast-radius fix; you make sure no FS-watcher claims remain).

## What you ship

A single PR named `feat(rip): kill pre-pivot daemon + LLM gate + Sessions tab` (or similar). It does the following:

### 1. Delete the FS-watcher daemon

- Remove the entire `daemon/` directory at the repo root: `git rm -r daemon/`
- This includes Cargo manifests, all Rust source, daemon-specific tests, screenshots/marketing assets sitting under `daemon/`
- If root-level `Cargo.toml` (workspace) or any other build config references `daemon/`, remove those references
- Verify: `cargo build --workspace` (or whatever the build entry is) succeeds without daemon

### 2. Remove the LLM onboarding gate from the Tauri app

- Delete `app/src/components/Onboarding.tsx` entirely (the "Connect a Claude to get started" panel)
- Delete `app/src/__tests__/onboarding-*.test.tsx` and any related test files
- In `app/src/App.tsx`, remove ALL gate logic — the app should render the Overview/Proxy tabs directly on first launch, no conditional rendering on "do we have an LLM configured"
- Remove any Tauri commands related to LLM detection (`detect_claude_code`, `detect_codex`, `save_api_key_to_keychain`, etc.) — both the Rust-side handlers in `app/src-tauri/src/` and the JS-side wrappers
- Remove keychain integration code if it's only used by the LLM onboarding (verify it's not used by anything else first; the proxy has its own identity store and doesn't need keychain)

### 3. Remove the Sessions tab

- Remove the "Session" tab button from `app/src/components/TopBar.tsx`
- Remove `viewMode === "session"` rendering from `app/src/components/layout/MiddlePane.tsx`
- Update `app/src/store/selection.ts`: `ViewMode = "overview" | "proxy"` (drop "session")
- Delete components used ONLY for the Sessions tab — verify usage with grep before deleting:
  - `app/src/components/SessionHeader.tsx`
  - `app/src/components/SessionFooter.tsx`
  - `app/src/components/SessionRow.tsx` (if no longer used by LeftRail; check)
  - `app/src/components/MilestoneFeed.tsx`
  - `app/src/components/SummaryBlock.tsx`
  - `app/src/components/ActivityStream.tsx`
  - `app/src/components/DiffViewer.tsx`
  - `app/src/components/ConfidenceDonut.tsx`
  - `app/src/components/PulseLine.tsx`
  - `app/src/components/CommandPalette.tsx` if it ONLY surfaces session-related commands (verify)
- Delete corresponding tests for any deleted component
- The LeftRail (Sessions sidebar) was already showing daemon-derived sessions. Two options:
  - **A — Keep LeftRail and re-purpose to show Proxy-derived agent groupings** (read from audit table, group by agent_id). Bigger work.
  - **B — Delete LeftRail entirely.** The Overview tab's Active Agents pane already shows similar info from proxy data. Cleaner.
  - **Pick B unless A looks trivially reusable.** Document your call in the PR.

### 4. Remove daemon-related Tauri backend code

- `app/src-tauri/src/` — remove any commands that read from a daemon-managed DB (the daemon used `~/.vigil/db.db` or similar; the proxy uses `~/.vigil/proxy.db` which stays). Specifically anything related to "sessions," "milestones," "activity stream," "summarization" goes away
- Update `app/src-tauri/Cargo.toml` to drop dependencies that were only used by daemon-related code
- The proxy-tab commands (`read_proxy_db`, `list_identities`, `proxy_counters`, `proxy_status`) STAY — those are the new product

### 5. Update READMEs

- `proxy/README.md`: scan for any FS-watching language; remove. The install snippet at the top stays.
- Root `README.md`: same.
- Make sure no README claims Vigil watches files, summarizes sessions, integrates with Claude Code via OAuth, or anything pre-pivot. Vigil is a Postgres proxy.

### 6. Verify site copy

The P0 bundle (PR #39) already removed `blast-radius control` from the hero list and marked the primitive as "coming next." Your job:
- Re-read `site/src/components/bevigil/home-view.tsx` and `content.ts`
- Make sure NO FS-watcher claim remains (e.g., "watches your files," "summarizes agent sessions," "Claude Code integration")
- If you find any, edit them out — same pattern as the P0 bundle's blast-radius removal
- The 5 primitives stay (identity, rate-limit, coalesce, blast-radius-with-coming-soon-tag, audit) — those are accurate

### 7. Update the Tauri app's empty/onboarding state

After ripping the LLM gate, the app needs SOMETHING to show on first launch when `~/.vigil/proxy.db` doesn't exist yet. The Proxy tab's `EmptyStateOnboarding` (in `app/src/components/proxy/`) already exists for this — it has the 3-command quickstart. Re-use it as the app's first-launch view, not just the Proxy tab's. Specifically:
- Move/promote `EmptyStateOnboarding` from `app/src/components/proxy/` to `app/src/components/` (if it makes sense layout-wise)
- Have it render at the App level when neither `~/.vigil/proxy.db` exists nor the daemon is running (since the daemon is now gone, the condition simplifies to "no proxy.db")
- Document the "if you haven't started the proxy yet, here's the 3-command quickstart" path

## Files you own

This is a deletion-heavy PR. You own:

- `daemon/` — DELETE entirely
- `app/src/components/Onboarding.tsx` — DELETE
- `app/src/components/Session*.tsx` — DELETE (verify each isn't used elsewhere first)
- `app/src/components/MilestoneFeed.tsx`, `SummaryBlock.tsx`, `ActivityStream.tsx`, `DiffViewer.tsx`, `ConfidenceDonut.tsx`, `PulseLine.tsx` — DELETE if Sessions-only
- `app/src/components/CommandPalette.tsx` — DELETE if Sessions-only (likely yes; verify)
- `app/src/components/layout/LeftRail.tsx` — DELETE (per Option B above) OR re-purpose
- `app/src-tauri/src/sessions*.rs`, `app/src-tauri/src/llm*.rs`, etc. — DELETE
- `app/src-tauri/src/keychain*.rs` — DELETE if only used by LLM onboarding
- `app/src/__tests__/onboarding*.test.tsx`, `session*.test.tsx`, `confidence*.test.tsx`, etc. — DELETE corresponding tests
- `app/src/App.tsx` — MODIFY: remove gate logic, route directly to Overview/Proxy tabs, render EmptyStateOnboarding when proxy.db missing
- `app/src/components/TopBar.tsx` — MODIFY: remove Session tab button
- `app/src/components/layout/MiddlePane.tsx` — MODIFY: remove Session detail render branch
- `app/src/store/selection.ts` — MODIFY: drop "session" from ViewMode union
- `app/src/types.ts` — MODIFY: remove session-related types if they're now dead
- `app/src-tauri/Cargo.toml` — MODIFY: drop daemon-specific deps
- `app/src-tauri/src/lib.rs` or `main.rs` — MODIFY: remove command registrations for deleted handlers
- `proxy/README.md`, root `README.md` — MODIFY: remove FS-watcher language
- `site/src/components/bevigil/home-view.tsx`, `content.ts` — MODIFY: verify no remaining FS-watcher claims

## Files you MUST NOT touch

- `proxy/` — entire proxy stack is the new product; do not touch ANY proxy code (`internal/`, `cmd/`, `dist/`, `bench/`)
- `app/src/components/proxy/` — the Proxy tab is the new product; touched only minimally if EmptyStateOnboarding moves
- `docs/superpowers/specs/`, `docs/superpowers/prompts/`, `docs/qa/`, `docs/launch/` — these are reference / launch artifacts; leave alone
- `.github/workflows/release.yml`, `proxy/dist/homebrew/vigil.rb` — release plumbing, no changes needed
- `proxy/bench/RESULTS.md` — benchmarks live untouched

## Acceptance criteria (all must pass in CI before opening the PR)

1. **`daemon/` does not exist.** `ls daemon` returns "no such directory."
2. **No Onboarding gate.** Tauri app launches to Overview tab on first run with no LLM-related panel anywhere.
3. **No Session tab.** TopBar shows only Overview and Proxy buttons (and the connection-status dot).
4. **`cargo build --workspace`** (or whichever root build command) succeeds without daemon.
5. **`go test ./...` in `proxy/`** passes — proxy is untouched, must still pass.
6. **`npm test --run` in `app/`** passes — surviving tests pass; deleted tests are gone (not just `.skip`-ed).
7. **`cargo test --bin vigil-app` in `app/src-tauri/`** passes.
8. **`tsc --noEmit` in `app/`** passes — no dangling type imports from deleted files.
9. **`tsc --noEmit` in `site/`** passes — no broken imports if you touched site copy.
10. **`grep -ri "claude code\|claude_code\|claude-code-cli\|llm.*summar\|file.*watch" proxy/README.md README.md` returns nothing** — no FS-watcher language survives in READMEs.
11. **App size shrinks.** Document the before/after in the PR body — `cargo build --release && du -h target/release/vigil-app` should be smaller after.
12. **Bundle size shrinks.** `npm run build` in `app/` produces a smaller JS bundle than before. Document.
13. **First-launch flow.** When `~/.vigil/proxy.db` doesn't exist, the app shows the 3-command quickstart panel (re-using EmptyStateOnboarding). When it exists, the app launches to the Overview tab. No "Connect a Claude" panel anywhere.

## Out of scope (do not implement)

- Process introspection / agent identity detection — that's Sub-project B
- `vigil-run` wrapper — that's Sub-project C
- Per-harness docs — that's Sub-project C
- New features in the Overview or Proxy tabs
- Refactoring beyond what's needed to delete cleanly
- Tauri app visual polish (already done in PR #33)
- Touching the proxy stack
- Bug fixes outside the strategic rip (smoothness P1s like the 11/100 connection drop are tracked but not for this PR — sub-project B handles them)

## Edge cases + gotchas

- **CommandPalette deletion.** Verify it's not used for proxy-tab navigation before deleting. Grep for `CommandPalette` imports across the app.
- **LeftRail / SessionRow / HostGroup.** These were the "watch host activity" sidebar from the daemon. Without the daemon there's no host activity to watch. Delete unless you find them being repurposed for something else.
- **Existing tests that reference deleted components.** Don't `.skip` — actually delete the test files. A green test that doesn't run isn't green.
- **Cargo workspace.** If `Cargo.toml` at root declares `[workspace]` with `members = ["daemon", "app/src-tauri"]`, drop "daemon" from members.
- **`AgentGlyph.tsx` and `agent-logos.ts`.** Probably still useful (the Proxy tab's audit feed shows agent logos). Verify before considering deletion.
- **Daemon screenshots and marketing PNGs in `daemon/`.** Gone with the directory deletion. Site uses its own assets in `site/public/`.

## How to know you are done

- `ls daemon` says "no such directory"
- Tauri app launches without any Connect-a-Claude / API-key / Codex CLI panel
- TopBar has only Overview and Proxy
- Full test suite passes
- Bundle + binary sizes documented as smaller in the PR body
- A 30-second video / GIF of "fresh launch → see EmptyStateOnboarding → start proxy → see real audit data" attached to the PR (or screenshot equivalent if recording isn't possible from your environment — note the gap honestly)

## When you finish

Open a PR against `main`. Lead reviews with the cleanup spec open. Critique will name any FS-watcher / LLM-onboarding artifacts that survived. Be ready to iterate.

## When you get stuck

If a deletion would break something that turns out to be load-bearing (e.g., the Proxy tab depends on a daemon-derived type), STOP and write up the dependency in a draft PR. Don't blindly add code to keep it working — the answer is usually "rip the dependency too" but the lead needs to confirm.

If `cargo build --workspace` fails after deleting `daemon/`, the workspace config still references it. Fix the workspace config before continuing.

If you find yourself wanting to "preserve" some pre-pivot code "just in case," resist. Git preserves everything. The point of this PR is to make the active codebase match the post-pivot product, period.
