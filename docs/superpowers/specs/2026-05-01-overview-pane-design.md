# Overview Pane — Design Spec

**Date:** 2026-05-01
**Branch:** `claude/v3-agentic-overview`
**Author:** Claude (Opus 4.7)
**Status:** Pending review

## Goal

The current Vigil app answers "what is THIS one selected session doing?" but has no view that answers "what is happening across all my agents right now?" — which is the actual product thesis (POSITIONING.md §2: "monitor every AI agent on your machine"). This spec adds that view as a third content mode of `MiddlePane`, sharing the existing `LeftRail` + `RightRail` chrome.

## Done When

- `./dev.sh` launches with multiple live agent sessions and the Overview shows all of them at-a-glance.
- `⌘1` / `⌘2` toggle works; `⌘2` is gated by `selectedSessionId != null`.
- All vitest + cargo tests green.
- `tsc --noEmit` clean. `cargo check` clean in `app/src-tauri`.
- Branch `claude/v3-agentic-overview` pushed; **not merged** to main.

## Non-Goals

Items considered and explicitly deferred (P2/P3):

- "Recently active" footer for agents with no live session but events in the last hour
- Repo filter on the Overview (cross-machine view is the thesis)
- Hourly chart granularity toggle (15min / 1h / 1d)
- Hotspot row click → drill into file edit history
- Per-agent burn rate breakdown in StatsRow
- "Session ended just now · ⌘1 for Overview" hint in per-session view (one-line addition; post-merge)
- Live websocket / push (existing 2s poll is the contract)

## Decisions Locked (Q1–Q5)

These were debated during brainstorming. They're inputs to this spec, not open questions.

1. **Q1 — Hourly chart shape:** Stacked bars, 24 buckets, agent-color stacks. 2px floor on non-zero segments. X-axis tick marks **with labels** at 00:00 / 06:00 / 12:00 / 18:00 / now. Y-axis has no labels (count is implicit). Empty 24h window → muted baseline + caption.
2. **Q2 — Hotspots vs collisions:** Two distinct lists. Collision banner is a coordination signal; "Most edited" panel is an activity signal. ▲ marker on rows that appear in both. Heat bars are relative-normalized (top row = 100%).
3. **Q3 — Click on agent card:** Drills in to that agent's most recent live session (`is_live === true`, sort by `started_at` desc). Don't render cards for agents without a live session. `<button type="button">`, full-area click target, hover bg shift, focus-visible ring.
4. **Q4 — Launch + auto-bounce:** Launch resolution: persisted `selectedSessionId` + that session is live → restore per-session view. Otherwise → Overview, clear stale id. Auto-bounce off (don't yank the user when their inspected session ends mid-flight).
5. **Q5 — Status bar placement:** Stats row lives **inside** Overview, not promoted to global TopBar. TopBar gets a minimal "Overview · Session" mode-link row (text links + middle dot, no pill chrome).

## Architecture

### Component layout

New files under `app/src/components/layout/overview/`:

```
OverviewPane.tsx         — top-level Overview, renders the 5 stacked sections
StatsRow.tsx             — burn rate / active agents / files today
CollisionBanner.tsx      — dedicated red bar, matches existing daemon-disconnected pattern
AgentGrid.tsx            — auto-fill grid of AgentCard (live agents only)
AgentCard.tsx            — one card per live agent
HourlyChart.tsx          — stacked-bar SVG, 24 buckets
HotspotsPanel.tsx        — top-5 most-edited files in last hour
```

Modified files:

```
app/src/App.tsx                            — view-mode wiring, ⌘1/⌘2 keyboard, launch resolution
app/src/components/layout/MiddlePane.tsx   — render-decision branch for Overview
app/src/components/TopBar.tsx              — "Overview · Session" mode-link row
app/src/store/selection.ts                 — viewMode state (persisted)
app/src/hooks.ts                           — fetch hourlyActivity + topEditedFiles
app/src/types.ts                           — HourBucket, FileHeat interfaces
app/src-tauri/src/commands.rs              — get_hourly_activity, get_top_edited_files
app/src-tauri/src/store.rs                 — query_hourly_activity, query_top_edited_files
```

### View mode state

In `app/src/store/selection.ts`:

```ts
viewMode: "overview" | "session";  // persisted (zustand persist), default "overview"
setViewMode: (m: "overview" | "session") => void;
```

### Launch resolution (App.tsx, mount-only effect)

```ts
useEffect(() => {
  if (selectedId) {
    const s = sessions.find((x) => x.id === selectedId);
    // Note: SessionGroup uses camelCase id / isLive (post-grouping), distinct
    // from LiveSessionRow which is snake_case session_id / is_live.
    if (!s || !s.isLive) {
      setSelected(null);
      setViewMode("overview");
    }
  }
  // eslint-disable-next-line react-hooks/exhaustive-deps -- launch-only resolution
}, []);
```

### Render decision

```
viewMode === "session" && selected != null  → MiddlePane renders per-session detail (existing)
sessions.length === 0                       → MiddlePane renders existing "No agents active" hero
otherwise                                   → MiddlePane renders <OverviewPane />
```

Note: `viewMode === "session"` with `selected == null` (e.g. after session reaper) renders Overview without flipping persisted `viewMode`. TopBar Session link is in disabled state. User presses ⌘1 or clicks "Overview" to confirm. Self-heals on next agent click.

### Drill-in click handler

```ts
function onAgentCardClick(agent: string) {
  const liveForAgent = data.liveSessions
    .filter((s) => s.agent === agent && s.is_live)
    .sort((a, b) => b.started_at.localeCompare(a.started_at))[0];
  if (!liveForAgent) return; // logic-impossibility guard; we don't render dead cards
  setSelected(liveForAgent.session_id);
  setViewMode("session");
}
```

### Keyboard handler (extend existing in App.tsx)

```ts
useEffect(() => {
  const handler = (e: KeyboardEvent) => {
    if (!(e.metaKey || e.ctrlKey)) return;
    if (e.key === "k") { e.preventDefault(); setCmdOpen(true); return; }
    if (e.key === "1") { e.preventDefault(); setViewMode("overview"); return; }
    if (e.key === "2" && selected) { e.preventDefault(); setViewMode("session"); return; }
  };
  window.addEventListener("keydown", handler);
  return () => window.removeEventListener("keydown", handler);
}, [selected, setViewMode]);
```

### TopBar mode-link row

```
Vigil ●        Overview · Session        ⌘K
```

- Two text links separated by a middle dot
- Active = `text-white` + 1px underline; inactive = `text-white/45`
- Session link disabled (`text-white/25 cursor-not-allowed`) when `selectedId == null` or persisted session isn't live
- `title="⌘1"` / `title="⌘2"` tooltips on each link
- Click toggles in addition to keyboard

### Shared collision data

`useDaemonData()` already polls `get_collisions` into `data.collisions`. `CollisionBanner` and `HotspotsPanel` both consume from there; no second round-trip. `HotspotsPanel` derives a `Set<string>` of collision file paths once via `useMemo` and uses `Set.has(path)` to render the ▲ marker per row.

## Data Layer

### New Tauri commands

**`get_hourly_activity(since_hours: Option<i64>) -> Vec<HourBucketRow>`**

```rust
#[derive(Debug, Clone, serde::Serialize)]
pub struct HourBucketRow {
    pub hour_iso: String,            // "2026-05-01T19:00:00Z"
    pub by_agent: Vec<AgentCount>,   // sorted by count desc
}

#[derive(Debug, Clone, serde::Serialize)]
pub struct AgentCount {
    pub agent: String,
    pub count: u32,
}
```

SQL (frontend densifies the leftmost edge — see "Known undercount" below):

```sql
SELECT strftime('%Y-%m-%dT%H:00:00Z', timestamp) AS hour, agent, COUNT(*) AS n
FROM events
WHERE timestamp >= datetime('now', ?1)
  AND kind IN ('file_create', 'file_modify', 'file_delete', 'git_commit')
GROUP BY hour, agent
ORDER BY hour ASC, n DESC
```

`SessionSeen` events (synthetic, from JSONL tailer) are naturally excluded by the IN list.

Pivot in Rust: walk contiguous (hour, agent, count) rows; new row when `hour` changes. Returns only hours with ≥1 event — frontend densifies to 24 contiguous buckets.

**Known undercount:** SQL filter `timestamp >= datetime('now', '-24 hours')` is not hour-floored. Frontend densification floors `now-24h` to the start of the hour, so the leftmost bucket on screen represents `floor(now-24h)..floor(now-23h)` but only contains events from `now-24h..floor(now-23h)`. Cosmetic at the leftmost edge; up to 60 min undercount. Documented in source comment to prevent future "missing events" hunts.

**`get_top_edited_files(since_minutes: Option<i64>, limit: Option<u32>) -> Vec<FileHeatRow>`**

```rust
#[derive(Debug, Clone, serde::Serialize)]
pub struct FileHeatRow {
    pub path: String,
    pub edit_count: u32,
    pub agents: Vec<String>,      // distinct, order indeterminate (see "Agent ordering")
    pub last_event_at: String,
}
```

SQL:

```sql
SELECT
  file_path,
  COUNT(*)                                    AS edit_count,
  GROUP_CONCAT(DISTINCT agent)                AS agents_csv,
  MAX(timestamp)                              AS last_at
FROM events
WHERE file_path IS NOT NULL
  AND kind IN ('file_create', 'file_modify')
  AND timestamp >= datetime('now', ?1)
GROUP BY file_path
ORDER BY edit_count DESC, last_at DESC
LIMIT ?2
```

**Noise filter:** the daemon's `is_noise_path()` runs at ingest, so `events` is already clean.

**GROUP_CONCAT separator:** SQLite forbids `GROUP_CONCAT(DISTINCT col, sep)` (multi-arg + DISTINCT incompatible). Stuck with default `,`. Comment in the SQL cites this assumption. CI guard test (see Testing) asserts no known agent name contains a comma.

**Agent ordering:** `GROUP_CONCAT(DISTINCT)` does not guarantee order. Frontend caps at 3 dots + "+N", so order is cosmetic. Acceptable for V3.

### Tauri command wrappers (`commands.rs`)

```rust
#[tauri::command(rename_all = "snake_case")]
pub fn get_hourly_activity(since_hours: Option<i64>) -> Result<Vec<HourBucketRow>, String> {
    let store = open_store()?;
    store.query_hourly_activity(since_hours.unwrap_or(24))
        .map_err(|e| format!("Query failed: {e}"))
}

#[tauri::command(rename_all = "snake_case")]
pub fn get_top_edited_files(
    since_minutes: Option<i64>,
    limit: Option<u32>,
) -> Result<Vec<FileHeatRow>, String> {
    let store = open_store()?;
    store.query_top_edited_files(since_minutes.unwrap_or(60), limit.unwrap_or(5))
        .map_err(|e| format!("Query failed: {e}"))
}
```

Registered in `main.rs` next to `get_live_summary` and `get_collisions`.

### Frontend types

```ts
export interface HourBucket {
  hour_iso: string;
  by_agent: Array<{ agent: string; count: number }>;
}

export interface FileHeat {
  path: string;
  edit_count: number;
  agents: string[];
  last_event_at: string;
}
```

### `useDaemonData` additions

Two more `invoke` calls in the existing `Promise.all`:

```ts
invoke<HourBucket[]>("get_hourly_activity", { sinceHours: 24 })
  .catch(() => [] as HourBucket[]),
invoke<FileHeat[]>("get_top_edited_files", { sinceMinutes: 60, limit: 5 })
  .catch(() => [] as FileHeat[]),
```

Returns:

```ts
hourlyActivity: HourBucket[];
topEditedFiles: FileHeat[];
```

Polling cadence unchanged (2s). Both queries are cheap; existing `idx_events_timestamp` and `idx_events_file_path` cover them.

## Visual Contract

### StatsRow

Three columns:
- **Burn rate** — `$X.XX/hr` from `data.liveSummary.burn_rate_per_min * 60`. Show "—" if `total_cost_1h` is `None`.
- **Active agents** — `data.liveSummary.active_session_count`, suffixed `of N` where N = total agents seen in last 1h.
- **Files today** — `data.workspaceSummary.files_changed_today`. Delta vs yesterday is P3.

### CollisionBanner

Reuses the visual pattern from `App.tsx`'s inline daemon-disconnected banner: `bg-rose-500/10`, `border-b border-rose-400/20`, `animate-pulse-alive` dot. New dedicated component (no existing CollisionBanner — verified via `grep -r "Collision" app/src/components/`). Renders only when `data.collisions.length > 0`. `role="alert"`, `aria-live="polite"`.

### AgentGrid + AgentCard

Grid: `grid-template-columns: repeat(auto-fill, minmax(190px, 1fr))`, `gap: 8px`.

Each card is a `<button type="button">` (full-area click target) containing:
- **AgentGlyph** (size 12) — imported from `app/src/components/AgentGlyph.tsx` (landed on main in commit `019fecf`)
- **Agent display name** — `agentDisplayName(agent)` from types.ts
- **Model chip** — agent's most recent `LiveSessionRow.model`, monospace, muted
- **Activity line** — `LiveSessionRow.description` text in muted color. (Turn-based `PulseLine` with `toolNames` from latest per-agent turn would be richer but requires aggregating turns per-agent, not per-session as today; explicitly P3.)
- **Metrics row** — `events_1h files`, elapsed time (`relativeTime(started_at)`), `cost_1h` if present

Hover: `bg-white/5`. Focus-visible: `outline-1 outline-offset-1 outline-white/40`.

### HourlyChart

SVG, full pane width minus 28px padding. Hand-rolled (Recharts not installed; matches existing `PulseLine` aesthetic).

- 24 buckets, frontend-densified from API result
- Each bucket: vertical column of stacked rectangles, one per agent in that bucket, color from `agentColor()` in `types.ts`
- 2px minimum height for non-zero segments
- X-axis: tick marks **with labels** at 00:00 / 06:00 / 12:00 / 18:00 / now (5 labels)
- Y-axis: no labels
- Hover tooltip per bucket: hour label + per-agent count breakdown (`<div role="tooltip">`)
- Empty state (no events 24h): muted baseline + caption "Activity will populate as your agents work"
- Hidden `<table>` mirror inside the SVG container for screen readers

### HotspotsPanel

`<table>` with `<thead>` and `<tbody>`. Each row:
- **Path** — `displayPath(path, repoPath)` (repo-relative, falls back to last 3 segments). Currently private inside `ActivityStream.tsx:79`. **Step 8a:** extract to `app/src/lib/path.ts` and import from both `ActivityStream` and `HotspotsPanel`. `dir="rtl"` + `<bdi>` for narrow-column truncation
- **Heat bar** — `<div role="progressbar" aria-valuenow={count} aria-valuemin={0} aria-valuemax={top.count}>` with width normalized to top row (top = 100%). NOT `<progress>` (default browser styling fights with pixel-precise width)
- **Agent dots** — up to 3 colored dots from `agentColor()`; "+N" affordance beyond
- **▲ marker** — left of dots when `path` is in the collision Set
- **Empty state**: single muted line "Quiet — no file activity in the last hour" (no header + empty list)

Click interaction: none in V3.

## Failure Modes

| Failure | Behavior |
|---|---|
| `get_hourly_activity` / `get_top_edited_files` throws | `useDaemonData` `.catch(() => [])`; section renders empty-state caption. No toast, no crash. |
| `data.liveSummary.agents` empty | `AgentGrid` renders nothing; rest of Overview unaffected. |
| Persisted `selectedSessionId` points to non-existent session | Mount-only effect snaps to Overview, clears stale id. |
| `viewMode === "session"` with `selected == null` (race / reaper) | Render decision falls through to Overview. TopBar Session link in disabled state. Self-heals on next agent click. |
| Daemon disconnect mid-session | Existing rose banner stays. Overview keeps last-fetched data. New queries `.catch(() => [])`; chart stops moving. |
| Window resize narrows MiddlePane below ~440px | Grid collapses to 1 col via `auto-fill`. Chart bars narrower but 24 still fit. Below ~280px is prevented by divider min/max in `selection.ts`. |

## Accessibility

**Keyboard:**
- `⌘1` / `⌘2` toggle modes (`⌘2` no-op when `selected == null`)
- Tab order: TopBar mode links → MiddlePane content
- Within Overview: only AgentCard buttons are focusable; chart, banner, hotspots rows are informational
- `Enter` / `Space` on focused AgentCard triggers click (native button)

**ARIA:**
- `<section aria-label="Overview">` on root
- StatsRow: `<section aria-label="Workspace stats">`
- CollisionBanner: `role="alert"`, `aria-live="polite"`
- AgentCard: `<button type="button" aria-label="View {agentName}'s most recent session">`
- HourlyChart: `<svg role="img" aria-label="24-hour activity chart">` + hidden `<table>` mirror
- HotspotsPanel: semantic `<table>`. Heat bars are `<div role="progressbar" aria-valuenow=...>`

**Color contrast:**
Color is supplementary (agent identity is conveyed by name text; collision conveyed by word "Conflict"). Text on `#0d0d0f` background must meet WCAG AA (4.5:1 normal, 3:1 large/disabled). **Verify via Chrome DevTools contrast checker on rendered components before merge** — alpha-blended values like `text-white/45` need measured ratios, not arithmetic.

## Testing Strategy

### Rust unit tests (`app/src-tauri/src/store.rs` `#[cfg(test)]` module)

Mirror existing `cost_events` test pattern: `Connection::open_in_memory()` + helper to create the events table and insert fixtures.

`query_hourly_activity`:
- `hourly_activity_buckets_by_hour_and_agent` — multi-hour, multi-agent fixture; assert pivot order
- `hourly_activity_window_filter` — events at -30min and -90min; query with since_hours=1; assert only -30min event included (pins timestamp ≥ datetime('now', '-1 hours') invariant)
- `hourly_activity_excludes_non_activity_kinds` — insert all 4 included kinds + one event with `kind = 'session_seen'`; assert only the 4 appear
- `hourly_activity_returns_empty_for_quiet_window` — no events; empty Vec, no error

`query_top_edited_files`:
- `top_edited_files_orders_by_edit_count_desc`
- `top_edited_files_respects_limit`
- `top_edited_files_window_filter` — events at -30min and -90min; query with since_minutes=60; assert only -30min file
- `top_edited_files_distinct_agents_per_file`
- `top_edited_files_agent_csv_round_trips` — define `const KNOWN_AGENT_NAMES: &[&str]` in the test file (with `// must match daemon/src/process.rs Agent::as_str`). Insert edits to one file by each name. Assert parsed `agents.len() == KNOWN_AGENT_NAMES.len()` and each name appears unmangled. Future agent additions update this constant; missing it causes the test to fail
- `no_known_agent_name_contains_comma` — sibling guard test using the same `KNOWN_AGENT_NAMES` constant; asserts `!name.contains(',')` for each. Catches future agent name with comma at CI time (modulo developer remembering to update the constant when adding to `Agent::as_str`)
- `top_edited_files_excludes_null_paths` — git_commit events have NULL file_path
- `top_edited_files_only_includes_modify_and_create_kinds` — delete events excluded by SQL filter

### TypeScript / React tests (vitest)

`app/src/store/__tests__/selection.test.ts`:
- `setViewMode persists and round-trips through localStorage`
- `default viewMode is 'overview'`
- `setSelected and setViewMode are independent`

`app/src/components/layout/overview/__tests__/OverviewPane.test.tsx`:
- Renders all 5 sections when daemon is connected with active agents
- Hides CollisionBanner when no collisions
- Hotspots empty-state caption when no edits in last hour
- Hourly chart empty-state caption when no events in last 24h

`AgentCard.test.tsx`:
- Renders as `<button type='button'>` for native a11y
- Displays agent name, model, verb, file count, elapsed, cost
- Calls onSelect with `session_id` of agent's most recent live session on click
- Entire card area is clickable

`HourlyChart.test.tsx`:
- Renders 24 contiguous buckets, fills gaps with empty arrays
- Non-zero segments floor to 2px minimum height
- Empty data → renders muted baseline + caption, not 24 zero-bars
- Tick **labels** at 00:00 / 06:00 / 12:00 / 18:00 / now (visible labels, not just marks)
- Tooltip on hover shows hour label + per-agent breakdown

`HotspotsPanel.test.tsx`:
- Heat bar widths normalize to top row (max edit_count = 100%)
- Renders ▲ marker on rows whose path is in collisions
- Shows up to 3 agent dots, '+N' beyond
- Path uses `dir='rtl'` + `<bdi>` for narrow columns
- Empty state caption when no edits in last hour

`App-overview.test.tsx`:
- ⌘1 sets viewMode to 'overview'
- ⌘2 sets viewMode to 'session' only when a session is selected
- ⌘2 is no-op when selectedId is null
- Mount: persisted selectedId of non-live session clears + snaps to overview
- Mount: persisted selectedId of live session restores per-session view
- Mount: no persisted selectedId → opens to overview
- ⌘1 / ⌘2 do not interfere with ⌘K command palette
- Clicking AgentCard sets selectedSessionId and switches viewMode

`TopBar-overview.test.tsx`:
- Overview link active styling when viewMode='overview'
- Session link inactive styling when viewMode='overview'
- Session link disabled (`text-white/25 cursor-not-allowed`) when no session selected
- Click handlers invoke setViewMode with correct mode
- Title attribute contains keyboard hint

### Manual smoke (`./dev.sh`)

1. Cold launch with multiple live agents → Overview shows all of them
2. ⌘1 / ⌘2 toggle works; ⌘2 no-op without selection
3. Click agent card → drills in to per-session view
4. Daemon disconnected → rose banner stays; Overview shows cached state
5. Empty install → "No agents active" hero (not Overview-with-zero-bars)

## Implementation Order (TDD micro-cycles)

**Step 0 — Prerequisite: branch is current with main.** This spec assumes
`AgentGlyph` (commit `019fecf`), `HostGlyph`, and the daemon's JSONL session
detection (commit `6518fde` adding `EventKind::SessionSeen` and the
`host_kind` / `model` / `is_live` columns on `events`) are already on the
working branch. If the implementing branch is older than these commits,
`git fetch origin main && git rebase origin/main` first. The branch
`claude/v3-real-brand-logos` may also be merged into main before
implementation begins; the `AgentGlyph` API surface (`{ agent, size,
ariaLabel }`) is stable across that change, so this code is unaffected
either way.

1. Rust: `query_hourly_activity` + tests
2. Rust: `query_top_edited_files` + tests
3. Tauri command wrappers + main.rs registration (smoke compile)
4. Frontend: `types.ts` interfaces (HourBucket, FileHeat)
5. Frontend: `useDaemonData` fetch additions + types passthrough
6. Frontend: `selection.ts` viewMode state + tests
7. Frontend: `HourlyChart` + tests
8. Frontend: `HotspotsPanel` + tests
   - **8a (refactor first):** extract the private `displayPath(path, repoPath)` from `ActivityStream.tsx:79` to a new shared `app/src/lib/path.ts`. Update `ActivityStream` to import it. No behavioral change; landing this as its own commit keeps the diff reviewable
   - **8b:** build `HotspotsPanel` consuming `displayPath` from the shared util
9. Frontend: `AgentCard` + tests
10. Frontend: `StatsRow` + `CollisionBanner` + tests
11. Frontend: `AgentGrid` composition + tests
12. Frontend: `OverviewPane` composition + tests
13. Frontend: `TopBar` mode-link addition + tests
14. Frontend: `App.tsx` wiring (⌘1/⌘2 + launch resolution) + integration tests
15. Manual smoke pass via `./dev.sh`
16. `tsc --noEmit` + `cargo check`, push (no merge)

Each step = one TDD cycle = one commit. Total ~16 commits. Reviewer can squash post-hoc if preferred.

## Risks

| Risk | Mitigation |
|---|---|
| `query_hourly_activity` slow on huge events tables | `idx_events_timestamp` + bounded 24h window. Materialized hourly_buckets table is a future optimization out of V3 scope. |
| 2s polling causes re-render storm across 5 sections | Each section reads its own data slice; React reconciliation handles it. Memoize per-section if profiling shows jank. |
| Persisted viewMode causes weird state across DB resets | Mount-only effect handles stale `selectedId`; `viewMode` stays "session" but renders Overview when `selected == null`. Self-healing. |
| GROUP_CONCAT separator collision with future agent name | Sibling CI test (`no_known_agent_name_contains_comma`) catches it. |
| AgentCard's PulseLine relies on per-agent turn data | If turns aren't readily aggregated per-agent (only per-session today), fall back to `LiveSessionRow.description`. P3 to wire turn-based pulse properly. |
