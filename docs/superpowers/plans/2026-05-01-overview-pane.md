# Overview Pane Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a top-level Overview view that shows all live agents, hourly activity, file hotspots, and cross-agent collisions at-a-glance. Becomes the default MiddlePane content; per-session detail accessible via ⌘2 / clicking a session.

**Architecture:** New view rendered as a content mode of `MiddlePane` (LeftRail + RightRail unchanged). Two new Tauri SQL queries (`get_hourly_activity`, `get_top_edited_files`); existing `query_live_summary` + `query_collisions` provide the rest. View mode (`"overview" | "session"`) lives in zustand `useSelection` store, persisted. `⌘1` / `⌘2` toggle modes.

**Tech Stack:** Rust + rusqlite (Tauri backend SQL), TypeScript + React 19 + Tailwind (frontend), zustand (state), vitest (frontend tests), `cargo test` (Rust tests).

**Spec:** `docs/superpowers/specs/2026-05-01-overview-pane-design.md` (read before starting).

---

## Task 0: Verify branch prerequisites

**Files:** none

The spec assumes `AgentGlyph`, `HostGlyph` (commit `019fecf`), and the daemon's JSONL session detection (commit `6518fde`, adds `EventKind::SessionSeen` + `events.host_kind/model/is_live` columns) are on the branch. This task verifies the precondition before any implementation begins.

- [ ] **Step 1: Verify components exist**

```bash
ls app/src/components/AgentGlyph.tsx app/src/components/HostGlyph.tsx
```

Expected: both files print without error.

- [ ] **Step 2: Verify daemon has SessionSeen kind**

```bash
grep -q "SessionSeen" daemon/src/store.rs && echo "OK"
```

Expected: prints `OK`.

- [ ] **Step 3: If either fails, rebase**

```bash
git fetch origin main
git rebase origin/main
```

Then re-run Steps 1-2.

---

## Task 1: SQL `query_hourly_activity` (Rust)

**Files:**
- Modify: `app/src-tauri/src/store.rs` (add types + method + tests)

- [ ] **Step 1: Write the failing tests** (append to the existing `#[cfg(test)] mod tests {}` block)

```rust
fn ago_iso(minutes: i64) -> String {
    (chrono::Utc::now() - chrono::Duration::minutes(minutes)).to_rfc3339()
}

#[test]
fn hourly_activity_buckets_by_hour_and_agent() {
    let store = test_db();
    let h1 = ago_iso(30);
    let h2 = ago_iso(90);
    for _ in 0..3 {
        store.conn.execute(
            "INSERT INTO events (timestamp, kind, agent) VALUES (?1, 'file_modify', 'claude-code')",
            params![h1.clone()],
        ).unwrap();
    }
    for _ in 0..2 {
        store.conn.execute(
            "INSERT INTO events (timestamp, kind, agent) VALUES (?1, 'file_create', 'claude-code')",
            params![h2.clone()],
        ).unwrap();
    }
    store.conn.execute(
        "INSERT INTO events (timestamp, kind, agent) VALUES (?1, 'file_modify', 'cursor')",
        params![h2.clone()],
    ).unwrap();

    let buckets = store.query_hourly_activity(24).unwrap();
    assert_eq!(buckets.len(), 2, "two distinct hours");
    // Most-recent-bucket-first is NOT the contract (SQL ORDER BY hour ASC),
    // so don't depend on order; just check membership.
    let total_h1: u32 = buckets.iter()
        .flat_map(|b| b.by_agent.iter())
        .filter(|a| a.agent == "claude-code")
        .map(|a| a.count).sum();
    assert_eq!(total_h1, 5, "3 + 2 claude-code edits across both hours");
    assert!(buckets.iter().any(|b| b.by_agent.iter().any(|a| a.agent == "cursor" && a.count == 1)));
}

#[test]
fn hourly_activity_window_filter_excludes_old() {
    let store = test_db();
    store.conn.execute(
        "INSERT INTO events (timestamp, kind, agent) VALUES (?1, 'file_modify', 'claude-code')",
        params![ago_iso(30)],
    ).unwrap();
    store.conn.execute(
        "INSERT INTO events (timestamp, kind, agent) VALUES (?1, 'file_modify', 'claude-code')",
        params![ago_iso(90)],
    ).unwrap();

    let buckets = store.query_hourly_activity(1).unwrap();
    let total: u32 = buckets.iter().flat_map(|b| b.by_agent.iter()).map(|a| a.count).sum();
    assert_eq!(total, 1, "only the -30min event should be in the 1-hour window");
}

#[test]
fn hourly_activity_excludes_non_activity_kinds() {
    let store = test_db();
    let now = ago_iso(10);
    for kind in &["file_create", "file_modify", "file_delete", "git_commit", "session_seen"] {
        store.conn.execute(
            "INSERT INTO events (timestamp, kind, agent) VALUES (?1, ?2, 'claude-code')",
            params![now.clone(), *kind],
        ).unwrap();
    }

    let buckets = store.query_hourly_activity(1).unwrap();
    let total: u32 = buckets.iter().flat_map(|b| b.by_agent.iter()).map(|a| a.count).sum();
    assert_eq!(total, 4, "session_seen excluded; the other 4 included");
}

#[test]
fn hourly_activity_returns_empty_for_quiet_window() {
    let store = test_db();
    let buckets = store.query_hourly_activity(24).unwrap();
    assert!(buckets.is_empty());
}
```

- [ ] **Step 2: Run tests; expect compile error**

```bash
cd app/src-tauri && cargo test query_hourly_activity 2>&1 | head -30
```

Expected: compile error mentioning `query_hourly_activity` not found.

- [ ] **Step 3: Add types and method**

Add these types in `store.rs` near the existing `LiveSummaryRow`:

```rust
#[derive(Debug, Clone, serde::Serialize)]
pub struct HourBucketRow {
    pub hour_iso: String,
    pub by_agent: Vec<AgentCount>,
}

#[derive(Debug, Clone, serde::Serialize)]
pub struct AgentCount {
    pub agent: String,
    pub count: u32,
}
```

Add this method in the `impl Store` block:

```rust
/// Count events per (hour, agent) over the last N hours.
/// Returns only hours with >=1 event; frontend densifies to 24 contiguous buckets.
///
/// Known undercount: filter `timestamp >= datetime('now', '-N hours')` is not
/// hour-floored. Frontend densification floors `now-Nh` to start-of-hour, so the
/// leftmost bucket on screen represents `floor(now-Nh)..floor(now-(N-1)h)` but
/// only contains events from `now-Nh..floor(now-(N-1)h)`. Cosmetic at the
/// leftmost edge; up to 60 min undercount.
pub fn query_hourly_activity(&self, since_hours: i64) -> Result<Vec<HourBucketRow>> {
    let since = format!("-{since_hours} hours");
    let mut stmt = self.conn.prepare(
        "SELECT strftime('%Y-%m-%dT%H:00:00Z', timestamp) AS hour, agent, COUNT(*) AS n
         FROM events
         WHERE timestamp >= datetime('now', ?1)
           AND kind IN ('file_create', 'file_modify', 'file_delete', 'git_commit')
         GROUP BY hour, agent
         ORDER BY hour ASC, n DESC",
    )?;

    let rows: Vec<(String, String, u32)> = stmt
        .query_map(params![since], |r| {
            Ok((r.get(0)?, r.get(1)?, r.get::<_, i64>(2)? as u32))
        })?
        .collect::<Result<_>>()?;

    let mut buckets: Vec<HourBucketRow> = Vec::new();
    for (hour, agent, count) in rows {
        if buckets.last().map(|b| b.hour_iso.as_str()) != Some(hour.as_str()) {
            buckets.push(HourBucketRow { hour_iso: hour.clone(), by_agent: Vec::new() });
        }
        buckets.last_mut().unwrap().by_agent.push(AgentCount { agent, count });
    }
    Ok(buckets)
}
```

- [ ] **Step 4: Run tests; expect pass**

```bash
cd app/src-tauri && cargo test hourly_activity --quiet 2>&1 | tail -10
```

Expected: `4 passed; 0 failed`.

- [ ] **Step 5: Commit**

```bash
git add app/src-tauri/src/store.rs
git commit -m "feat(tauri): add query_hourly_activity SQL method"
```

---

## Task 2: SQL `query_top_edited_files` (Rust)

**Files:**
- Modify: `app/src-tauri/src/store.rs`

- [ ] **Step 1: Write the failing tests** (append to `mod tests {}`)

```rust
/// Mirror of daemon/src/process.rs Agent::as_str — keep in sync when adding agents.
const KNOWN_AGENT_NAMES: &[&str] = &[
    "claude-code", "cursor", "conductor", "aider", "codex", "cline",
];

#[test]
fn top_edited_files_orders_by_edit_count_desc() {
    let store = test_db();
    let now = ago_iso(10);
    for _ in 0..5 {
        store.conn.execute(
            "INSERT INTO events (timestamp, kind, file_path, agent) VALUES (?1, 'file_modify', 'a.rs', 'claude-code')",
            params![now.clone()],
        ).unwrap();
    }
    for _ in 0..3 {
        store.conn.execute(
            "INSERT INTO events (timestamp, kind, file_path, agent) VALUES (?1, 'file_modify', 'b.rs', 'claude-code')",
            params![now.clone()],
        ).unwrap();
    }
    for _ in 0..2 {
        store.conn.execute(
            "INSERT INTO events (timestamp, kind, file_path, agent) VALUES (?1, 'file_modify', 'c.rs', 'claude-code')",
            params![now.clone()],
        ).unwrap();
    }

    let rows = store.query_top_edited_files(60, 5).unwrap();
    assert_eq!(rows.len(), 3);
    assert_eq!(rows[0].path, "a.rs");
    assert_eq!(rows[0].edit_count, 5);
    assert_eq!(rows[1].path, "b.rs");
    assert_eq!(rows[2].path, "c.rs");
}

#[test]
fn top_edited_files_respects_limit() {
    let store = test_db();
    let now = ago_iso(10);
    for i in 0..8 {
        store.conn.execute(
            "INSERT INTO events (timestamp, kind, file_path, agent) VALUES (?1, 'file_modify', ?2, 'claude-code')",
            params![now.clone(), format!("f{i}.rs")],
        ).unwrap();
    }
    let rows = store.query_top_edited_files(60, 5).unwrap();
    assert_eq!(rows.len(), 5);
}

#[test]
fn top_edited_files_window_filter() {
    let store = test_db();
    store.conn.execute(
        "INSERT INTO events (timestamp, kind, file_path, agent) VALUES (?1, 'file_modify', 'recent.rs', 'claude-code')",
        params![ago_iso(30)],
    ).unwrap();
    store.conn.execute(
        "INSERT INTO events (timestamp, kind, file_path, agent) VALUES (?1, 'file_modify', 'old.rs', 'claude-code')",
        params![ago_iso(90)],
    ).unwrap();

    let rows = store.query_top_edited_files(60, 5).unwrap();
    assert_eq!(rows.len(), 1);
    assert_eq!(rows[0].path, "recent.rs");
}

#[test]
fn top_edited_files_distinct_agents_per_file() {
    let store = test_db();
    let now = ago_iso(10);
    for _ in 0..5 {
        store.conn.execute(
            "INSERT INTO events (timestamp, kind, file_path, agent) VALUES (?1, 'file_modify', 'shared.rs', 'claude-code')",
            params![now.clone()],
        ).unwrap();
    }
    store.conn.execute(
        "INSERT INTO events (timestamp, kind, file_path, agent) VALUES (?1, 'file_modify', 'shared.rs', 'cursor')",
        params![now.clone()],
    ).unwrap();

    let rows = store.query_top_edited_files(60, 5).unwrap();
    assert_eq!(rows[0].edit_count, 6);
    let mut agents = rows[0].agents.clone();
    agents.sort();
    assert_eq!(agents, vec!["claude-code", "cursor"]);
}

#[test]
fn top_edited_files_agent_csv_round_trips() {
    let store = test_db();
    let now = ago_iso(10);
    for name in KNOWN_AGENT_NAMES {
        store.conn.execute(
            "INSERT INTO events (timestamp, kind, file_path, agent) VALUES (?1, 'file_modify', 'all.rs', ?2)",
            params![now.clone(), *name],
        ).unwrap();
    }
    let rows = store.query_top_edited_files(60, 5).unwrap();
    assert_eq!(rows.len(), 1);
    assert_eq!(rows[0].edit_count as usize, KNOWN_AGENT_NAMES.len());
    let mut got = rows[0].agents.clone();
    got.sort();
    let mut expected: Vec<String> = KNOWN_AGENT_NAMES.iter().map(|s| s.to_string()).collect();
    expected.sort();
    assert_eq!(got, expected, "GROUP_CONCAT round-trip preserved every name");
}

#[test]
fn no_known_agent_name_contains_comma() {
    for name in KNOWN_AGENT_NAMES {
        assert!(!name.contains(','), "agent '{}' contains comma — would corrupt GROUP_CONCAT", name);
    }
}

#[test]
fn top_edited_files_excludes_null_paths() {
    let store = test_db();
    store.conn.execute(
        "INSERT INTO events (timestamp, kind, file_path, agent) VALUES (?1, 'git_commit', NULL, 'claude-code')",
        params![ago_iso(10)],
    ).unwrap();
    let rows = store.query_top_edited_files(60, 5).unwrap();
    assert!(rows.is_empty());
}

#[test]
fn top_edited_files_only_includes_modify_and_create_kinds() {
    let store = test_db();
    let now = ago_iso(10);
    store.conn.execute(
        "INSERT INTO events (timestamp, kind, file_path, agent) VALUES (?1, 'file_create', 'new.rs', 'claude-code')",
        params![now.clone()],
    ).unwrap();
    store.conn.execute(
        "INSERT INTO events (timestamp, kind, file_path, agent) VALUES (?1, 'file_modify', 'edit.rs', 'claude-code')",
        params![now.clone()],
    ).unwrap();
    store.conn.execute(
        "INSERT INTO events (timestamp, kind, file_path, agent) VALUES (?1, 'file_delete', 'gone.rs', 'claude-code')",
        params![now.clone()],
    ).unwrap();

    let rows = store.query_top_edited_files(60, 5).unwrap();
    let paths: Vec<&str> = rows.iter().map(|r| r.path.as_str()).collect();
    assert!(paths.contains(&"new.rs"));
    assert!(paths.contains(&"edit.rs"));
    assert!(!paths.contains(&"gone.rs"));
}
```

- [ ] **Step 2: Run tests; expect compile error**

```bash
cd app/src-tauri && cargo test top_edited_files 2>&1 | head -10
```

Expected: compile error.

- [ ] **Step 3: Add type and method**

Add type near `HourBucketRow`:

```rust
#[derive(Debug, Clone, serde::Serialize)]
pub struct FileHeatRow {
    pub path: String,
    pub edit_count: u32,
    pub agents: Vec<String>,
    pub last_event_at: String,
}
```

Add method in `impl Store`:

```rust
/// Top N most-edited files in the last `since_minutes` minutes.
/// GROUP_CONCAT with default ',' separator — KNOWN_AGENT_NAMES guard test ensures no name contains a comma.
pub fn query_top_edited_files(&self, since_minutes: i64, limit: u32) -> Result<Vec<FileHeatRow>> {
    let since = format!("-{since_minutes} minutes");
    let mut stmt = self.conn.prepare(
        "SELECT
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
         LIMIT ?2",
    )?;

    stmt.query_map(params![since, limit as i64], |r| {
        let agents_csv: String = r.get(2)?;
        Ok(FileHeatRow {
            path: r.get(0)?,
            edit_count: r.get::<_, i64>(1)? as u32,
            agents: agents_csv.split(',').map(|s| s.to_string()).collect(),
            last_event_at: r.get(3)?,
        })
    })?
    .collect::<Result<_>>()
}
```

- [ ] **Step 4: Run tests; expect pass**

```bash
cd app/src-tauri && cargo test top_edited_files --quiet 2>&1 | tail -10 && cargo test no_known_agent --quiet 2>&1 | tail -5
```

Expected: `8 passed; 0 failed`.

- [ ] **Step 5: Commit**

```bash
git add app/src-tauri/src/store.rs
git commit -m "feat(tauri): add query_top_edited_files SQL method"
```

---

## Task 3: Tauri command wrappers

**Files:**
- Modify: `app/src-tauri/src/commands.rs`
- Modify: `app/src-tauri/src/main.rs`

- [ ] **Step 1: Add commands**

In `app/src-tauri/src/commands.rs`, update the `use crate::store::{...}` import to include `FileHeatRow, HourBucketRow`. Append the two commands at the end of the file:

```rust
#[tauri::command(rename_all = "snake_case")]
pub fn get_hourly_activity(since_hours: Option<i64>) -> Result<Vec<HourBucketRow>, String> {
    let store = open_store()?;
    store
        .query_hourly_activity(since_hours.unwrap_or(24))
        .map_err(|e| format!("Query failed: {e}"))
}

#[tauri::command(rename_all = "snake_case")]
pub fn get_top_edited_files(
    since_minutes: Option<i64>,
    limit: Option<u32>,
) -> Result<Vec<FileHeatRow>, String> {
    let store = open_store()?;
    store
        .query_top_edited_files(since_minutes.unwrap_or(60), limit.unwrap_or(5))
        .map_err(|e| format!("Query failed: {e}"))
}
```

- [ ] **Step 2: Register in main.rs**

In `app/src-tauri/src/main.rs`, locate `tauri::generate_handler![...]` and add the two new commands to the list (anywhere after `commands::get_collisions` is fine):

```rust
commands::get_hourly_activity,
commands::get_top_edited_files,
```

- [ ] **Step 3: cargo check**

```bash
cd app/src-tauri && cargo check 2>&1 | tail -5
```

Expected: `Finished` with no errors.

- [ ] **Step 4: Commit**

```bash
git add app/src-tauri/src/commands.rs app/src-tauri/src/main.rs
git commit -m "feat(tauri): expose hourly_activity and top_edited_files commands"
```

---

## Task 4: Frontend types

**Files:**
- Modify: `app/src/types.ts`

- [ ] **Step 1: Add interfaces**

Add to `app/src/types.ts` (anywhere after existing `WorkspaceSummary`):

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

- [ ] **Step 2: tsc check**

```bash
cd app && npx tsc --noEmit 2>&1 | tail -3
```

Expected: no output (clean).

- [ ] **Step 3: Commit**

```bash
git add app/src/types.ts
git commit -m "feat(types): add HourBucket and FileHeat interfaces"
```

---

## Task 5: useDaemonData fetch additions

**Files:**
- Modify: `app/src/hooks.ts`

This hook is integration-tested via App-overview tests in Task 14. No standalone unit test (would require mocking `@tauri-apps/api/core`).

- [ ] **Step 1: Add fetches and return fields**

In `app/src/hooks.ts`:

(a) Update the import to add the new types:

```ts
import type { AgentEvent, Collision, AgentStat, CostSummary, CommitGroup, WorkspaceSummary, HourBucket, FileHeat } from "./types";
```

(b) Add state hooks alongside the existing ones:

```ts
const [hourlyActivity, setHourlyActivity] = useState<HourBucket[]>([]);
const [topEditedFiles, setTopEditedFiles] = useState<FileHeat[]>([]);
```

(c) Inside the `Promise.all` in `fetchAll`, add two more invokes (with `.catch` fallbacks matching existing pattern):

```ts
invoke<HourBucket[]>("get_hourly_activity", { sinceHours: 24 }).catch(() => [] as HourBucket[]),
invoke<FileHeat[]>("get_top_edited_files", { sinceMinutes: 60, limit: 5 }).catch(() => [] as FileHeat[]),
```

(d) Destructure them from the result and call setters:

```ts
setHourlyActivity(hourly);
setTopEditedFiles(topEdited);
```

(e) Update the `DaemonState` interface and the returned object to expose the two new fields:

```ts
hourlyActivity: HourBucket[];
topEditedFiles: FileHeat[];
```

- [ ] **Step 2: tsc check**

```bash
cd app && npx tsc --noEmit 2>&1 | tail -3
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add app/src/hooks.ts
git commit -m "feat(hooks): fetch hourly_activity and top_edited_files"
```

---

## Task 6: View mode in selection store

**Files:**
- Modify: `app/src/store/selection.ts`
- Test: `app/src/store/__tests__/selection.test.ts` (create if missing)

- [ ] **Step 1: Write failing tests**

Create `app/src/store/__tests__/selection.test.ts`:

```ts
import { describe, it, expect, beforeEach } from "vitest";
import { useSelection } from "../selection";

describe("selection store viewMode", () => {
  beforeEach(() => {
    localStorage.clear();
    useSelection.setState({
      selectedSessionId: null,
      leftWidth: 280,
      rightWidth: 320,
      rightTab: "changes",
      viewMode: "overview",
    });
  });

  it("default viewMode is 'overview'", () => {
    expect(useSelection.getState().viewMode).toBe("overview");
  });

  it("setViewMode updates state", () => {
    useSelection.getState().setViewMode("session");
    expect(useSelection.getState().viewMode).toBe("session");
  });

  it("setSelected does not auto-flip viewMode", () => {
    useSelection.getState().setViewMode("overview");
    useSelection.getState().setSelected("sess-1");
    expect(useSelection.getState().viewMode).toBe("overview");
  });

  it("setViewMode persists to localStorage", () => {
    useSelection.getState().setViewMode("session");
    const persisted = JSON.parse(localStorage.getItem("vigil-selection") ?? "{}");
    expect(persisted.state.viewMode).toBe("session");
  });
});
```

- [ ] **Step 2: Run; expect failure**

```bash
cd app && npx vitest run src/store/__tests__/selection.test.ts 2>&1 | tail -15
```

Expected: type errors on `viewMode` / `setViewMode`.

- [ ] **Step 3: Add to selection store**

In `app/src/store/selection.ts`, edit the `SelectionState` interface and the `create` block:

```ts
export interface SelectionState {
  selectedSessionId: string | null;
  leftWidth: number;
  rightWidth: number;
  rightTab: RightTab;
  viewMode: "overview" | "session";  // NEW
  setSelected: (id: string | null) => void;
  setLeftWidth: (px: number) => void;
  setRightWidth: (px: number) => void;
  setRightTab: (t: RightTab) => void;
  setViewMode: (m: "overview" | "session") => void;  // NEW
}

// inside create((set) => ({ ... })):
viewMode: "overview",
setViewMode: (m) => set({ viewMode: m }),
```

Bump the persist `version` to 2 and update the migrate function:

```ts
{
  name: "vigil-selection",
  version: 2,
  migrate: (persisted: unknown, version) => {
    const state = persisted as Partial<SelectionState> | null;
    if (state && state.rightTab !== "changes" && state.rightTab !== "review") {
      return { ...state, rightTab: "changes" as RightTab, viewMode: state.viewMode ?? "overview" };
    }
    if (version < 2 && state) {
      return { ...state, viewMode: "overview" };
    }
    return state;
  },
}
```

- [ ] **Step 4: Run; expect pass**

```bash
cd app && npx vitest run src/store/__tests__/selection.test.ts 2>&1 | tail -10
```

Expected: 4 passed.

- [ ] **Step 5: Commit**

```bash
git add app/src/store/selection.ts app/src/store/__tests__/selection.test.ts
git commit -m "feat(state): add viewMode to selection store"
```

---

## Task 7: HourlyChart component

**Files:**
- Create: `app/src/components/layout/overview/HourlyChart.tsx`
- Test: `app/src/components/layout/overview/__tests__/HourlyChart.test.tsx`

The chart densifies API output to 24 contiguous buckets (gaps filled with empty arrays), floors non-zero segments to 2px, renders X-axis tick labels at 00:00 / 06:00 / 12:00 / 18:00 / now, and shows a muted empty state if every bucket is empty.

- [ ] **Step 1: Write failing tests**

Create `app/src/components/layout/overview/__tests__/HourlyChart.test.tsx`:

```tsx
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { HourlyChart, densifyBuckets } from "../HourlyChart";
import type { HourBucket } from "../../../../types";

describe("densifyBuckets", () => {
  it("returns 24 contiguous buckets", () => {
    const result = densifyBuckets([], new Date("2026-05-01T18:30:00Z"));
    expect(result).toHaveLength(24);
  });

  it("fills gaps with empty by_agent arrays", () => {
    const sparse: HourBucket[] = [
      { hour_iso: "2026-05-01T17:00:00Z", by_agent: [{ agent: "claude-code", count: 3 }] },
    ];
    const result = densifyBuckets(sparse, new Date("2026-05-01T18:30:00Z"));
    const filled = result.find((b) => b.hour_iso === "2026-05-01T17:00:00Z");
    expect(filled?.by_agent).toEqual([{ agent: "claude-code", count: 3 }]);
    const empty = result.find((b) => b.hour_iso === "2026-05-01T16:00:00Z");
    expect(empty?.by_agent).toEqual([]);
  });
});

describe("HourlyChart", () => {
  it("renders empty-state caption when no buckets have data", () => {
    render(<HourlyChart buckets={[]} now={new Date("2026-05-01T18:00:00Z")} />);
    expect(screen.getByText(/Activity will populate/i)).toBeInTheDocument();
  });

  it("renders chart with bars when data is present", () => {
    const data: HourBucket[] = [
      { hour_iso: "2026-05-01T17:00:00Z", by_agent: [{ agent: "claude-code", count: 5 }] },
    ];
    const { container } = render(
      <HourlyChart buckets={data} now={new Date("2026-05-01T18:00:00Z")} />,
    );
    expect(container.querySelector("svg")).toBeInTheDocument();
    expect(screen.queryByText(/Activity will populate/i)).not.toBeInTheDocument();
  });

  it("renders 5 X-axis labels", () => {
    const data: HourBucket[] = [
      { hour_iso: "2026-05-01T17:00:00Z", by_agent: [{ agent: "claude-code", count: 1 }] },
    ];
    render(<HourlyChart buckets={data} now={new Date("2026-05-01T18:00:00Z")} />);
    // Tick labels: 00:00, 06:00, 12:00, 18:00, now
    expect(screen.getByText("00:00")).toBeInTheDocument();
    expect(screen.getByText("06:00")).toBeInTheDocument();
    expect(screen.getByText("12:00")).toBeInTheDocument();
    expect(screen.getByText("18:00")).toBeInTheDocument();
    expect(screen.getByText("now")).toBeInTheDocument();
  });

  it("provides accessible label and hidden table mirror", () => {
    const data: HourBucket[] = [
      { hour_iso: "2026-05-01T17:00:00Z", by_agent: [{ agent: "claude-code", count: 2 }] },
    ];
    const { container } = render(
      <HourlyChart buckets={data} now={new Date("2026-05-01T18:00:00Z")} />,
    );
    expect(container.querySelector('svg[role="img"]')).toBeInTheDocument();
    expect(container.querySelector("table")).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run; expect failure (no module)**

```bash
cd app && npx vitest run src/components/layout/overview/__tests__/HourlyChart.test.tsx 2>&1 | tail -10
```

Expected: `Cannot find module '../HourlyChart'`.

- [ ] **Step 3: Implement HourlyChart**

Create `app/src/components/layout/overview/HourlyChart.tsx`:

```tsx
import { agentColor } from "../../../types";
import type { HourBucket } from "../../../types";

interface Props {
  buckets: HourBucket[];
  now: Date;
}

const HOURS = 24;
const CHART_HEIGHT = 84;
const MIN_SEGMENT_PX = 2;

/** Floor a Date to the start of its hour (mutating-safe — returns a new Date). */
function floorHour(d: Date): Date {
  const x = new Date(d);
  x.setMinutes(0, 0, 0);
  return x;
}

function hourIso(d: Date): string {
  const yyyy = d.getUTCFullYear();
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(d.getUTCDate()).padStart(2, "0");
  const hh = String(d.getUTCHours()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}T${hh}:00:00Z`;
}

/**
 * Densify API output to 24 contiguous hourly buckets ending at `now`.
 * Empty hours get `by_agent: []`.
 */
export function densifyBuckets(api: HourBucket[], now: Date): HourBucket[] {
  const map = new Map<string, HourBucket>();
  for (const b of api) map.set(b.hour_iso, b);

  const result: HourBucket[] = [];
  const start = floorHour(now);
  start.setUTCHours(start.getUTCHours() - (HOURS - 1));
  for (let i = 0; i < HOURS; i++) {
    const h = new Date(start);
    h.setUTCHours(h.getUTCHours() + i);
    const iso = hourIso(h);
    result.push(map.get(iso) ?? { hour_iso: iso, by_agent: [] });
  }
  return result;
}

export function HourlyChart({ buckets, now }: Props) {
  const dense = densifyBuckets(buckets, now);
  const totalEvents = dense.reduce(
    (s, b) => s + b.by_agent.reduce((s2, a) => s2 + a.count, 0),
    0,
  );

  if (totalEvents === 0) {
    return (
      <div className="px-5 py-6 text-center">
        <div className="h-px bg-white/10 mb-3" />
        <p className="text-[12px] text-white/45">
          Activity will populate as your agents work.
        </p>
      </div>
    );
  }

  const maxBucketTotal = Math.max(
    1,
    ...dense.map((b) => b.by_agent.reduce((s, a) => s + a.count, 0)),
  );

  const tickLabels = ["00:00", "06:00", "12:00", "18:00", "now"];

  return (
    <div className="px-5 py-3">
      <svg
        role="img"
        aria-label="24-hour activity chart"
        viewBox={`0 0 ${HOURS * 10} ${CHART_HEIGHT + 10}`}
        preserveAspectRatio="none"
        className="w-full"
        style={{ height: CHART_HEIGHT + 24 }}
      >
        {dense.map((bucket, i) => {
          const total = bucket.by_agent.reduce((s, a) => s + a.count, 0);
          const x = i * 10;
          let yCursor = CHART_HEIGHT;
          return (
            <g key={bucket.hour_iso} transform={`translate(${x}, 0)`}>
              {bucket.by_agent.map((seg) => {
                const proportional = (seg.count / maxBucketTotal) * CHART_HEIGHT;
                const segH = total > 0 ? Math.max(MIN_SEGMENT_PX, proportional) : 0;
                yCursor -= segH;
                return (
                  <rect
                    key={seg.agent}
                    x={1}
                    y={yCursor}
                    width={8}
                    height={segH}
                    fill={agentColor(seg.agent)}
                  >
                    <title>{`${bucket.hour_iso} — ${seg.agent}: ${seg.count}`}</title>
                  </rect>
                );
              })}
            </g>
          );
        })}
      </svg>
      <div className="flex justify-between text-[9px] text-white/35 mt-1 px-1 tabular-nums">
        {tickLabels.map((t) => (
          <span key={t}>{t}</span>
        ))}
      </div>
      {/* Hidden table mirror for screen readers */}
      <table className="sr-only">
        <thead>
          <tr><th>Hour (UTC)</th><th>Agent</th><th>Events</th></tr>
        </thead>
        <tbody>
          {dense.flatMap((b) =>
            b.by_agent.map((a) => (
              <tr key={`${b.hour_iso}-${a.agent}`}>
                <td>{b.hour_iso}</td>
                <td>{a.agent}</td>
                <td>{a.count}</td>
              </tr>
            )),
          )}
        </tbody>
      </table>
    </div>
  );
}
```

- [ ] **Step 4: Run; expect pass**

```bash
cd app && npx vitest run src/components/layout/overview/__tests__/HourlyChart.test.tsx 2>&1 | tail -10
```

Expected: all tests passing.

- [ ] **Step 5: Commit**

```bash
git add app/src/components/layout/overview/HourlyChart.tsx app/src/components/layout/overview/__tests__/HourlyChart.test.tsx
git commit -m "feat(overview): add HourlyChart component"
```

---

## Task 8a: Extract `displayPath` to shared util

**Files:**
- Create: `app/src/lib/path.ts`
- Modify: `app/src/components/ActivityStream.tsx`

Pure refactor (no behavioral change). Done as its own commit so the diff stays reviewable.

- [ ] **Step 1: Create the shared util**

Read the current `displayPath` body from `ActivityStream.tsx:79`. Move it verbatim into a new file:

```bash
sed -n '79,110p' app/src/components/ActivityStream.tsx
```

Create `app/src/lib/path.ts` with the function exported:

```ts
// (Move the `function displayPath(...)` body verbatim here, prefixed with `export`.)
```

- [ ] **Step 2: Update ActivityStream import**

In `app/src/components/ActivityStream.tsx`:
- Delete the local `function displayPath(...) { ... }` block
- Add at top: `import { displayPath } from "../lib/path";`

- [ ] **Step 3: tsc + run all existing tests**

```bash
cd app && npx tsc --noEmit && npx vitest run 2>&1 | tail -5
```

Expected: no type errors; existing tests still pass.

- [ ] **Step 4: Commit**

```bash
git add app/src/lib/path.ts app/src/components/ActivityStream.tsx
git commit -m "refactor: extract displayPath to lib/path"
```

---

## Task 8b: HotspotsPanel component

**Files:**
- Create: `app/src/components/layout/overview/HotspotsPanel.tsx`
- Test: `app/src/components/layout/overview/__tests__/HotspotsPanel.test.tsx`

- [ ] **Step 1: Write failing tests**

Create `app/src/components/layout/overview/__tests__/HotspotsPanel.test.tsx`:

```tsx
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { HotspotsPanel } from "../HotspotsPanel";
import type { FileHeat, Collision } from "../../../../types";

describe("HotspotsPanel", () => {
  it("renders empty caption when no hot files", () => {
    render(<HotspotsPanel files={[]} collisions={[]} repoPath={null} />);
    expect(screen.getByText(/Quiet — no file activity/i)).toBeInTheDocument();
  });

  it("renders rows ordered by edit_count desc (already sorted server-side)", () => {
    const files: FileHeat[] = [
      { path: "/r/a.ts", edit_count: 10, agents: ["claude-code"], last_event_at: "2026-05-01T17:00:00Z" },
      { path: "/r/b.ts", edit_count: 5, agents: ["cursor"], last_event_at: "2026-05-01T17:00:00Z" },
    ];
    const { container } = render(<HotspotsPanel files={files} collisions={[]} repoPath="/r" />);
    const rows = container.querySelectorAll("tbody tr");
    expect(rows).toHaveLength(2);
    expect(rows[0].textContent).toContain("a.ts");
    expect(rows[1].textContent).toContain("b.ts");
  });

  it("normalizes heat bar widths with top row at 100%", () => {
    const files: FileHeat[] = [
      { path: "/r/a.ts", edit_count: 10, agents: ["claude-code"], last_event_at: "2026-05-01T17:00:00Z" },
      { path: "/r/b.ts", edit_count: 5, agents: ["claude-code"], last_event_at: "2026-05-01T17:00:00Z" },
    ];
    const { container } = render(<HotspotsPanel files={files} collisions={[]} repoPath="/r" />);
    const bars = container.querySelectorAll("[role='progressbar']");
    expect(bars).toHaveLength(2);
    expect((bars[0] as HTMLElement).style.width).toBe("100%");
    expect((bars[1] as HTMLElement).style.width).toBe("50%");
  });

  it("renders triangle marker on rows that are also collisions", () => {
    const files: FileHeat[] = [
      { path: "/r/shared.ts", edit_count: 5, agents: ["claude-code", "cursor"], last_event_at: "2026-05-01T17:00:00Z" },
    ];
    const collisions: Collision[] = [{ file_path: "/r/shared.ts", agents: ["claude-code", "cursor"] }];
    const { container } = render(<HotspotsPanel files={files} collisions={collisions} repoPath="/r" />);
    expect(container.textContent).toContain("▲");
  });

  it("does not render triangle marker for non-collision rows", () => {
    const files: FileHeat[] = [
      { path: "/r/a.ts", edit_count: 5, agents: ["claude-code"], last_event_at: "2026-05-01T17:00:00Z" },
    ];
    const { container } = render(<HotspotsPanel files={files} collisions={[]} repoPath="/r" />);
    expect(container.textContent).not.toContain("▲");
  });

  it("shows up to 3 agent dots, '+N' beyond", () => {
    const files: FileHeat[] = [
      { path: "/r/a.ts", edit_count: 5, agents: ["a", "b", "c", "d", "e"], last_event_at: "2026-05-01T17:00:00Z" },
    ];
    const { container } = render(<HotspotsPanel files={files} collisions={[]} repoPath="/r" />);
    expect(container.textContent).toContain("+2");
  });
});
```

- [ ] **Step 2: Run; expect failure (no module)**

```bash
cd app && npx vitest run src/components/layout/overview/__tests__/HotspotsPanel.test.tsx 2>&1 | tail -5
```

Expected: `Cannot find module '../HotspotsPanel'`.

- [ ] **Step 3: Implement HotspotsPanel**

Create `app/src/components/layout/overview/HotspotsPanel.tsx`:

```tsx
import { useMemo } from "react";
import { agentColor } from "../../../types";
import { displayPath } from "../../../lib/path";
import type { FileHeat, Collision } from "../../../types";

interface Props {
  files: FileHeat[];
  collisions: Collision[];
  repoPath: string | null;
}

export function HotspotsPanel({ files, collisions, repoPath }: Props) {
  const collisionPaths = useMemo(
    () => new Set(collisions.map((c) => c.file_path)),
    [collisions],
  );

  if (files.length === 0) {
    return (
      <div className="px-5 py-3">
        <p className="text-[12px] text-white/45">Quiet — no file activity in the last hour.</p>
      </div>
    );
  }

  const maxCount = files[0]?.edit_count ?? 1;

  return (
    <div className="px-5 py-3">
      <table className="w-full">
        <thead className="sr-only">
          <tr><th>File</th><th>Edit count</th><th>Agents</th></tr>
        </thead>
        <tbody>
          {files.map((f) => {
            const widthPct = Math.round((f.edit_count / maxCount) * 100);
            const isCollision = collisionPaths.has(f.path);
            const visibleAgents = f.agents.slice(0, 3);
            const overflow = f.agents.length - visibleAgents.length;
            return (
              <tr key={f.path} className="border-t border-white/5">
                <td className="py-1.5 pr-3 text-[11.5px] text-white/85 font-mono overflow-hidden">
                  <span dir="rtl" className="block truncate">
                    <bdi>{displayPath(f.path, repoPath)}</bdi>
                  </span>
                </td>
                <td className="py-1.5 pr-3 w-[80px]">
                  <div
                    role="progressbar"
                    aria-valuenow={f.edit_count}
                    aria-valuemin={0}
                    aria-valuemax={maxCount}
                    className="h-[4px] bg-white/10 rounded-sm overflow-hidden"
                  >
                    <div
                      className="h-full bg-info"
                      style={{ width: `${widthPct}%` }}
                    />
                  </div>
                </td>
                <td className="py-1.5 w-[80px] text-right">
                  <span className="inline-flex items-center gap-1">
                    {isCollision && <span className="text-warn text-[9px]">▲</span>}
                    {visibleAgents.map((a) => (
                      <span
                        key={a}
                        className="inline-block w-[6px] h-[6px] rounded-full"
                        style={{ backgroundColor: agentColor(a) }}
                        title={a}
                      />
                    ))}
                    {overflow > 0 && (
                      <span className="text-[9px] text-white/45">+{overflow}</span>
                    )}
                  </span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
```

- [ ] **Step 4: Run; expect pass**

```bash
cd app && npx vitest run src/components/layout/overview/__tests__/HotspotsPanel.test.tsx 2>&1 | tail -10
```

Expected: 6 passed.

- [ ] **Step 5: Commit**

```bash
git add app/src/components/layout/overview/HotspotsPanel.tsx app/src/components/layout/overview/__tests__/HotspotsPanel.test.tsx
git commit -m "feat(overview): add HotspotsPanel component"
```

---

## Task 9: AgentCard component

**Files:**
- Create: `app/src/components/layout/overview/AgentCard.tsx`
- Test: `app/src/components/layout/overview/__tests__/AgentCard.test.tsx`

- [ ] **Step 1: Write failing tests**

Create `app/src/components/layout/overview/__tests__/AgentCard.test.tsx`:

```tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { AgentCard } from "../AgentCard";
import type { LiveSessionRow } from "../../../../types";

const baseSession: LiveSessionRow = {
  session_id: "s-1",
  host_kind: "iterm2",
  agent: "claude-code",
  repo_path: "/Users/me/repo",
  started_at: new Date(Date.now() - 5 * 60 * 1000).toISOString(),
  ended_at: new Date().toISOString(),
  model: "claude-opus-4-7",
  is_live: true,
  description: "editing auth.ts",
  files_added: 4,
  cost_usd: 0.42,
};

describe("AgentCard", () => {
  it("renders as a button for native a11y", () => {
    const { container } = render(
      <AgentCard agent="claude-code" sessions={[baseSession]} onSelect={() => {}} />,
    );
    const btn = container.querySelector("button");
    expect(btn).toBeInTheDocument();
    expect(btn?.getAttribute("type")).toBe("button");
  });

  it("displays display name, model, description", () => {
    render(<AgentCard agent="claude-code" sessions={[baseSession]} onSelect={() => {}} />);
    expect(screen.getByText("Claude Code")).toBeInTheDocument();
    expect(screen.getByText("claude-opus-4-7")).toBeInTheDocument();
    expect(screen.getByText("editing auth.ts")).toBeInTheDocument();
  });

  it("calls onSelect with most recent live session_id when clicked", () => {
    const older: LiveSessionRow = { ...baseSession, session_id: "s-old", started_at: new Date(Date.now() - 60 * 60 * 1000).toISOString() };
    const newer: LiveSessionRow = { ...baseSession, session_id: "s-new", started_at: new Date(Date.now() - 60 * 1000).toISOString() };
    const onSelect = vi.fn();
    render(<AgentCard agent="claude-code" sessions={[older, newer]} onSelect={onSelect} />);
    fireEvent.click(screen.getByRole("button"));
    expect(onSelect).toHaveBeenCalledWith("s-new");
  });
});
```

- [ ] **Step 2: Run; expect failure (no module)**

```bash
cd app && npx vitest run src/components/layout/overview/__tests__/AgentCard.test.tsx 2>&1 | tail -5
```

Expected: `Cannot find module '../AgentCard'`.

- [ ] **Step 3: Implement AgentCard**

Create `app/src/components/layout/overview/AgentCard.tsx`:

```tsx
import { AgentGlyph } from "../../AgentGlyph";
import { agentDisplayName, relativeTime, formatCost } from "../../../types";
import type { LiveSessionRow } from "../../../types";

interface Props {
  agent: string;
  sessions: LiveSessionRow[];
  onSelect: (sessionId: string) => void;
}

export function AgentCard({ agent, sessions, onSelect }: Props) {
  // Most recent live session by started_at desc.
  const liveSorted = sessions
    .filter((s) => s.is_live)
    .sort((a, b) => b.started_at.localeCompare(a.started_at));
  const top = liveSorted[0];
  if (!top) return null; // logic-impossibility guard; AgentGrid filters live agents only.

  const displayName = agentDisplayName(agent);
  const totalFiles = liveSorted.reduce((s, sess) => s + (sess.files_added ?? 0), 0);
  const totalCost = liveSorted.reduce((s, sess) => s + (sess.cost_usd ?? 0), 0);

  return (
    <button
      type="button"
      aria-label={`View ${displayName}'s most recent session`}
      className="text-left w-full bg-white/[0.025] border border-white/[0.06] rounded p-2.5 hover:bg-white/5 transition-colors duration-fast focus-visible:outline focus-visible:outline-1 focus-visible:outline-offset-1 focus-visible:outline-white/40"
      onClick={() => onSelect(top.session_id)}
    >
      <div className="flex items-center gap-2 mb-1.5">
        <AgentGlyph agent={agent} size={12} />
        <span className="text-[12px] font-medium text-white/85">{displayName}</span>
        {top.model && (
          <span className="text-[10px] text-white/40 font-mono ml-auto truncate">
            {top.model}
          </span>
        )}
      </div>
      <p className="text-[11px] text-white/55 mb-1.5 truncate">{top.description}</p>
      <div className="flex items-center justify-between text-[10px] text-white/45 tabular-nums">
        <span>{totalFiles} {totalFiles === 1 ? "file" : "files"}</span>
        <span>{relativeTime(top.started_at)}</span>
        {totalCost > 0 && <span>{formatCost(totalCost)}</span>}
      </div>
    </button>
  );
}
```

- [ ] **Step 4: Run; expect pass**

```bash
cd app && npx vitest run src/components/layout/overview/__tests__/AgentCard.test.tsx 2>&1 | tail -10
```

Expected: 3 passed.

- [ ] **Step 5: Commit**

```bash
git add app/src/components/layout/overview/AgentCard.tsx app/src/components/layout/overview/__tests__/AgentCard.test.tsx
git commit -m "feat(overview): add AgentCard component"
```

---

## Task 10: StatsRow + CollisionBanner

**Files:**
- Create: `app/src/components/layout/overview/StatsRow.tsx`
- Create: `app/src/components/layout/overview/CollisionBanner.tsx`
- Test: `app/src/components/layout/overview/__tests__/StatsRow.test.tsx`
- Test: `app/src/components/layout/overview/__tests__/CollisionBanner.test.tsx`

- [ ] **Step 1: Write failing tests**

Create `app/src/components/layout/overview/__tests__/StatsRow.test.tsx`:

```tsx
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { StatsRow } from "../StatsRow";

describe("StatsRow", () => {
  it("renders burn rate, agent count, files today", () => {
    render(
      <StatsRow burnRatePerHour={2.4} activeAgents={3} totalAgents={5} filesToday={187} />,
    );
    expect(screen.getByText(/\$2\.40/)).toBeInTheDocument();
    expect(screen.getByText(/of 5/)).toBeInTheDocument();
    expect(screen.getByText("187")).toBeInTheDocument();
  });

  it("renders em-dash when burn rate is null", () => {
    render(
      <StatsRow burnRatePerHour={null} activeAgents={3} totalAgents={5} filesToday={0} />,
    );
    expect(screen.getByText("—")).toBeInTheDocument();
  });
});
```

Create `app/src/components/layout/overview/__tests__/CollisionBanner.test.tsx`:

```tsx
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { CollisionBanner } from "../CollisionBanner";

describe("CollisionBanner", () => {
  it("renders nothing when no collisions", () => {
    const { container } = render(<CollisionBanner collisions={[]} />);
    expect(container.firstChild).toBeNull();
  });

  it("renders an alert with role='alert' when collisions exist", () => {
    render(
      <CollisionBanner
        collisions={[{ file_path: "/r/auth.ts", agents: ["claude-code", "cursor"] }]}
      />,
    );
    expect(screen.getByRole("alert")).toBeInTheDocument();
    expect(screen.getByText(/auth\.ts/)).toBeInTheDocument();
  });

  it("shows '+N more' when multiple collisions", () => {
    render(
      <CollisionBanner
        collisions={[
          { file_path: "/r/a.ts", agents: ["claude-code", "cursor"] },
          { file_path: "/r/b.ts", agents: ["claude-code", "codex"] },
          { file_path: "/r/c.ts", agents: ["cursor", "codex"] },
        ]}
      />,
    );
    expect(screen.getByText(/\+2 more/)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run; expect failures**

```bash
cd app && npx vitest run src/components/layout/overview/__tests__/StatsRow.test.tsx src/components/layout/overview/__tests__/CollisionBanner.test.tsx 2>&1 | tail -8
```

Expected: both fail with `Cannot find module`.

- [ ] **Step 3: Implement components**

Create `app/src/components/layout/overview/StatsRow.tsx`:

```tsx
import { formatCost } from "../../../types";

interface Props {
  burnRatePerHour: number | null;
  activeAgents: number;
  totalAgents: number;
  filesToday: number;
}

export function StatsRow({ burnRatePerHour, activeAgents, totalAgents, filesToday }: Props) {
  return (
    <section
      aria-label="Workspace stats"
      className="grid grid-cols-3 border-b border-white/[0.06]"
    >
      <Stat label="Burn rate" value={burnRatePerHour != null ? formatCost(burnRatePerHour) : "—"} suffix={burnRatePerHour != null ? "/hr" : null} />
      <Stat label="Active agents" value={String(activeAgents)} suffix={`of ${totalAgents}`} />
      <Stat label="Files today" value={filesToday.toLocaleString()} suffix={null} />
    </section>
  );
}

function Stat({ label, value, suffix }: { label: string; value: string; suffix: string | null }) {
  return (
    <div className="px-4 py-3 border-r border-white/[0.06] last:border-r-0">
      <p className="text-[9px] uppercase tracking-[0.08em] text-white/35 mb-1">{label}</p>
      <p className="text-[16px] font-medium text-white/90 tabular-nums">
        {value}
        {suffix && <span className="text-[11px] text-white/45 ml-1.5">{suffix}</span>}
      </p>
    </div>
  );
}
```

Create `app/src/components/layout/overview/CollisionBanner.tsx`:

```tsx
import { agentDisplayName } from "../../../types";
import { displayPath } from "../../../lib/path";
import type { Collision } from "../../../types";

interface Props {
  collisions: Collision[];
}

export function CollisionBanner({ collisions }: Props) {
  if (collisions.length === 0) return null;
  const first = collisions[0];

  return (
    <div
      role="alert"
      aria-live="polite"
      className="bg-rose-500/10 border-b border-rose-400/20 px-4 py-1.5 flex items-center gap-2 text-[11px] text-rose-200"
    >
      <span className="w-1.5 h-1.5 rounded-full bg-rose-400 animate-pulse-alive flex-shrink-0" />
      <span className="font-medium">Conflict</span>
      <span className="font-mono text-rose-200/75 truncate">
        {displayPath(first.file_path, null)}
      </span>
      <span className="text-rose-200/55 ml-auto flex-shrink-0">
        {first.agents.map(agentDisplayName).join(" · ")}
      </span>
      {collisions.length > 1 && (
        <span className="text-rose-200/55 flex-shrink-0">+{collisions.length - 1} more</span>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Run; expect pass**

```bash
cd app && npx vitest run src/components/layout/overview/__tests__/StatsRow.test.tsx src/components/layout/overview/__tests__/CollisionBanner.test.tsx 2>&1 | tail -10
```

Expected: 5 passed total.

- [ ] **Step 5: Commit**

```bash
git add app/src/components/layout/overview/StatsRow.tsx app/src/components/layout/overview/CollisionBanner.tsx app/src/components/layout/overview/__tests__/StatsRow.test.tsx app/src/components/layout/overview/__tests__/CollisionBanner.test.tsx
git commit -m "feat(overview): add StatsRow and CollisionBanner"
```

---

## Task 11: AgentGrid composition

**Files:**
- Create: `app/src/components/layout/overview/AgentGrid.tsx`
- Test: `app/src/components/layout/overview/__tests__/AgentGrid.test.tsx`

- [ ] **Step 1: Write failing tests**

Create `app/src/components/layout/overview/__tests__/AgentGrid.test.tsx`:

```tsx
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { AgentGrid } from "../AgentGrid";
import type { LiveSessionRow } from "../../../../types";

const live = (overrides: Partial<LiveSessionRow>): LiveSessionRow => ({
  session_id: "s",
  host_kind: "iterm2",
  agent: "claude-code",
  repo_path: null,
  started_at: new Date().toISOString(),
  ended_at: new Date().toISOString(),
  model: null,
  is_live: true,
  description: "",
  ...overrides,
});

describe("AgentGrid", () => {
  it("renders one card per distinct live agent", () => {
    const sessions: LiveSessionRow[] = [
      live({ session_id: "s1", agent: "claude-code", description: "claude work" }),
      live({ session_id: "s2", agent: "cursor", description: "cursor work" }),
      live({ session_id: "s3", agent: "claude-code", description: "more claude" }),
    ];
    render(<AgentGrid liveSessions={sessions} onSelect={() => {}} />);
    expect(screen.getByText("Claude Code")).toBeInTheDocument();
    expect(screen.getByText("Cursor")).toBeInTheDocument();
    // Only one Claude Code card despite two sessions.
    expect(screen.getAllByRole("button")).toHaveLength(2);
  });

  it("excludes agents whose sessions are all not-live", () => {
    const sessions: LiveSessionRow[] = [
      live({ agent: "claude-code", is_live: true }),
      live({ agent: "cursor", is_live: false }),
    ];
    render(<AgentGrid liveSessions={sessions} onSelect={() => {}} />);
    expect(screen.getByText("Claude Code")).toBeInTheDocument();
    expect(screen.queryByText("Cursor")).not.toBeInTheDocument();
  });

  it("shows empty caption when no live agents", () => {
    render(<AgentGrid liveSessions={[]} onSelect={() => {}} />);
    expect(screen.getByText(/No active agents/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run; expect failure (no module)**

```bash
cd app && npx vitest run src/components/layout/overview/__tests__/AgentGrid.test.tsx 2>&1 | tail -5
```

Expected: `Cannot find module '../AgentGrid'`.

- [ ] **Step 3: Implement AgentGrid**

Create `app/src/components/layout/overview/AgentGrid.tsx`:

```tsx
import { useMemo } from "react";
import { AgentCard } from "./AgentCard";
import type { LiveSessionRow } from "../../../types";

interface Props {
  liveSessions: LiveSessionRow[];
  onSelect: (sessionId: string) => void;
}

export function AgentGrid({ liveSessions, onSelect }: Props) {
  const byAgent = useMemo(() => {
    const map = new Map<string, LiveSessionRow[]>();
    for (const s of liveSessions) {
      if (!s.is_live) continue;
      const list = map.get(s.agent) ?? [];
      list.push(s);
      map.set(s.agent, list);
    }
    return map;
  }, [liveSessions]);

  if (byAgent.size === 0) {
    return (
      <div className="px-5 py-3">
        <p className="text-[12px] text-white/45">No active agents.</p>
      </div>
    );
  }

  return (
    <div className="px-5 py-3 grid gap-2" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(190px, 1fr))" }}>
      {[...byAgent.entries()].map(([agent, sessions]) => (
        <AgentCard key={agent} agent={agent} sessions={sessions} onSelect={onSelect} />
      ))}
    </div>
  );
}
```

- [ ] **Step 4: Run; expect pass**

```bash
cd app && npx vitest run src/components/layout/overview/__tests__/AgentGrid.test.tsx 2>&1 | tail -10
```

Expected: 3 passed.

- [ ] **Step 5: Commit**

```bash
git add app/src/components/layout/overview/AgentGrid.tsx app/src/components/layout/overview/__tests__/AgentGrid.test.tsx
git commit -m "feat(overview): add AgentGrid composition"
```

---

## Task 12: OverviewPane composition

**Files:**
- Create: `app/src/components/layout/overview/OverviewPane.tsx`
- Test: `app/src/components/layout/overview/__tests__/OverviewPane.test.tsx`

- [ ] **Step 1: Write failing tests**

Create `app/src/components/layout/overview/__tests__/OverviewPane.test.tsx`:

```tsx
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { OverviewPane } from "../OverviewPane";
import type { LiveSessionRow, Collision, FileHeat, HourBucket } from "../../../../types";

const baseProps = {
  liveSessions: [] as LiveSessionRow[],
  collisions: [] as Collision[],
  topEditedFiles: [] as FileHeat[],
  hourlyActivity: [] as HourBucket[],
  burnRatePerHour: 0,
  activeAgents: 0,
  totalAgents: 0,
  filesToday: 0,
  onSelect: () => {},
};

describe("OverviewPane", () => {
  it("renders all 5 sections (or their empty states) when called with empty data", () => {
    const { container } = render(<OverviewPane {...baseProps} />);
    // StatsRow always renders
    expect(container.querySelector("[aria-label='Workspace stats']")).toBeInTheDocument();
    // CollisionBanner is conditional — null with no collisions
    expect(container.querySelector("[role='alert']")).toBeNull();
    // AgentGrid empty caption
    expect(screen.getByText(/No active agents/i)).toBeInTheDocument();
    // HourlyChart empty caption
    expect(screen.getByText(/Activity will populate/i)).toBeInTheDocument();
    // HotspotsPanel empty caption
    expect(screen.getByText(/Quiet — no file activity/i)).toBeInTheDocument();
  });

  it("renders the collision banner when collisions are present", () => {
    render(
      <OverviewPane
        {...baseProps}
        collisions={[{ file_path: "/r/a.ts", agents: ["claude-code", "cursor"] }]}
      />,
    );
    expect(screen.getByRole("alert")).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run; expect failure (no module)**

```bash
cd app && npx vitest run src/components/layout/overview/__tests__/OverviewPane.test.tsx 2>&1 | tail -5
```

Expected: `Cannot find module '../OverviewPane'`.

- [ ] **Step 3: Implement OverviewPane**

Create `app/src/components/layout/overview/OverviewPane.tsx`:

```tsx
import { StatsRow } from "./StatsRow";
import { CollisionBanner } from "./CollisionBanner";
import { AgentGrid } from "./AgentGrid";
import { HourlyChart } from "./HourlyChart";
import { HotspotsPanel } from "./HotspotsPanel";
import type { LiveSessionRow, Collision, FileHeat, HourBucket } from "../../../types";

interface Props {
  liveSessions: LiveSessionRow[];
  collisions: Collision[];
  topEditedFiles: FileHeat[];
  hourlyActivity: HourBucket[];
  burnRatePerHour: number | null;
  activeAgents: number;
  totalAgents: number;
  filesToday: number;
  onSelect: (sessionId: string) => void;
}

export function OverviewPane(props: Props) {
  return (
    <section aria-label="Overview" className="h-full overflow-y-auto">
      <StatsRow
        burnRatePerHour={props.burnRatePerHour}
        activeAgents={props.activeAgents}
        totalAgents={props.totalAgents}
        filesToday={props.filesToday}
      />
      <CollisionBanner collisions={props.collisions} />
      <SectionHeader>Active agents</SectionHeader>
      <AgentGrid liveSessions={props.liveSessions} onSelect={props.onSelect} />
      <SectionHeader>Last 24h</SectionHeader>
      <HourlyChart buckets={props.hourlyActivity} now={new Date()} />
      <SectionHeader>Most edited (last hour)</SectionHeader>
      <HotspotsPanel
        files={props.topEditedFiles}
        collisions={props.collisions}
        repoPath={null}
      />
    </section>
  );
}

function SectionHeader({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="px-5 pt-3 pb-1 text-[9px] uppercase tracking-[0.08em] text-white/35">
      {children}
    </h3>
  );
}
```

- [ ] **Step 4: Run; expect pass**

```bash
cd app && npx vitest run src/components/layout/overview/__tests__/OverviewPane.test.tsx 2>&1 | tail -10
```

Expected: 2 passed.

- [ ] **Step 5: Commit**

```bash
git add app/src/components/layout/overview/OverviewPane.tsx app/src/components/layout/overview/__tests__/OverviewPane.test.tsx
git commit -m "feat(overview): add OverviewPane composition"
```

---

## Task 13: TopBar mode-link row

**Files:**
- Modify: `app/src/components/TopBar.tsx`
- Test: `app/src/components/__tests__/TopBar-overview.test.tsx`

- [ ] **Step 1: Read current TopBar to understand its API**

```bash
cat app/src/components/TopBar.tsx
```

Note its current props (it currently receives `connected`, `hasNewEvents`, `onOpenCmd`).

- [ ] **Step 2: Write failing tests**

Create `app/src/components/__tests__/TopBar-overview.test.tsx`:

```tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { TopBar } from "../TopBar";

const baseProps = {
  connected: true,
  hasNewEvents: false,
  onOpenCmd: () => {},
  viewMode: "overview" as const,
  setViewMode: vi.fn(),
  hasSelectedSession: true,
};

describe("TopBar mode link row", () => {
  it("renders Overview and Session links", () => {
    render(<TopBar {...baseProps} />);
    expect(screen.getByText("Overview")).toBeInTheDocument();
    expect(screen.getByText("Session")).toBeInTheDocument();
  });

  it("Overview link is the active state when viewMode='overview'", () => {
    render(<TopBar {...baseProps} viewMode="overview" />);
    const overview = screen.getByText("Overview").closest("button");
    expect(overview?.className).toContain("text-white");
  });

  it("Session link is disabled when no session selected", () => {
    render(<TopBar {...baseProps} hasSelectedSession={false} />);
    const session = screen.getByText("Session").closest("button");
    expect(session?.disabled).toBe(true);
  });

  it("clicking Overview calls setViewMode('overview')", () => {
    const setViewMode = vi.fn();
    render(<TopBar {...baseProps} viewMode="session" setViewMode={setViewMode} />);
    fireEvent.click(screen.getByText("Overview"));
    expect(setViewMode).toHaveBeenCalledWith("overview");
  });

  it("clicking enabled Session calls setViewMode('session')", () => {
    const setViewMode = vi.fn();
    render(<TopBar {...baseProps} viewMode="overview" setViewMode={setViewMode} />);
    fireEvent.click(screen.getByText("Session"));
    expect(setViewMode).toHaveBeenCalledWith("session");
  });

  it("Session link has title attribute with keyboard hint", () => {
    render(<TopBar {...baseProps} />);
    const session = screen.getByText("Session").closest("button");
    expect(session?.getAttribute("title")).toMatch(/⌘2|Cmd\+2/);
  });
});
```

- [ ] **Step 3: Run; expect failure**

```bash
cd app && npx vitest run src/components/__tests__/TopBar-overview.test.tsx 2>&1 | tail -10
```

Expected: type errors / "viewMode is not a prop" failures.

- [ ] **Step 4: Modify TopBar**

In `app/src/components/TopBar.tsx`, expand the props interface and render the mode link row.

Add to the props interface:

```ts
viewMode: "overview" | "session";
setViewMode: (m: "overview" | "session") => void;
hasSelectedSession: boolean;
```

Render between the existing left section (logo + connected dot) and right section (⌘K hint), insert:

```tsx
<div className="flex items-center gap-2 text-[12px]">
  <button
    type="button"
    title="⌘1"
    className={viewMode === "overview" ? "text-white border-b border-white" : "text-white/45 hover:text-white/75"}
    onClick={() => setViewMode("overview")}
  >
    Overview
  </button>
  <span className="text-white/25" aria-hidden>·</span>
  <button
    type="button"
    title="⌘2"
    disabled={!hasSelectedSession}
    className={
      !hasSelectedSession
        ? "text-white/25 cursor-not-allowed"
        : viewMode === "session"
          ? "text-white border-b border-white"
          : "text-white/45 hover:text-white/75"
    }
    onClick={() => hasSelectedSession && setViewMode("session")}
  >
    Session
  </button>
</div>
```

- [ ] **Step 5: Run; expect pass**

```bash
cd app && npx vitest run src/components/__tests__/TopBar-overview.test.tsx 2>&1 | tail -10
```

Expected: 6 passed.

- [ ] **Step 6: Commit**

```bash
git add app/src/components/TopBar.tsx app/src/components/__tests__/TopBar-overview.test.tsx
git commit -m "feat(topbar): add Overview/Session mode link row"
```

---

## Task 14: App.tsx wiring + integration tests

**Files:**
- Modify: `app/src/App.tsx`
- Modify: `app/src/components/layout/MiddlePane.tsx`
- Test: `app/src/__tests__/App-overview.test.tsx`

The render decision becomes:

```
viewMode === "session" && selected != null  → MiddlePane per-session detail (existing)
sessions.length === 0 (no agents at all)    → MiddlePane "No agents active" hero
otherwise                                   → MiddlePane <OverviewPane />
```

- [ ] **Step 1: Update MiddlePane to render Overview**

In `app/src/components/layout/MiddlePane.tsx`, accept new props for Overview data and render it when `viewMode === "overview"`. Add to the `Props` interface:

```ts
viewMode: "overview" | "session";
overviewData: {
  liveSessions: import("../../types").LiveSessionRow[];
  collisions: import("../../types").Collision[];
  topEditedFiles: import("../../types").FileHeat[];
  hourlyActivity: import("../../types").HourBucket[];
  burnRatePerHour: number | null;
  activeAgents: number;
  totalAgents: number;
  filesToday: number;
};
onSelect: (sessionId: string) => void;
```

Replace the function body's render branches:

```tsx
import { OverviewPane } from "./overview/OverviewPane";

// ... in the component:
if (viewMode === "overview" || !session) {
  // Existing "No agents active" hero only when truly no data;
  // otherwise show Overview.
  if (overviewData.liveSessions.length === 0 && overviewData.activeAgents === 0 && overviewData.filesToday === 0) {
    return <NoAgentsHero />;  // extract the existing JSX into a small helper
  }
  return <OverviewPane {...overviewData} onSelect={onSelect} />;
}
// existing per-session render below
```

(Extract the existing "No agents active" centered div into a `NoAgentsHero` const at the bottom of the file to keep the new branch clean.)

- [ ] **Step 2: Write App integration tests**

Create `app/src/__tests__/App-overview.test.tsx`:

```tsx
import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, fireEvent } from "@testing-library/react";
import { useSelection } from "../store/selection";

// Mock useDaemonData so we control what data flows in.
const mockData = {
  events: [],
  activeAgents: [],
  collisions: [],
  agentStats: [],
  eventCount: 0,
  costSummary: { total_cost_usd: 0, agents: [] },
  connected: true,
  error: null,
  agentActivity: new Map(),
  newEventIds: new Set(),
  hasNewEvents: false,
  commitGroups: [],
  workspaceSummary: { commits_today: 0, files_changed_today: 0, total_cost_today: 0, agent_commits: [], active_collisions: [] },
  lastUpdated: Date.now(),
  demoMode: false,
  liveSessions: [],
  cli: { claude: true, codex: false },
  currentSummary: null,
  recentTurns: [],
  reviewSignals: null,
  hourlyActivity: [],
  topEditedFiles: [],
  liveSummary: null,
};

vi.mock("../hooks", () => ({
  useDaemonData: () => mockData,
}));

import App from "../App";

describe("App ⌘1/⌘2 keyboard handling", () => {
  beforeEach(() => {
    localStorage.clear();
    useSelection.setState({
      selectedSessionId: null,
      leftWidth: 280,
      rightWidth: 320,
      rightTab: "changes",
      viewMode: "overview",
    });
  });

  it("⌘1 sets viewMode to 'overview'", () => {
    useSelection.setState({ viewMode: "session", selectedSessionId: "s-1" });
    render(<App />);
    fireEvent.keyDown(window, { key: "1", metaKey: true });
    expect(useSelection.getState().viewMode).toBe("overview");
  });

  it("⌘2 sets viewMode to 'session' when a session is selected", () => {
    useSelection.setState({ selectedSessionId: "s-1", viewMode: "overview" });
    render(<App />);
    fireEvent.keyDown(window, { key: "2", metaKey: true });
    expect(useSelection.getState().viewMode).toBe("session");
  });

  it("⌘2 is no-op when selectedSessionId is null", () => {
    useSelection.setState({ selectedSessionId: null, viewMode: "overview" });
    render(<App />);
    fireEvent.keyDown(window, { key: "2", metaKey: true });
    expect(useSelection.getState().viewMode).toBe("overview");
  });

  it("⌘K still opens command palette and does not flip view mode", () => {
    useSelection.setState({ viewMode: "overview" });
    render(<App />);
    fireEvent.keyDown(window, { key: "k", metaKey: true });
    expect(useSelection.getState().viewMode).toBe("overview");
  });
});
```

- [ ] **Step 3: Run tests; expect failure**

```bash
cd app && npx vitest run src/__tests__/App-overview.test.tsx 2>&1 | tail -10
```

Expected: ⌘1/⌘2 not handled.

- [ ] **Step 4: Wire App.tsx**

In `app/src/App.tsx`:

(a) Add imports:

```ts
import { useSelection } from "./store/selection";
```

(b) Read viewMode and add the launch-resolution effect (after sessions/selected derivations):

```ts
const viewMode = useSelection((s) => s.viewMode);
const setViewMode = useSelection((s) => s.setViewMode);
const setSelected = useSelection((s) => s.setSelected);

useEffect(() => {
  if (selectedId) {
    const s = sessions.find((x) => x.id === selectedId);
    if (!s || !s.isLive) {
      setSelected(null);
      setViewMode("overview");
    }
  }
  // eslint-disable-next-line react-hooks/exhaustive-deps -- launch-only resolution
}, []);
```

(c) Extend the existing keyboard handler:

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

(d) Compute Overview data and pass into MiddlePane + TopBar:

```ts
const overviewData = {
  liveSessions: data.liveSessions ?? [],
  collisions: data.collisions ?? [],
  topEditedFiles: data.topEditedFiles ?? [],
  hourlyActivity: data.hourlyActivity ?? [],
  burnRatePerHour: data.liveSummary?.burn_rate_per_min != null
    ? data.liveSummary.burn_rate_per_min * 60
    : null,
  activeAgents: data.liveSummary?.active_session_count ?? 0,
  totalAgents: data.agentStats.length,
  filesToday: data.workspaceSummary?.files_changed_today ?? 0,
};

function onAgentSelect(sessionId: string) {
  setSelected(sessionId);
  setViewMode("session");
}
```

Pass `viewMode`, `overviewData`, `onAgentSelect` into `<MiddlePane ...>` and `viewMode`, `setViewMode`, `hasSelectedSession={selected != null}` into `<TopBar ...>`.

- [ ] **Step 5: Run all tests; expect green**

```bash
cd app && npx vitest run 2>&1 | tail -20
```

Expected: all suites green.

- [ ] **Step 6: Commit**

```bash
git add app/src/App.tsx app/src/components/layout/MiddlePane.tsx app/src/__tests__/App-overview.test.tsx
git commit -m "feat(app): wire Overview view, ⌘1/⌘2 keyboard, launch resolution"
```

---

## Task 15: Manual smoke pass

**Files:** none (manual verification)

- [ ] **Step 1: Start the dev environment**

```bash
./dev.sh ~/conductor
```

Wait for the Tauri window to launch.

- [ ] **Step 2: Verify launch state**

- App opens directly to the Overview view (default `viewMode` = "overview")
- TopBar shows `Vigil ● Overview · Session ⌘K`
- "Session" link is muted/disabled if no session is selected

- [ ] **Step 3: Verify Overview content with live agents**

If there are active Claude / Cursor / Codex sessions running:
- StatsRow shows non-zero burn rate, agent count, files today
- AgentGrid renders one card per live agent
- HourlyChart renders 24 buckets with stacked color segments
- HotspotsPanel renders top 5 files with normalized heat bars

- [ ] **Step 4: Verify ⌘1 / ⌘2 toggle**

- Click an AgentCard → drills into per-session view (⌘2 mode)
- Press ⌘1 → returns to Overview
- Press ⌘2 → returns to per-session view
- Press ⌘1 then click "Session" link with no selection → no-op

- [ ] **Step 5: Verify daemon-disconnect resilience**

- Stop the daemon (`pkill -f vigil-daemon` or whatever the local recipe is)
- Existing rose "Daemon not reachable" banner appears at top
- Overview still renders the last cached state; chart stops updating

---

## Task 16: Final checks + push

**Files:** none

- [ ] **Step 1: Run full vitest**

```bash
cd app && npx vitest run 2>&1 | tail -15
```

Expected: all suites green.

- [ ] **Step 2: Run cargo test**

```bash
cd app/src-tauri && cargo test 2>&1 | tail -10
```

Expected: all green.

- [ ] **Step 3: tsc clean**

```bash
cd app && npx tsc --noEmit
```

Expected: no output.

- [ ] **Step 4: cargo check**

```bash
cd app/src-tauri && cargo check
```

Expected: `Finished` with no errors.

- [ ] **Step 5: Push (no merge)**

```bash
git push -u origin claude/v3-agentic-overview
```

Expected: branch published. **Do NOT run `git push origin claude/v3-agentic-overview:main`** — this branch is for review only.

---

## Self-Review

Before handing off, verify the plan covers every spec requirement:

- ✅ Q1 (stacked bars, 2px floor, 5 X-tick labels, no Y labels, empty caption) — Task 7
- ✅ Q2 (hotspots separate from collisions, ▲ marker, relative heat bars, agent dots + overflow, empty caption) — Tasks 8a/8b
- ✅ Q3 (drill-in to most recent live session, `<button type="button">`, no dead cards) — Task 9
- ✅ Q4 (launch resolution, auto-bounce off, mount-only effect with eslint-disable) — Task 14
- ✅ Q5 (StatsRow inside Overview, TopBar mode-link row with disabled state) — Tasks 10 + 13
- ✅ New Tauri commands `get_hourly_activity` + `get_top_edited_files` — Tasks 1, 2, 3
- ✅ Frontend types passthrough through `useDaemonData` — Tasks 4, 5
- ✅ View-mode state with persistence + migration — Task 6
- ✅ `displayPath` extraction to `lib/path.ts` — Task 8a
- ✅ A11y: `role="alert"`, `role="img"`, hidden `<table>` mirror, `<button type="button">`, `role="progressbar"` — Tasks 7, 8b, 9, 10
- ✅ Manual smoke + final checks — Tasks 15, 16
- ✅ GROUP_CONCAT comma guard test — Task 2
- ✅ Window-filter pinning tests for both queries — Tasks 1, 2
- ✅ session_seen excluded from hourly activity — Task 1

No placeholders, no "TBD", every code step shows actual code. Type / function names consistent across tasks (`densifyBuckets`, `query_hourly_activity`, `query_top_edited_files`, `setViewMode`, `viewMode`, `onAgentSelect`).
