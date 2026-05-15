# Conductor Prompt — Agent: App-Wide Linear-Tier Polish

You are working on **Vigil**, an agent-aware data plane proxy. The Tauri app's **Proxy tab** got a Linear-tier polish pass already (PR #30). Your job is to bring **the rest of the app** — Overview tab, Sessions tab, all panes, all chrome — up to the same bar.

This is a **taste pass, not a feature pass.** Same information stays on screen. Density, color discipline, typography hierarchy, restraint, micro-interactions all change. Premier reference: open Linear's Issues view in another tab. That's the bar — apply it everywhere except the Proxy tab.

## Required reading before you write any code

1. `docs/superpowers/specs/2026-05-15-product-direction-design.md` — strategic frame. Layer 3 ("operator-facing surface") = what you're polishing. Premier reference is Linear + Honeycomb.
2. `app/src/components/proxy/` — the **reference implementation** of Linear-tier polish. PR #30's work. Match this aesthetic everywhere else. Especially:
   - The `vigil.*` palette (bg / surface / ink / mute / rule / accent — 6 tokens)
   - Three-tier typography (page-title / section-header / body)
   - Decision badges as neutral glyphs, not colored chips
   - Sparklines for trend data
   - Drill-flow patterns (click counter → filter feed)
   - Keyboard nav glue
3. `app/tailwind.config.js` + `app/src/index.css` — the existing palette tokens. Use `vigil-*` classes; do NOT introduce new color tokens unless absolutely necessary (and if you do, justify in PR body).
4. `docs/screenshots/before/proxy-*.png` and `docs/screenshots/after/proxy-*.png` from PR #30 — the visible standard.

## What's in scope

Every component in `app/src/components/` **except** `proxy/` (which is done). Specifically:

- `TopBar.tsx` — top chrome (already trimmed of Vigil wordmark in PR #31, but typography + tab styling still need a pass)
- `layout/LeftRail.tsx` + `HostGroup.tsx` + `SessionRow.tsx` + `HostGlyph.tsx` — the sessions sidebar
- `layout/MiddlePane.tsx` — the central content area
- `layout/RightRail.tsx` + `FilesPanel.tsx` + `ReviewPanel.tsx` — the right pane (files / review)
- `layout/overview/*` — the Overview tab content (AgentCard, AgentGrid, CollisionBanner, HotspotsPanel, HourlyChart, OverviewPane, StatsRow)
- `SessionHeader.tsx` + `SessionFooter.tsx` + `ActivityStream.tsx` + `MilestoneFeed.tsx` + `SummaryBlock.tsx` + `DiffViewer.tsx` — Sessions-tab content
- `Onboarding.tsx` — the "Connect a Claude to get started" gate
- `CommandPalette.tsx` — Cmd-K palette
- `ConfidenceDonut.tsx` + `PulseLine.tsx` + `ModelChip.tsx` + `ModelPill.tsx` — small visual primitives

## Specific polish targets per surface

### TopBar
- Tab labels (Overview / Session / Proxy): the underline-on-active treatment is fine, but the label spacing is loose. Tighten gaps; consider monospace for the labels.
- The `⌘K` indicator on the right: smaller, lower contrast, currently dominates the right edge.
- Connection status dot (already minimal post #31): keep, maybe move to the right side near the ⌘K so the left side stays empty drag-region.

### LeftRail (Sessions sidebar)
- Apply the same density bump as the Proxy tab's IdentitiesPane — target 2x more session rows visible at 1440×900.
- Session row typography: agent name + project should be the body text; +adds/-subs should be the secondary monospace tabular figures.
- Single accent color for additions (use `vigil-accent`); subtraction count in secondary ink, not a different color. Today the +/-N chips are visually loud.
- Hover treatment: same subtle background tint as the audit feed in Proxy tab.

### MiddlePane → Overview tab (`layout/overview/*`)
- The big `BURN RATE / ACTIVE AGENTS / FILES TODAY` stats row at the top: this is the most prominent surface in the app and currently feels generic. Bring it to Linear-tier: tighter typography, sparklines under each number, clear secondary ink for the labels.
- The "ACTIVE AGENTS" pane: each agent card should match the IdentitiesPane row treatment (compact, hover-tint, click to expand).
- The "LAST 24H" `HourlyChart`: this is your Honeycomb moment. Restrained 24-hour bar chart, single accent color, no gridlines, hover for tooltip.
- The "MOST EDITED (LAST HOUR)" file list: small file-path rows, mono font, +N/-N pill in `vigil-accent` if positive, secondary ink if zero.
- The CONFLICT banner (`CollisionBanner.tsx`): currently dark-red background. Tone down — use the `vigil` palette's accent color at low opacity for the banner background; keep high contrast on the conflict text. Linear errors are a single-pixel border + accent text, not a filled bar.

### MiddlePane → Session detail
- `SessionHeader`: agent name + project + status pill ("Closed · 38m ago"). Match the visual weight of section headers from the Proxy tab.
- `SessionFooter`: the cost line ("Other $4.21 ··· 4 files touched"). Currently lives at bottom-left of the screen detached from the session pane. Reattach to the session detail content; same secondary-ink mono treatment as Proxy counters.
- `MilestoneFeed` / `ActivityStream` / `SummaryBlock`: timeline items. Match the AuditFeed row pattern from Proxy tab — 24px rows, tabular timestamps, hover tint, no decorative chrome.
- `DiffViewer`: code diff display. Keep syntax meaningful but use only TWO accent colors total (one for additions, one for deletions); don't introduce a third for context lines.

### RightRail (Files / Review)
- Tab strip at top matches TopBar tab style.
- File rows in `FilesPanel`: same treatment as IdentitiesPane in Proxy tab. Path in mono, +/- counts as right-aligned tabular.
- `ReviewPanel`: collision items use the same understated banner treatment as the new CollisionBanner.

### Onboarding
- The "Connect a Claude to get started" panel is currently centered with generous padding. Tighten the box width (~440px max), add a single accent on the active button, drop the "Stored securely in macOS Keychain" footer line into secondary ink at smaller size.
- Both option pills (Anthropic / OpenAI) should look like the decision filter dropdowns from the Proxy tab.

### CommandPalette
- Search input typography: monospace, 13px.
- Result rows: 28px height, hover tint, single accent on the highlighted row.
- Keyboard navigation indicators: tiny `↑↓ enter esc` strip at bottom right of the palette in secondary ink.

### Small primitives
- `ConfidenceDonut`, `PulseLine`, `ModelChip`, `ModelPill` — apply the same color discipline. Use accent + secondary + mute. No extra hues.

## Files you own

All `app/src/components/*.tsx` and `app/src/components/layout/*.tsx` files **except** anything inside `app/src/components/proxy/`. Plus:
- `app/src/index.css` — additive only (don't remove existing tokens; the proxy tab depends on them)
- `app/tailwind.config.js` — additive only
- `app/src/__tests__/*.test.tsx` and `app/src/components/**/__tests__/*.test.tsx` — update tests for any visible/queryable change you make

## Files you MUST NOT touch

- `app/src/components/proxy/` — done in PR #30; don't refactor
- `app/src-tauri/` — backend is fine, focus is React layer
- `proxy/`, `daemon/`, `site/` — out of scope
- The `vigil-*` palette tokens defined in PR #30 — only ADD if absolutely needed, don't rename or remove

## Acceptance criteria

1. **Side-by-side screenshots in the PR.** Before-vs-after for each major surface: TopBar, LeftRail, Overview-stats-row, Overview-active-agents, Overview-hourly-chart, Overview-file-list, CollisionBanner, Session-detail, Onboarding, CommandPalette. Both light and dark mode if the app supports both. Keep the screenshots in `docs/screenshots/before/app-wide-*.png` + `docs/screenshots/after/app-wide-*.png`.
2. **Color audit.** Total distinct color values used across non-proxy components ≤8 (the existing 6 `vigil-*` tokens + at most 2 semantic exceptions like collision-red and live-green, justified in PR body).
3. **Density numbers.** PR body documents row-count-per-pane before/after for: LeftRail sessions, Overview "Active Agents" cards, Overview "Most Edited" files, RightRail file list. Target: at least 1.5× more rows visible per pane at 1440×900.
4. **Typography hierarchy.** Three tiers, exact pixel sizes, consistent with the proxy tab's choices.
5. **Onboarding panel feels intentional.** Snapshot test asserts the new layout. Existing functional tests still pass.
6. **CommandPalette keyboard nav** still works (existing tests pass) but visual hierarchy improves.
7. **Regression bar.** ALL existing npm tests + cargo tests pass. No test removed; tests updated only when the assertion is now obsolete (e.g., a test asserting on a removed visual element).
8. **No new dependencies.** Don't add chart libraries, animation libraries, icon libraries — work with what's already in package.json. Sparklines are raw SVG (the proxy tab's `Sparkline.tsx` is already in tree; reuse it).
9. **Accessibility regression bar.** All existing aria labels preserved; new interactive elements get appropriate aria. Color contrast for all secondary text passes WCAG AA on the dark theme.

## Out of scope

- New features (no new tabs, no new panels)
- Charts beyond sparklines and the existing HourlyChart pattern
- New theming system (use existing `vigil-*` palette)
- Mobile / responsive layouts
- Replacing emoji or visual elements with new icon libraries (reuse what exists)
- The Proxy tab (already polished — leave alone)
- Any backend changes

## How to know you are done

- Open Linear's Issues view in one window, the new Vigil app in another. Click through Overview tab → Sessions tab → Proxy tab. They feel like cousins, not strangers.
- The PR's before/after screenshots are screenshots you'd want on Twitter.
- Costa opens the app, clicks through every tab, and doesn't say "what about ___ though" because everything got the treatment.

## When you finish

Open a PR against `main`. Lead reviews with the direction doc + the Proxy tab's PR #30 open as the reference standard. Critique will name specific surfaces that don't yet feel Linear-tier — be ready to iterate.

## When you get stuck

If you find yourself adding visual elements (more colors, more icons, more decoration) — stop. Linear's polish is *restraint*. Remove three things before you add one. The polish is in negative space, not additions.

If a surface genuinely doesn't have a clean Linear-tier mapping (e.g., DiffViewer needs the +/- color distinction — that's two accent colors which is more than the rest of the app uses), document the exception in the PR body. Some surfaces have intrinsic information requirements; the polish goal is to ship the minimum chrome around those requirements.

If you cannot make a surface feel Linear-tier without a structural rethink (e.g., the layout fundamentally doesn't support density), flag it as out-of-scope-for-this-PR and ship the rest. A 90% pass on 10 surfaces is better than a 100% pass on 6 + a stuck PR.
