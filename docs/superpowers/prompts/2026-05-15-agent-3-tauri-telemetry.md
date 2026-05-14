# Conductor Prompt — Agent 3: Tauri polish + real telemetry

You are working on **Vigil**, an agent-aware data plane proxy. Your job is to light up the placeholder counters in the Tauri Proxy tab with real numbers from the new audit `decision` column, plus polish the first-launch experience so a fresh install feels like a product, not a developer fallback.

**Two other agents are working in parallel.** Agent 1 is shipping rate limiting (writes audit `decision='rate_limited'`). Agent 2 is shipping coalescing (writes audit `decision='coalesced'`). Both columns exist in the schema as of the prep PR. Your tab reads them. Zero file overlap with either.

## Required reading before you write any code

1. `docs/superpowers/specs/2026-05-15-three-agent-push-v01c-v01d-design.md` — this push's spec, your stream section.
2. `docs/superpowers/specs/2026-05-04-vigil-data-plane-design.md` — canonical product spec.
3. `app/src/components/proxy/` — the entire Proxy tab as it exists today. Especially `CountersPane.tsx`, `AuditFeed.tsx`, `useProxyData.ts`.
4. `app/src-tauri/src/proxy.rs` — the existing read-only Tauri commands.
5. The new audit schema (added in prep PR): the `decision` column with values `'allowed'` / `'rate_limited'` / `'coalesced'`.

## What you ship

Five things, in priority order:

### 1. Real counter math
Today the "Queries deduped" and "Queries rate-limited" cells in `CountersPane.tsx` show placeholder zeros. Make them real:
- Update `app/src-tauri/src/proxy.rs::proxy_counters()` to compute three counts per agent:
  - `total_today` (existing): queries today
  - `coalesced_today` (new): `WHERE decision='coalesced' AND ts > today`
  - `rate_limited_today` (new): `WHERE decision='rate_limited' AND ts > today`
- Update the Rust `ProxyCounter` struct + TS `ProxyCounter` type accordingly.
- Display in the existing 3-column grid layout — don't introduce new layout.

### 2. Decision filter wiring
The audit feed toolbar already has a `decision` dropdown that's wired to a placeholder. Make it functional:
- Options: `All` (default), `Allowed`, `Coalesced`, `Rate limited`.
- Selecting an option passes the value into the Tauri call as part of `filter`.
- `read_proxy_db` adds `AND decision = ?` to its SQL when the filter is non-null.
- Filter happens server-side (in Rust SQLite query), not client-side, because the user might want to filter a 10k-row audit table down to just the rate-limited ones.

### 3. Real-time refresh
- Add polling: every 2 seconds, refire the audit-feed query in the background. Append new rows to the existing list without losing scroll position.
- Show a small "Live" indicator (subtle pulsing dot) in the audit feed header when polling is active.
- Polling is OFF when in fixture mode (`status?.fixture_mode === true`).
- Polling stops on tab unmount.
- Prefer the existing `useProxyData` hook structure — add an interval inside the existing effect, don't introduce a new top-level state.

### 4. First-launch / onboarding panel
When `~/.vigil/proxy.db` doesn't exist, the tab today shows fixture data with a small banner saying "Fixture data — proxy not running." Replace with a proper onboarding panel:
- Headline: "No proxy running yet."
- Subtext: "Vigil sits between your AI agents and your databases. Once you start the proxy, every query will appear here — identified, audited, and shaped."
- A 3-step quickstart:
  ```bash
  brew install vigil                          # 1. install
  vigil-proxy \
    --postgres-listen :7432 \
    --postgres-upstream localhost:5432        # 2. start
                                              # 3. point your client at :7432
  ```
- Each command in a copy-on-click code block.
- Below: a link to the GitHub README for the full guide.
- Below that: a faint "or try the demo dashboard with fixture data →" link that switches to fixture mode (today's default behavior).

This makes the tab look intentional on first launch, not broken.

### 5. Counter delta animation
When a counter value transitions (e.g., 5 → 6 because polling caught a new dedup), briefly highlight the cell:
- Add a subtle background color flash (cyan-50 or similar) for ~400ms.
- Use a CSS transition or Framer Motion if it's already in the app.
- Don't animate the initial render — only delta transitions.

## Files you own

Existing files (modify):
- `app/src/components/proxy/CountersPane.tsx`
- `app/src/components/proxy/AuditFeed.tsx`
- `app/src/components/proxy/useProxyData.ts`
- `app/src/components/proxy/ProxyPane.tsx` (if needed for fixture-mode swap)
- `app/src-tauri/src/proxy.rs`
- `app/src/types.ts` — additive only: `Decision` union type, expanded `ProxyCounter` shape.

New files:
- `app/src/components/proxy/EmptyStateOnboarding.tsx` — the first-launch panel.
- Tests in `app/src/components/proxy/__tests__/` for new behaviors.

## Files you MUST NOT touch

- `app/src/components/layout/` — other tabs. Additive work only.
- `app/src/components/proxy/__tests__/ProxyPane.test.tsx` — keep existing tests passing; add NEW tests in NEW files for new behaviors. Don't rewrite existing tests.
- `proxy/`, `daemon/`, `site/` — out of scope.

## Acceptance criteria (all must pass in CI)

1. **Real counter math.** Given fixture audit data with 100 allowed + 30 coalesced + 5 rate-limited rows for agent `cc`, CountersPane displays `100 / 30 / 5` for that agent.
2. **Decision filter end-to-end.** Selecting `Coalesced` in the dropdown causes `read_proxy_db` to receive `filter.decision = 'coalesced'` and the SQL applies the filter. Verified with a Tauri unit test asserting on the SQL or on the row count returned.
3. **Polling.** With a real DB connected, polling fires every 2s. Mocked-time test asserts the Tauri command is invoked twice in 4 seconds.
4. **Polling stops on unmount.** Unmount the ProxyPane → confirm no further invokes after unmount tick.
5. **Polling off in fixture mode.** With `fixture_mode=true`, no polling occurs.
6. **Empty state renders.** With no proxy.db on disk, EmptyStateOnboarding renders. The 3 commands appear. Snapshot test asserts content stable.
7. **Demo fallback link.** Clicking "or try the demo dashboard..." switches to fixture mode and shows the existing fixture-data tab UI.
8. **Counter delta animation.** Counter value changes from N to N+1 → cell receives the highlight class for ~400ms then drops it. Tested via class assertion at +200ms and +500ms.
9. **Regression bar.** All 178 existing npm tests + 28 cargo tests still pass.

## Out of scope

- Charts (line chart of dedup-over-time would be nice — that's v0.2.0).
- Writing to proxy.db from the app.
- New top-level tabs.
- Theming changes — match existing styles.
- Onboarding panel for the empty Identities or Audit panes (the top-level proxy.db missing case is the only empty state we handle this round).

## How to know you are done

- All 9 acceptance tests pass.
- A 30-second screen recording demonstrates: (a) launch app with no proxy.db → see onboarding panel, (b) start a real proxy + run psql + watch counters and feed light up live, (c) filter to "Coalesced", (d) see counter flash on a new dedup. Attach the recording to the PR.

## When you finish

Open a PR, request review from the lead agent. Your work can merge anytime — the new audit `decision` column exists from prep, so even if Agents 1 and 2 haven't merged yet, your filters and counters work correctly (just always show 0 for coalesced/rate-limited until the proxy starts writing them).

## When you get stuck

Two likely stuck points:

1. **Polling without breaking scroll position.** When new rows arrive, do NOT reset the virtualized list scroll. Append rows to the existing array; the virtualizer should keep the user's scroll position. If it doesn't, document the bug and ship a "load more" button as v1 polish — the polling discovery still works.

2. **Counter animation jank.** If Framer Motion isn't already in the app, don't add it just for this. CSS transitions on a `data-flash` attribute toggled via setTimeout is fine. Keep dependencies minimal.
