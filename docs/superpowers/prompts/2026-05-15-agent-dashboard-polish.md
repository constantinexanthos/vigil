# Conductor Prompt — Agent: Dashboard Polish (Linear-tier pass)

You are working on **Vigil**, an agent-aware data plane proxy. Your job is to take the Tauri Proxy tab (Layer 3 of the product) from "functional" to "Linear + Honeycomb-tier" — the kind of dashboard people screenshot and tweet about.

This is a **taste pass**, not a feature pass. The information already on screen stays on screen; how it looks, how dense it is, and how the eye moves through it gets a complete redesign. Premier reference: open Linear's Issues view in another tab and look at how much information fits per screen without feeling crowded. That's the bar.

## Required reading before you write any code

1. `docs/superpowers/specs/2026-05-15-product-direction-design.md` — the strategic frame. Pay attention to the Layer 3 section ("operator-facing surface") and the "Premier reference" callouts.
2. `app/src/components/proxy/` — the entire Proxy tab as it exists today. CountersPane, AuditFeed, IdentitiesPane, ProxyPane, EmptyStateOnboarding.
3. `app/src/components/layout/` — other tabs (Overview, Sessions). Match their stylistic language; do NOT rewrite them.
4. `app/src/index.css`, `app/tailwind.config.js` — current design tokens.
5. **Open Linear's Issues view in your browser before you start.** Note: typography hierarchy, spacing rhythm, color discipline, hover micro-interactions, density. That's the bar.
6. **Open Honeycomb's query view if you can.** Note: how time-series sparklines coexist with detail tables on the same screen.

## What you ship

A taste-pass refactor of the Proxy tab. The information stays the same; the visual quality goes from "ships in a Mac OSS app" to "Linear-tier."

### Concrete polish targets

**1. Density.** The current panes have generous padding and large row heights. At 1440px width:
- Identities pane: target 12+ identities visible without scroll (today ~6)
- Audit feed: target 25+ rows visible without scroll (today ~12)
- Counters strip: stays compact but each card gets a small sparkline (Honeycomb-style)

**2. Typography hierarchy — three tiers, no more.**
- Page title (Proxy): 13–14px medium-weight, single color
- Section header (Identities, Counters, Audit): 11–12px uppercase tracked, secondary color
- Body / data rows: 12–13px, primary color, monospace where it helps (timestamps, IDs, query text)

Use Inter (or whatever the app already uses) at exact pixel sizes. Don't use Tailwind's defaults like `text-base` or `text-lg` — pick deliberate sizes.

**3. Color discipline — count your colors.**
Today the tab probably uses 8+ distinct colors (badges per decision, identity avatars, hover states, etc.). Cut to ≤6:
- Background (1, plus dark mode equivalent)
- Surface (1, slightly elevated background)
- Primary text (1)
- Secondary text (1)
- Accent (1, used for active state + critical signals only)
- Muted/border (1)

**Decision badges** (allowed/coalesced/rate-limited) should NOT use distinct hue colors. Use a single neutral with weight variation, or use small icons. Linear uses very few hues per view.

**4. Spacing rhythm.**
- Pick a base unit (4px or 6px). Every margin/padding/gap is a multiple of that unit. No 5px, 7px, 13px values.
- Vertical rhythm: every text row sits on a multiple-of-base baseline.

**5. Sparklines on counters.**
The counters today show a single number ("1,234 queries"). Add a small inline sparkline (last 60 minutes, 60 buckets, ~100px wide × 16px tall) under each counter. SVG, no charting library — a path element with `M`/`L` commands is enough. Honeycomb-tier: the sparkline tells you the trend at a glance, the number tells you the magnitude.

**6. Drill flow — one click from counter to filtered feed.**
Today: clicking the "Coalesced" counter does nothing. After: clicking it sets the audit feed's decision filter to "coalesced" and scrolls the feed into view. Same for "Rate limited" → "rate_limited" filter. Same for "Total today" → "all".

**7. Empty states — respect the user.**
The current empty state (when no proxy.db) uses the EmptyStateOnboarding panel. Keep its content but apply the polish standards above (typography, color discipline). Per-pane empty states (e.g., "no audit rows in this filter window") should be a single line of secondary text, no illustrations, no marketing copy.

**8. Micro-interactions.**
- Hover on an identity row: subtle background tint, 150ms ease
- Hover on an audit row: same
- Click an identity: row highlights briefly (300ms), feed re-filters
- Counter delta animation (already shipped per #22): keep, but tone down — current implementation may flash too brightly; reduce intensity

**9. Keyboard navigation.**
- `j`/`k` or arrow keys to move through audit rows
- `i` to focus the identities pane
- `f` to focus the audit filter
- `Esc` to clear filters
- A small `?` hover at bottom-right opens a keyboard cheatsheet (modal)

**10. Dark mode + light mode.**
If the app supports both, both must feel intentional. Don't ship one as an afterthought of the other.

## Files you own

Modify:
- `app/src/components/proxy/CountersPane.tsx` — sparklines, click-to-filter, density
- `app/src/components/proxy/IdentitiesPane.tsx` — density, hover, focus
- `app/src/components/proxy/AuditFeed.tsx` — density, keyboard nav, decision badge restraint
- `app/src/components/proxy/ProxyPane.tsx` — page-title typography, section headers, keyboard nav glue
- `app/src/components/proxy/EmptyStateOnboarding.tsx` — typography pass
- `app/src/components/proxy/useProxyData.ts` — only if needed to support the sparkline data shape (last 60 min counts bucketed by minute, per agent, per decision)
- `app/src-tauri/src/proxy.rs` — only if a new query is needed for the sparkline buckets (additive command, e.g. `proxy_counter_buckets(agent_id, decision, since)`)
- `app/src/index.css` — design tokens (colors, spacing units)

New:
- `app/src/components/proxy/Sparkline.tsx` — small reusable SVG sparkline component
- `app/src/components/proxy/KeyboardHelp.tsx` — the `?` cheatsheet modal
- Tests in `app/src/components/proxy/__tests__/` for new behaviors

## Files you MUST NOT touch

- `app/src/components/layout/` — other tabs. Their design is consistent today; don't refactor them in this pass.
- `app/tailwind.config.js` — only if a new design token is required, and only additive (don't remove or rename existing tokens; other tabs use them).
- `proxy/`, `daemon/`, `site/` — out of scope.

## Acceptance criteria

1. **Side-by-side screenshots in the PR.** Before-vs-after for each pane (Identities, Counters, Audit, Empty State). Both light and dark mode if supported.
2. **Color count.** Run a CSS audit: total distinct colors used in proxy/ components ≤6 (excluding dark mode equivalents). Document the palette in the PR.
3. **Density numbers.** PR body documents: rows visible per pane at 1440×900 viewport, before vs after.
4. **Sparkline correctness.** Each counter card has a sparkline showing the last 60 minutes' bucketed counts. Tested with fixture data: a counter that was 0 for 50 minutes then ramped to 1000 over the last 10 shows the right shape.
5. **Drill flow.** Clicking the "Coalesced" counter filters the audit feed to `decision='coalesced'` rows. Clicking "Total today" clears the filter. Tested.
6. **Keyboard nav.** Tab through identities, then `j`/`k` through audit rows. `i` focuses identities pane. `f` focuses filter. `Esc` clears. `?` opens cheatsheet. All tested.
7. **Regression bar.** All 194 existing npm tests + 32 cargo tests pass. Plus new tests for sparkline, drill flow, keyboard nav.
8. **Performance regression bar.** Audit feed still renders 1000 rows in <100ms. Sparkline render <16ms (one frame). Don't introduce a perf regression in the polish pass.
9. **Accessibility check.** All interactive elements keyboard-reachable. Audit rows have ARIA labels. Color contrast passes WCAG AA at minimum (the secondary text in particular).

## Out of scope

- New panes (no "Policy" pane yet, no "Live Map of agent → DB connections")
- Charts beyond sparklines (no full line/bar charts in this push)
- A new theming system (use existing Tailwind/CSS vars; don't introduce CSS-in-JS or styled-components)
- Mobile / responsive layouts (this is desktop-first; don't add mobile breakpoints)
- The website / marketing surface (different layer, different agent)

## How to know you are done

- Open Linear's Issues view in one window, the new Vigil Proxy tab in another. They feel like cousins, not strangers.
- A friend who's never seen Vigil opens the Proxy tab and you don't have to explain anything to them.
- The PR's before/after screenshots are screenshots you'd want to put on Twitter.

## When you finish

Open a PR against `main`. Lead reviews with the design direction doc (`docs/superpowers/specs/2026-05-15-product-direction-design.md`) open. Critique will probably name specific cells/components that don't yet feel Linear-tier.

## When you get stuck

If you find yourself adding more visual elements (more colors, more icons, more decoration) — stop. The Linear / Honeycomb premier reference is *restraint*. Remove three elements before you add one. The polish is in the negative space, not the additions.

If sparklines feel hard to do well in raw SVG, you can use a tiny library like `react-sparklines` (~3KB), but document the choice in the PR.
