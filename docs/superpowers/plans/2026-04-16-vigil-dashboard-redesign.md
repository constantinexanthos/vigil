# Vigil Dashboard Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace Vigil's single-column activity log with a three-pane live dashboard — host-grouped sidebar, plain-English session summaries, and a Conductor-style changes panel, powered by the user's own `claude` CLI.

**Architecture:** Extend the Rust daemon with a host detector (process tree walk), a JSONL tailer for `~/.claude/projects/*.jsonl`, and a summary engine that shells out to `claude -p`. Write new fields to SQLite. Expose via new Tauri commands. Replace the React UI with a three-pane layout that reads host-grouped live sessions, renders a cross-fading plain-English summary in the middle, and a file-changes panel on the right.

**Tech Stack:** Rust (tokio, rusqlite, notify, sysinfo), Tauri v2, React 19, TypeScript (strict), Tailwind 3, Framer Motion 12, Zustand 5, Vitest (new).

**Spec:** `docs/superpowers/specs/2026-04-16-vigil-dashboard-redesign-design.md`

---

## File Structure

### Daemon — Rust (`/daemon/src/`)

| File | Responsibility | Create/Modify |
|------|----------------|---------------|
| `host.rs` | `HostKind` enum, `detect_host(pid)` walks parent chain | Create |
| `sessionlog.rs` | Tail `~/.claude/projects/**/*.jsonl`, parse turns, emit events | Create |
| `summarizer.rs` | Detect CLI, build prompt, subprocess `claude -p`, cache result | Create |
| `store.rs` | Add `host_kind`, `model`, `is_live` columns; new `session_turns`, `session_summaries` tables | Modify |
| `process.rs` | No core change; `identify_agent` stays as-is | Read-only |
| `hooks/claude.rs` | On event ingest, call `host::detect_host(pid)` and persist | Modify |
| `cli.rs` | Wire new workers into `watch` subcommand | Modify |
| `main.rs` | No change expected | Read-only |

### App — Tauri (`/app/src-tauri/src/`)

| File | Responsibility | Create/Modify |
|------|----------------|---------------|
| `commands.rs` | New commands: `get_hosts`, `get_live_sessions`, `get_summary`, `refresh_summary`, `detect_cli`, `save_api_key` | Modify |
| `store.rs` | Read new columns/tables | Modify |
| `main.rs` | Register new commands | Modify |
| `tauri.conf.json` | Window size bump to 1280×800 | Modify |
| `Cargo.toml` | Add `tauri-plugin-keyring` (or equivalent) for Keychain | Modify |

### App — React (`/app/src/`)

| File | Responsibility | Create/Modify |
|------|----------------|---------------|
| `types.ts` | Add `HostKind`; extend `SessionGroup` with `hostKind`, `model`, `isLive`, `summaryPlainEnglish`, `summaryGeneratedAt` | Modify |
| `hooks.ts` | Poll new commands, merge into `DaemonState` | Modify |
| `App.tsx` | Replace scroll layout with `<ThreePaneGrid>` | Modify |
| `store/selection.ts` | Zustand store for `selectedSessionId`, pane widths | Create |
| `lib/host-tokens.ts` | Host color + display-name map | Create |
| `components/layout/ThreePaneGrid.tsx` | CSS grid shell + resizable dividers | Create |
| `components/layout/LeftRail.tsx` | Translucent host-grouped sidebar | Create |
| `components/layout/MiddlePane.tsx` | Session header + summary + stream + footer | Create |
| `components/layout/RightRail.tsx` | Tabs + file list + diff drawer | Create |
| `components/HostGroup.tsx` | Host header row + session children | Create |
| `components/SessionRow.tsx` | Left-rail compact session card | Create |
| `components/SummaryBlock.tsx` | "What's happening" with cross-fade refresh | Create |
| `components/ActivityStream.tsx` | Timestamped activity feed | Create |
| `components/SessionFooter.tsx` | Model / cost / tool count | Create |
| `components/FilesPanel.tsx` | Right-rail file list | Create |
| `components/Onboarding.tsx` | First-run CLI detection + key fallback | Create |
| `components/TopBar.tsx` | Shrink to window chrome + status pill | Modify |
| `components/SetupModal.tsx` | Delete (superseded by `Onboarding.tsx`) | Delete |
| `components/EventTimeline.tsx` | Delete (dead code) | Delete |
| `components/EventRow.tsx` | Delete (dead code) | Delete |

### Frontend test infra

| File | Responsibility | Create/Modify |
|------|----------------|---------------|
| `package.json` | Add `vitest`, `@testing-library/react`, `jsdom`, `@vitest/ui` dev deps; `test` script | Modify |
| `vitest.config.ts` | Vitest config using Vite's React plugin | Create |
| `src/__tests__/*.test.ts(x)` | Pure-function and small-component tests | Create per task |

---

## Conventions

- **Every code step shows the full content needed.** No "similar to Task N."
- **Commits** use Conventional Commits (`feat:`, `fix:`, `test:`, `refactor:`, `chore:`). Trailer: `Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>`.
- **Rust tests** live inline in a `#[cfg(test)] mod tests { ... }` block at the bottom of each module and use `rusqlite::Connection::open_in_memory()` plus `tempfile::TempDir` per existing patterns in `store.rs` and `watcher.rs`.
- **TS tests** live in a colocated `__tests__/` directory; test files end in `.test.ts`/`.test.tsx`.
- **Run Rust tests:** `cd daemon && cargo test`
- **Run TS tests:** `cd app && npm run test`
- **Typecheck:** `cd app && npx tsc --noEmit`
- **Dev run:** `cd app && npm run tauri:dev` (daemon separately: `cd daemon && cargo run -- watch <path>`)

---

# Phase A — Foundations

## Task 1: Window dimensions and dead code removal

**Why:** The redesign needs horizontal room (three panes) and removing unused components prevents confusion.

**Files:**
- Modify: `app/src-tauri/tauri.conf.json`
- Delete: `app/src/components/SetupModal.tsx`
- Delete: `app/src/components/EventTimeline.tsx`
- Delete: `app/src/components/EventRow.tsx`

- [ ] **Step 1: Update window dimensions**

Open `app/src-tauri/tauri.conf.json`. Locate the `"windows"` array. Replace the first window object's size properties:

```json
{
  "title": "Vigil",
  "width": 1280,
  "height": 800,
  "minWidth": 1024,
  "minHeight": 640,
  "resizable": true,
  "decorations": true,
  "transparent": false
}
```

Leave other window fields (url, label, titleBarStyle if present) unchanged.

- [ ] **Step 2: Verify no imports reference the dead components**

```bash
cd /Users/costaxanthos/conductor/repos/vigil/app
grep -rn "SetupModal\|EventTimeline\|EventRow" src/ || echo "No references"
```

Expected: `No references` (or only the definitions themselves).

If references exist in `App.tsx` or elsewhere, remove the imports and any JSX usage before deletion — usage is already dormant per the spec review.

- [ ] **Step 3: Delete the files**

```bash
cd /Users/costaxanthos/conductor/repos/vigil/app
rm src/components/SetupModal.tsx src/components/EventTimeline.tsx src/components/EventRow.tsx
```

- [ ] **Step 4: Typecheck**

```bash
cd /Users/costaxanthos/conductor/repos/vigil/app
npx tsc --noEmit
```

Expected: passes with no errors.

- [ ] **Step 5: Commit**

```bash
cd /Users/costaxanthos/conductor/repos/vigil
git add app/src-tauri/tauri.conf.json app/src/components/
git commit -m "$(cat <<'EOF'
chore: resize window to 1280x800 and delete dead components

Redesign needs three-pane horizontal room; SetupModal/EventTimeline/EventRow
were no longer referenced from App.tsx.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: Shared type additions and Vitest setup

**Why:** Frontend will consume new session fields. Installing Vitest now lets every later task ship with tests.

**Files:**
- Modify: `app/src/types.ts`
- Modify: `app/package.json`
- Create: `app/vitest.config.ts`
- Create: `app/src/__tests__/types.test.ts`

- [ ] **Step 1: Extend `HostKind` and `SessionGroup` in `types.ts`**

Open `app/src/types.ts`. Near the top of the file (before the existing `AgentEvent` interface), add:

```ts
export type HostKind =
  | "ghostty"
  | "iterm2"
  | "terminal"
  | "warp"
  | "kitty"
  | "alacritty"
  | "conductor"
  | "cursor"
  | "vscode"
  | "zed"
  | "windsurf"
  | "unknown";

export const HOST_KINDS: HostKind[] = [
  "ghostty",
  "iterm2",
  "terminal",
  "warp",
  "kitty",
  "alacritty",
  "conductor",
  "cursor",
  "vscode",
  "zed",
  "windsurf",
  "unknown",
];

export function isHostKind(v: string): v is HostKind {
  return (HOST_KINDS as string[]).includes(v);
}
```

Locate the existing `SessionGroup` interface and extend it with new optional fields (do not remove existing fields):

```ts
export interface SessionGroup {
  id: string;
  agent: string;
  repoPath: string;
  startTime: string;
  endTime: string;
  description: string;
  files: SessionFile[];
  confidence: number;
  costUsd: number;
  hasWarning: boolean;
  // NEW below:
  hostKind: HostKind;
  hostPid: number | null;
  model: string | null;
  isLive: boolean;
  summaryPlainEnglish: string | null;
  summaryGeneratedAt: string | null;
}
```

- [ ] **Step 2: Add Vitest and React Testing Library to package.json**

Open `app/package.json`. Add to `devDependencies`:

```json
{
  "devDependencies": {
    "vitest": "^2.1.9",
    "@vitest/ui": "^2.1.9",
    "@testing-library/react": "^16.1.0",
    "@testing-library/jest-dom": "^6.6.3",
    "jsdom": "^25.0.1"
  }
}
```

Add/extend `scripts`:

```json
{
  "scripts": {
    "test": "vitest run",
    "test:watch": "vitest"
  }
}
```

Install:

```bash
cd /Users/costaxanthos/conductor/repos/vigil/app
npm install
```

- [ ] **Step 3: Create `vitest.config.ts`**

Create `app/vitest.config.ts`:

```ts
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    globals: true,
    include: ["src/**/*.test.{ts,tsx}"],
  },
});
```

- [ ] **Step 4: Write the failing test for `isHostKind`**

Create `app/src/__tests__/types.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { isHostKind, HOST_KINDS } from "../types";

describe("isHostKind", () => {
  it("accepts every kind in HOST_KINDS", () => {
    for (const k of HOST_KINDS) {
      expect(isHostKind(k)).toBe(true);
    }
  });

  it("rejects unknown strings", () => {
    expect(isHostKind("")).toBe(false);
    expect(isHostKind("claude-code")).toBe(false);
    expect(isHostKind("TERMINAL")).toBe(false);
  });
});
```

- [ ] **Step 5: Run tests — expect PASS**

```bash
cd /Users/costaxanthos/conductor/repos/vigil/app
npm run test
```

Expected: `isHostKind > accepts every kind in HOST_KINDS` and `> rejects unknown strings` both pass.

- [ ] **Step 6: Typecheck**

```bash
cd /Users/costaxanthos/conductor/repos/vigil/app
npx tsc --noEmit
```

Expected: passes. If `SessionGroup` is constructed anywhere (e.g., in `types.ts::groupEventsIntoSessions` or `demo-data.ts`), new required fields will error — add placeholder defaults in those construction sites:

- `hostKind: "unknown"`
- `hostPid: null`
- `model: null`
- `isLive: false`
- `summaryPlainEnglish: null`
- `summaryGeneratedAt: null`

These will be replaced with real values once the backend populates them.

- [ ] **Step 7: Commit**

```bash
cd /Users/costaxanthos/conductor/repos/vigil
git add app/
git commit -m "$(cat <<'EOF'
feat: add HostKind type, extend SessionGroup, install Vitest

Frontend prep for host-grouped dashboard. New SessionGroup fields default
to unknown/null until the daemon starts populating them.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

# Phase B — Daemon: Host Detection

## Task 3: HostKind enum and `detect_host` with process tree walking

**Why:** We need to tag every session with the terminal emulator / IDE it was launched from. Walk the parent chain, match against known signatures.

**Files:**
- Create: `daemon/src/host.rs`
- Modify: `daemon/src/main.rs` (add module declaration)

- [ ] **Step 1: Create module skeleton**

Create `daemon/src/host.rs`:

```rust
use serde::{Deserialize, Serialize};
use sysinfo::{Pid, System};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum HostKind {
    Ghostty,
    Iterm2,
    Terminal,
    Warp,
    Kitty,
    Alacritty,
    Conductor,
    Cursor,
    Vscode,
    Zed,
    Windsurf,
    Unknown,
}

impl HostKind {
    pub fn as_str(self) -> &'static str {
        match self {
            HostKind::Ghostty => "ghostty",
            HostKind::Iterm2 => "iterm2",
            HostKind::Terminal => "terminal",
            HostKind::Warp => "warp",
            HostKind::Kitty => "kitty",
            HostKind::Alacritty => "alacritty",
            HostKind::Conductor => "conductor",
            HostKind::Cursor => "cursor",
            HostKind::Vscode => "vscode",
            HostKind::Zed => "zed",
            HostKind::Windsurf => "windsurf",
            HostKind::Unknown => "unknown",
        }
    }
}

const MAX_WALK_DEPTH: usize = 12;

fn classify(process_name: &str) -> Option<HostKind> {
    let n = process_name.to_ascii_lowercase();
    if n.contains("ghostty") { return Some(HostKind::Ghostty); }
    if n.contains("iterm") { return Some(HostKind::Iterm2); }
    if n == "terminal" || n.contains("terminal.app") { return Some(HostKind::Terminal); }
    if n.contains("warp") { return Some(HostKind::Warp); }
    if n.contains("kitty") { return Some(HostKind::Kitty); }
    if n.contains("alacritty") { return Some(HostKind::Alacritty); }
    if n.contains("conductor") { return Some(HostKind::Conductor); }
    if n.contains("windsurf") { return Some(HostKind::Windsurf); }
    if n.contains("cursor") { return Some(HostKind::Cursor); }
    if n == "code" || n.contains("code - insiders") || n.contains("visual studio code") {
        return Some(HostKind::Vscode);
    }
    if n == "zed" || n.contains("zed-editor") { return Some(HostKind::Zed); }
    None
}

pub fn detect_host(sys: &System, start_pid: u32) -> HostKind {
    let mut cursor: Pid = Pid::from_u32(start_pid);
    for _ in 0..MAX_WALK_DEPTH {
        let Some(proc_) = sys.process(cursor) else { return HostKind::Unknown };
        if let Some(kind) = classify(proc_.name().to_string_lossy().as_ref()) {
            return kind;
        }
        match proc_.parent() {
            Some(parent) if parent.as_u32() != 0 && parent.as_u32() != cursor.as_u32() => {
                cursor = parent;
            }
            _ => return HostKind::Unknown,
        }
    }
    HostKind::Unknown
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn classify_known_names() {
        assert_eq!(classify("ghostty"), Some(HostKind::Ghostty));
        assert_eq!(classify("iTerm2"), Some(HostKind::Iterm2));
        assert_eq!(classify("Terminal"), Some(HostKind::Terminal));
        assert_eq!(classify("Warp"), Some(HostKind::Warp));
        assert_eq!(classify("kitty"), Some(HostKind::Kitty));
        assert_eq!(classify("Alacritty"), Some(HostKind::Alacritty));
        assert_eq!(classify("Conductor"), Some(HostKind::Conductor));
        assert_eq!(classify("Cursor"), Some(HostKind::Cursor));
        assert_eq!(classify("Code"), Some(HostKind::Vscode));
        assert_eq!(classify("zed"), Some(HostKind::Zed));
        assert_eq!(classify("Windsurf"), Some(HostKind::Windsurf));
    }

    #[test]
    fn classify_unknown() {
        assert_eq!(classify("bash"), None);
        assert_eq!(classify("claude"), None);
        assert_eq!(classify(""), None);
    }

    #[test]
    fn detect_host_returns_unknown_for_bogus_pid() {
        let sys = System::new();
        assert_eq!(detect_host(&sys, u32::MAX), HostKind::Unknown);
    }
}
```

- [ ] **Step 2: Register the module**

Open `daemon/src/main.rs`. Add `mod host;` alongside the other `mod` declarations (preserve order with other modules; alphabetical fits).

- [ ] **Step 3: Run tests**

```bash
cd /Users/costaxanthos/conductor/repos/vigil/daemon
cargo test host::
```

Expected: `classify_known_names`, `classify_unknown`, `detect_host_returns_unknown_for_bogus_pid` all pass.

- [ ] **Step 4: Commit**

```bash
cd /Users/costaxanthos/conductor/repos/vigil
git add daemon/src/host.rs daemon/src/main.rs
git commit -m "$(cat <<'EOF'
feat(daemon): add HostKind and detect_host process-tree walker

New host module classifies terminal emulators and IDE-as-agent apps by
walking parent processes up to 12 levels. Unknown bucket for unmatched.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: Add `host_kind`, `model`, `is_live` columns to events table

**Why:** Persist host classification at write-time so queries don't re-walk processes.

**Files:**
- Modify: `daemon/src/store.rs`

- [ ] **Step 1: Write the failing test**

Append to the `#[cfg(test)] mod tests` block at the bottom of `daemon/src/store.rs`:

```rust
#[test]
fn schema_has_host_kind_and_model_columns() {
    let store = Store::open_in_memory().unwrap();
    let conn = store.conn();
    let mut stmt = conn.prepare("PRAGMA table_info(events)").unwrap();
    let cols: Vec<String> = stmt
        .query_map([], |row| row.get::<_, String>(1))
        .unwrap()
        .filter_map(Result::ok)
        .collect();
    assert!(cols.contains(&"host_kind".to_string()), "missing host_kind column");
    assert!(cols.contains(&"model".to_string()), "missing model column");
    assert!(cols.contains(&"is_live".to_string()), "missing is_live column");
}
```

Note: if `Store` does not currently expose a `conn()` accessor, add this method near the `Store::open_in_memory` definition:

```rust
impl Store {
    pub fn conn(&self) -> &rusqlite::Connection {
        &self.conn
    }
}
```

(Adjust field name if the internal connection field is named differently — verify by reading the top of the file.)

- [ ] **Step 2: Run test — expect FAIL**

```bash
cd /Users/costaxanthos/conductor/repos/vigil/daemon
cargo test store::tests::schema_has_host_kind_and_model_columns
```

Expected: FAIL with "missing host_kind column".

- [ ] **Step 3: Add columns to schema**

In `daemon/src/store.rs`, locate the `init_schema` function (or wherever the `CREATE TABLE events` statement lives). Modify the `CREATE TABLE events` statement to include:

```sql
CREATE TABLE IF NOT EXISTS events (
    id INTEGER PRIMARY KEY,
    timestamp TEXT NOT NULL,
    kind TEXT NOT NULL,
    file_path TEXT,
    agent TEXT NOT NULL,
    session_id TEXT,
    repo_path TEXT,
    branch TEXT,
    diff TEXT,
    metadata TEXT,
    host_kind TEXT,
    model TEXT,
    is_live INTEGER NOT NULL DEFAULT 0
);
```

For existing databases, add a migration after the `CREATE TABLE`:

```rust
let _ = conn.execute("ALTER TABLE events ADD COLUMN host_kind TEXT", []);
let _ = conn.execute("ALTER TABLE events ADD COLUMN model TEXT", []);
let _ = conn.execute("ALTER TABLE events ADD COLUMN is_live INTEGER NOT NULL DEFAULT 0", []);
```

(`let _` is intentional — `ALTER` will fail harmlessly on fresh DBs where columns already exist from `CREATE TABLE`, or on already-migrated DBs.)

- [ ] **Step 4: Extend `AgentEvent` struct**

In the same file, locate the `AgentEvent` struct. Add fields:

```rust
pub struct AgentEvent {
    pub id: Option<i64>,
    pub timestamp: DateTime<Utc>,
    pub kind: EventKind,
    pub file_path: Option<String>,
    pub agent: String,
    pub session_id: Option<String>,
    pub repo_path: Option<String>,
    pub branch: Option<String>,
    pub diff: Option<String>,
    pub metadata: Option<String>,
    // NEW below:
    pub host_kind: Option<String>,   // store as string (use HostKind::as_str())
    pub model: Option<String>,
    pub is_live: bool,
}
```

Update `Store::insert` to persist the new fields:

```rust
let id = conn.execute(
    "INSERT INTO events (timestamp, kind, file_path, agent, session_id, repo_path, branch, diff, metadata, host_kind, model, is_live) \
     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12)",
    rusqlite::params![
        event.timestamp.to_rfc3339(),
        event.kind.as_str(),
        event.file_path,
        event.agent,
        event.session_id,
        event.repo_path,
        event.branch,
        event.diff,
        event.metadata,
        event.host_kind,
        event.model,
        event.is_live as i32,
    ],
)?;
```

Update the `query` function's `SELECT` and row mapper similarly so reads include the new columns.

Update any callsite that constructs an `AgentEvent` (e.g., in `watcher.rs`, `hooks/claude.rs`, `tests/`) with default values: `host_kind: None, model: None, is_live: false`.

- [ ] **Step 5: Run the full store test module**

```bash
cd /Users/costaxanthos/conductor/repos/vigil/daemon
cargo test store
```

Expected: all tests pass, including the new `schema_has_host_kind_and_model_columns`.

- [ ] **Step 6: Commit**

```bash
cd /Users/costaxanthos/conductor/repos/vigil
git add daemon/src/
git commit -m "$(cat <<'EOF'
feat(daemon): persist host_kind, model, is_live on events

Adds columns via CREATE TABLE + backfill ALTER for existing DBs. AgentEvent
struct extended with matching fields; default None/false everywhere until
hooks and watcher are wired to populate them.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: Wire host detection into Claude Code hook handler

**Why:** Hook events carry `cwd` and are the first signal of a session. Detect the host PID from the parent chain when a hook arrives.

**Files:**
- Modify: `daemon/src/hooks/claude.rs`

- [ ] **Step 1: Write the failing test**

Append to the `#[cfg(test)] mod tests` block at the bottom of `daemon/src/hooks/claude.rs`:

```rust
#[test]
fn hook_event_to_agent_event_carries_host_kind_field() {
    let event = ClaudeHookEvent {
        hook_type: Some("PostToolUse".to_string()),
        session_id: Some("sess-123".to_string()),
        tool_name: Some("Edit".to_string()),
        tool_input: Some(serde_json::json!({"file_path": "/tmp/x.rs"})),
        tool_output: None,
        cwd: Some("/tmp".to_string()),
        token_usage: None,
        model: Some("claude-opus-4-7".to_string()),
        cost_usd: None,
        message: None,
    };
    let agent_event = hook_event_to_agent_event(&event);
    // Model is known; host_kind/is_live are set by the ingestion layer, not the converter.
    assert_eq!(agent_event.model.as_deref(), Some("claude-opus-4-7"));
    // The struct has the fields (compile-time check); default values from converter are fine.
    let _ = agent_event.host_kind;
    let _ = agent_event.is_live;
}
```

- [ ] **Step 2: Run test — expect FAIL**

```bash
cd /Users/costaxanthos/conductor/repos/vigil/daemon
cargo test hooks::claude::tests::hook_event_to_agent_event_carries_host_kind_field
```

Expected: FAIL — `model` is not yet extracted by the converter.

- [ ] **Step 3: Update the converter to extract `model`**

In `daemon/src/hooks/claude.rs`, locate `hook_event_to_agent_event`. Add model propagation:

```rust
pub fn hook_event_to_agent_event(event: &ClaudeHookEvent) -> AgentEvent {
    // ... existing body that fills timestamp, kind, file_path, agent, session_id, cwd, diff, metadata ...
    AgentEvent {
        id: None,
        timestamp: /* existing */,
        kind: /* existing */,
        file_path: /* existing */,
        agent: /* existing */,
        session_id: event.session_id.clone(),
        repo_path: /* existing */,
        branch: /* existing */,
        diff: /* existing */,
        metadata: /* existing */,
        host_kind: None,   // populated by ingestion layer, not converter
        model: event.model.clone(),
        is_live: true,     // hooks fire only while session is running
    }
}
```

If the existing return uses a struct-literal pattern, insert these three new fields. If it uses `AgentEvent::new_*(...)` builder, add an `.with_model(event.model.clone()).with_is_live(true)` chain (or update the builder signature).

- [ ] **Step 4: Add host detection in `process_hook_stdin`**

Still in `daemon/src/hooks/claude.rs`, locate `process_hook_stdin` (or whatever function deserializes stdin JSON and writes to the store). After converting to `AgentEvent` and before `store.insert()`, detect host:

```rust
use crate::host::{detect_host, HostKind};
use sysinfo::System;

// Inside the handler, after constructing `event: AgentEvent`:
let host_kind: HostKind = {
    let pid = std::process::id();  // vigil hook is spawned by Claude Code; our own PID's parent chain leads to the host
    let mut sys = System::new();
    sys.refresh_processes();
    detect_host(&sys, pid)
};
event.host_kind = Some(host_kind.as_str().to_string());
```

(If `System` construction is expensive per hook call — hooks fire every few seconds — cache it in a `OnceLock<Mutex<System>>` or refresh a shared instance. For V1, per-call is fine; hooks are not that frequent.)

- [ ] **Step 5: Run tests**

```bash
cd /Users/costaxanthos/conductor/repos/vigil/daemon
cargo test hooks::claude
```

Expected: `hook_event_to_agent_event_carries_host_kind_field` passes; all preexisting tests still pass.

- [ ] **Step 6: Commit**

```bash
cd /Users/costaxanthos/conductor/repos/vigil
git add daemon/src/hooks/claude.rs
git commit -m "$(cat <<'EOF'
feat(daemon): populate model and host_kind on Claude hook ingest

Hook handler now walks parent processes to detect host (Ghostty, Conductor,
iTerm2, etc.) and propagates model from the Claude Code event.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

# Phase C — Daemon: JSONL Reader

## Task 6: JSONL line parser for Claude Code session transcripts

**Why:** The "What's happening" summary needs the agent's own words. Claude Code writes them to `~/.claude/projects/**/*.jsonl`.

**Files:**
- Create: `daemon/src/sessionlog.rs`
- Modify: `daemon/src/main.rs` (add `mod sessionlog;`)

- [ ] **Step 1: Create the parser module**

Create `daemon/src/sessionlog.rs`:

```rust
use serde::Deserialize;

/// A single JSONL line in a Claude Code session transcript. We only
/// decode the fields we care about; unknown fields are ignored.
#[derive(Debug, Clone, Deserialize)]
pub struct JsonlLine {
    #[serde(default)]
    pub r#type: Option<String>,
    #[serde(default)]
    pub message: Option<Message>,
    #[serde(default)]
    pub timestamp: Option<String>,
    #[serde(default, rename = "sessionId")]
    pub session_id: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct Message {
    #[serde(default)]
    pub role: Option<String>,
    #[serde(default)]
    pub content: Option<serde_json::Value>,
    #[serde(default)]
    pub model: Option<String>,
}

/// A condensed turn suitable for building a summary prompt.
#[derive(Debug, Clone)]
pub struct SessionTurn {
    pub role: String,               // "user" | "assistant" | "system"
    pub text: String,               // extracted plain text (concatenated if content is an array)
    pub tool_names: Vec<String>,    // names of tool_use blocks in an assistant turn
    pub timestamp: Option<String>,
}

pub fn parse_line(line: &str) -> Option<JsonlLine> {
    serde_json::from_str::<JsonlLine>(line).ok()
}

pub fn condense(line: &JsonlLine) -> Option<SessionTurn> {
    let msg = line.message.as_ref()?;
    let role = msg.role.clone().unwrap_or_else(|| "unknown".to_string());
    let (text, tool_names) = extract_text_and_tools(msg.content.as_ref()?);
    if text.is_empty() && tool_names.is_empty() {
        return None;
    }
    Some(SessionTurn { role, text, tool_names, timestamp: line.timestamp.clone() })
}

fn extract_text_and_tools(content: &serde_json::Value) -> (String, Vec<String>) {
    let mut texts: Vec<String> = Vec::new();
    let mut tools: Vec<String> = Vec::new();
    match content {
        serde_json::Value::String(s) => texts.push(s.clone()),
        serde_json::Value::Array(items) => {
            for item in items {
                match item.get("type").and_then(|v| v.as_str()) {
                    Some("text") => {
                        if let Some(t) = item.get("text").and_then(|v| v.as_str()) {
                            texts.push(t.to_string());
                        }
                    }
                    Some("tool_use") => {
                        if let Some(n) = item.get("name").and_then(|v| v.as_str()) {
                            tools.push(n.to_string());
                        }
                    }
                    _ => {}
                }
            }
        }
        _ => {}
    }
    (texts.join("\n"), tools)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parse_line_survives_unknown_fields() {
        let line = r#"{"type":"user","message":{"role":"user","content":"hi"},"timestamp":"2026-04-16T10:00:00Z","extra":"ignored"}"#;
        let parsed = parse_line(line).expect("should parse");
        assert_eq!(parsed.r#type.as_deref(), Some("user"));
        let turn = condense(&parsed).expect("should condense");
        assert_eq!(turn.role, "user");
        assert_eq!(turn.text, "hi");
        assert!(turn.tool_names.is_empty());
    }

    #[test]
    fn condense_extracts_text_and_tool_names_from_array_content() {
        let line = r#"{"message":{"role":"assistant","content":[
            {"type":"text","text":"I'm going to edit the file."},
            {"type":"tool_use","name":"Edit","input":{}}
        ]}}"#;
        let parsed = parse_line(line).expect("should parse");
        let turn = condense(&parsed).expect("should condense");
        assert_eq!(turn.role, "assistant");
        assert_eq!(turn.text, "I'm going to edit the file.");
        assert_eq!(turn.tool_names, vec!["Edit".to_string()]);
    }

    #[test]
    fn condense_returns_none_for_empty_content() {
        let line = r#"{"message":{"role":"assistant","content":[]}}"#;
        let parsed = parse_line(line).expect("should parse");
        assert!(condense(&parsed).is_none());
    }

    #[test]
    fn parse_line_rejects_invalid_json() {
        assert!(parse_line("not json").is_none());
        assert!(parse_line("").is_none());
    }
}
```

- [ ] **Step 2: Register module**

Add `mod sessionlog;` to `daemon/src/main.rs` alongside the other `mod` declarations.

- [ ] **Step 3: Run tests**

```bash
cd /Users/costaxanthos/conductor/repos/vigil/daemon
cargo test sessionlog
```

Expected: all four tests pass.

- [ ] **Step 4: Commit**

```bash
cd /Users/costaxanthos/conductor/repos/vigil
git add daemon/src/sessionlog.rs daemon/src/main.rs
git commit -m "$(cat <<'EOF'
feat(daemon): parse Claude Code JSONL session transcripts

New sessionlog module decodes JSONL lines into role/text/tool_names turns,
tolerant of unknown fields and mixed content shapes.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 7: JSONL file tailer using `notify`

**Why:** Claude Code appends to JSONL files live. We need to tail them like `tail -f` and dispatch new turns.

**Files:**
- Modify: `daemon/src/sessionlog.rs`

- [ ] **Step 1: Add the tailer and its test scaffolding**

Append to `daemon/src/sessionlog.rs`:

```rust
use notify::{RecommendedWatcher, RecursiveMode, Watcher};
use std::collections::HashMap;
use std::fs::File;
use std::io::{BufRead, BufReader, Seek, SeekFrom};
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};
use tokio::sync::mpsc::{UnboundedReceiver, UnboundedSender};

pub struct TailerEvent {
    pub path: PathBuf,
    pub turn: SessionTurn,
}

/// Watches `root` recursively; emits a `TailerEvent` for each new JSONL line
/// appended to any `*.jsonl` file under that root.
pub fn start_tailer(root: &Path) -> std::io::Result<(RecommendedWatcher, UnboundedReceiver<TailerEvent>)> {
    let (tx, rx) = tokio::sync::mpsc::unbounded_channel::<TailerEvent>();
    let offsets: Arc<Mutex<HashMap<PathBuf, u64>>> = Arc::new(Mutex::new(HashMap::new()));
    let tx2 = tx.clone();
    let offsets2 = offsets.clone();

    let mut watcher = notify::recommended_watcher(move |res: Result<notify::Event, notify::Error>| {
        let Ok(event) = res else { return };
        for path in event.paths {
            if path.extension().and_then(|e| e.to_str()) != Some("jsonl") {
                continue;
            }
            if let Err(e) = emit_new_lines(&path, &offsets2, &tx2) {
                eprintln!("vigil: sessionlog read error for {}: {}", path.display(), e);
            }
        }
    }).map_err(|e| std::io::Error::new(std::io::ErrorKind::Other, e.to_string()))?;

    watcher.watch(root, RecursiveMode::Recursive)
        .map_err(|e| std::io::Error::new(std::io::ErrorKind::Other, e.to_string()))?;

    Ok((watcher, rx))
}

fn emit_new_lines(
    path: &Path,
    offsets: &Arc<Mutex<HashMap<PathBuf, u64>>>,
    tx: &UnboundedSender<TailerEvent>,
) -> std::io::Result<()> {
    let mut file = File::open(path)?;
    let prev_offset: u64 = offsets.lock().unwrap().get(path).copied().unwrap_or(0);
    let file_len = file.metadata()?.len();
    if file_len < prev_offset {
        // File truncated or rotated; reset.
        offsets.lock().unwrap().insert(path.to_path_buf(), 0);
        return Ok(());
    }
    file.seek(SeekFrom::Start(prev_offset))?;
    let mut reader = BufReader::new(file);
    let mut read_offset = prev_offset;
    let mut line = String::new();
    loop {
        line.clear();
        let bytes = reader.read_line(&mut line)?;
        if bytes == 0 { break; }
        read_offset += bytes as u64;
        let trimmed = line.trim_end();
        if trimmed.is_empty() { continue; }
        let Some(parsed) = parse_line(trimmed) else { continue };
        let Some(turn) = condense(&parsed) else { continue };
        let _ = tx.send(TailerEvent { path: path.to_path_buf(), turn });
    }
    offsets.lock().unwrap().insert(path.to_path_buf(), read_offset);
    Ok(())
}
```

Add to the existing `#[cfg(test)] mod tests` block:

```rust
use std::io::Write;
use tempfile::TempDir;

#[tokio::test]
async fn tailer_emits_appended_lines() {
    let dir = TempDir::new().unwrap();
    let (_watcher, mut rx) = start_tailer(dir.path()).unwrap();

    // Give the watcher a moment to initialize.
    tokio::time::sleep(std::time::Duration::from_millis(100)).await;

    let path = dir.path().join("test.jsonl");
    let mut f = std::fs::OpenOptions::new()
        .create(true).append(true).open(&path).unwrap();
    writeln!(f, r#"{{"message":{{"role":"user","content":"first"}}}}"#).unwrap();
    writeln!(f, r#"{{"message":{{"role":"assistant","content":"second"}}}}"#).unwrap();
    drop(f);

    let mut seen = Vec::new();
    let deadline = std::time::Instant::now() + std::time::Duration::from_secs(3);
    while seen.len() < 2 && std::time::Instant::now() < deadline {
        if let Ok(Some(ev)) = tokio::time::timeout(std::time::Duration::from_millis(250), rx.recv()).await {
            seen.push(ev.turn.text);
        }
    }
    assert_eq!(seen, vec!["first".to_string(), "second".to_string()]);
}
```

- [ ] **Step 2: Run the test**

```bash
cd /Users/costaxanthos/conductor/repos/vigil/daemon
cargo test sessionlog::tests::tailer_emits_appended_lines -- --nocapture
```

Expected: PASS (may take up to ~3 seconds due to filesystem notify latency).

If flaky on macOS (notify sometimes coalesces events), increase the sleep in the test or the deadline. Do not ignore the test — tune it.

- [ ] **Step 3: Commit**

```bash
cd /Users/costaxanthos/conductor/repos/vigil
git add daemon/src/sessionlog.rs
git commit -m "$(cat <<'EOF'
feat(daemon): tail JSONL files recursively under a root

start_tailer watches a directory and emits TailerEvent for each new JSONL
line appended. Handles rotation/truncation via offset reset.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 8: Store session turns in SQLite for summary building

**Why:** Summaries read the last N turns. A dedicated `session_turns` table keeps the query cheap.

**Files:**
- Modify: `daemon/src/store.rs`

- [ ] **Step 1: Write the failing test**

Append to `daemon/src/store.rs`'s test module:

```rust
#[test]
fn session_turns_round_trip() {
    let store = Store::open_in_memory().unwrap();
    store.insert_session_turn(&SessionTurnRecord {
        session_id: "sess-1".to_string(),
        timestamp: chrono::Utc::now(),
        role: "assistant".to_string(),
        text: "I'm editing foo.rs".to_string(),
        tool_names: vec!["Edit".to_string()],
    }).unwrap();
    store.insert_session_turn(&SessionTurnRecord {
        session_id: "sess-1".to_string(),
        timestamp: chrono::Utc::now(),
        role: "user".to_string(),
        text: "Continue".to_string(),
        tool_names: vec![],
    }).unwrap();

    let turns = store.recent_turns("sess-1", 10).unwrap();
    assert_eq!(turns.len(), 2);
    assert_eq!(turns[0].text, "I'm editing foo.rs");
}
```

- [ ] **Step 2: Run — expect FAIL (compile error)**

```bash
cd /Users/costaxanthos/conductor/repos/vigil/daemon
cargo test store::tests::session_turns_round_trip 2>&1 | tail -20
```

Expected: compile error — `SessionTurnRecord` / `insert_session_turn` / `recent_turns` undefined.

- [ ] **Step 3: Add schema and API**

In `daemon/src/store.rs`, add:

```rust
use chrono::{DateTime, Utc};

#[derive(Debug, Clone)]
pub struct SessionTurnRecord {
    pub session_id: String,
    pub timestamp: DateTime<Utc>,
    pub role: String,
    pub text: String,
    pub tool_names: Vec<String>,
}

impl Store {
    pub fn insert_session_turn(&self, turn: &SessionTurnRecord) -> rusqlite::Result<i64> {
        let tool_names = serde_json::to_string(&turn.tool_names).unwrap_or_else(|_| "[]".to_string());
        self.conn.execute(
            "INSERT INTO session_turns (session_id, timestamp, role, text, tool_names) VALUES (?1, ?2, ?3, ?4, ?5)",
            rusqlite::params![
                turn.session_id,
                turn.timestamp.to_rfc3339(),
                turn.role,
                turn.text,
                tool_names,
            ],
        )?;
        Ok(self.conn.last_insert_rowid())
    }

    pub fn recent_turns(&self, session_id: &str, limit: i64) -> rusqlite::Result<Vec<SessionTurnRecord>> {
        let mut stmt = self.conn.prepare(
            "SELECT session_id, timestamp, role, text, tool_names \
             FROM session_turns WHERE session_id = ?1 \
             ORDER BY id DESC LIMIT ?2"
        )?;
        let rows = stmt.query_map(rusqlite::params![session_id, limit], |row| {
            let ts_str: String = row.get(1)?;
            let tn_str: String = row.get(4)?;
            let tool_names: Vec<String> = serde_json::from_str(&tn_str).unwrap_or_default();
            Ok(SessionTurnRecord {
                session_id: row.get(0)?,
                timestamp: DateTime::parse_from_rfc3339(&ts_str)
                    .map(|dt| dt.with_timezone(&Utc))
                    .unwrap_or_else(|_| Utc::now()),
                role: row.get(2)?,
                text: row.get(3)?,
                tool_names,
            })
        })?;
        let mut out: Vec<SessionTurnRecord> = rows.filter_map(Result::ok).collect();
        out.reverse(); // ascending by insertion
        Ok(out)
    }
}
```

In `init_schema`, add:

```rust
conn.execute(
    "CREATE TABLE IF NOT EXISTS session_turns (\
        id INTEGER PRIMARY KEY, \
        session_id TEXT NOT NULL, \
        timestamp TEXT NOT NULL, \
        role TEXT NOT NULL, \
        text TEXT NOT NULL, \
        tool_names TEXT NOT NULL DEFAULT '[]'\
    )",
    [],
)?;
conn.execute(
    "CREATE INDEX IF NOT EXISTS idx_session_turns_session_id ON session_turns(session_id)",
    [],
)?;
```

- [ ] **Step 4: Run tests**

```bash
cd /Users/costaxanthos/conductor/repos/vigil/daemon
cargo test store
```

Expected: all pass.

- [ ] **Step 5: Commit**

```bash
cd /Users/costaxanthos/conductor/repos/vigil
git add daemon/src/store.rs
git commit -m "$(cat <<'EOF'
feat(daemon): persist session turns to SQLite

New session_turns table + insert_session_turn / recent_turns API for
summary building. Indexed on session_id.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

# Phase D — Daemon: Summary Engine

## Task 9: CLI probe utility (`claude` / `codex` availability)

**Why:** Onboarding needs to know which CLI is available; the summary engine needs to pick one at startup.

**Files:**
- Create: `daemon/src/summarizer.rs`
- Modify: `daemon/src/main.rs` (add `mod summarizer;`)

- [ ] **Step 1: Create the module with CLI probe**

Create `daemon/src/summarizer.rs`:

```rust
use serde::{Deserialize, Serialize};
use std::process::Command;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum SummaryBackend {
    Claude,
    Codex,
    None,
}

pub fn detect_backend() -> SummaryBackend {
    if cli_works("claude") { return SummaryBackend::Claude; }
    if cli_works("codex") { return SummaryBackend::Codex; }
    SummaryBackend::None
}

fn cli_works(bin: &str) -> bool {
    let out = Command::new(bin).arg("--version").output();
    match out {
        Ok(o) => o.status.success(),
        Err(_) => false,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn cli_works_returns_false_for_bogus_bin() {
        assert!(!cli_works("definitely-not-a-real-binary-zyxw"));
    }

    // `detect_backend` makes OS calls — only assert it returns *some* variant.
    #[test]
    fn detect_backend_returns_a_variant() {
        let b = detect_backend();
        assert!(matches!(b, SummaryBackend::Claude | SummaryBackend::Codex | SummaryBackend::None));
    }
}
```

- [ ] **Step 2: Register module**

Add `mod summarizer;` to `daemon/src/main.rs`.

- [ ] **Step 3: Run tests**

```bash
cd /Users/costaxanthos/conductor/repos/vigil/daemon
cargo test summarizer
```

Expected: both tests pass.

- [ ] **Step 4: Commit**

```bash
cd /Users/costaxanthos/conductor/repos/vigil
git add daemon/src/summarizer.rs daemon/src/main.rs
git commit -m "$(cat <<'EOF'
feat(daemon): detect available summary backend CLI

Checks for `claude --version` then `codex --version` on PATH; returns
the first available backend or None.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 10: Summary prompt builder

**Why:** The prompt determines quality. It takes recent turns + a diff stat line and produces a 2-4 sentence non-technical summary.

**Files:**
- Modify: `daemon/src/summarizer.rs`

- [ ] **Step 1: Append the prompt builder and test**

Add to `daemon/src/summarizer.rs`:

```rust
use crate::store::SessionTurnRecord;

pub struct SummaryInput<'a> {
    pub turns: &'a [SessionTurnRecord],
    pub diff_stats: Option<(u32, u32)>, // (added, removed)
    pub recent_files: Vec<String>,
}

const SYSTEM_PROMPT: &str = "You describe what an AI coding agent is doing in 2 to 4 short sentences, aimed at a curious non-programmer. Avoid jargon like \"refactor\", \"middleware\", \"migration\", \"schema\", \"type\", \"import\", \"refactoring\". Translate to everyday terms: \"Making login more secure\" beats \"Refactoring auth middleware\". Do not use markdown, lists, or code. Just prose.";

pub fn build_prompt(input: &SummaryInput) -> String {
    let mut body = String::new();
    body.push_str("An AI coding agent is working. Here is what it has done recently:\n\n");

    for turn in input.turns {
        let role = match turn.role.as_str() {
            "user" => "The human asked",
            "assistant" => "The AI said",
            _ => "System",
        };
        let text = truncate(&turn.text, 400);
        if !text.is_empty() {
            body.push_str(&format!("- {}: {}\n", role, text));
        }
        if !turn.tool_names.is_empty() {
            body.push_str(&format!("  (used tools: {})\n", turn.tool_names.join(", ")));
        }
    }

    if !input.recent_files.is_empty() {
        body.push_str("\nFiles being changed:\n");
        for f in input.recent_files.iter().take(8) {
            body.push_str(&format!("- {}\n", f));
        }
    }
    if let Some((add, rem)) = input.diff_stats {
        body.push_str(&format!("\nCode changes so far: {} lines added, {} removed.\n", add, rem));
    }

    body.push_str("\nIn 2 to 4 plain-English sentences aimed at a non-programmer, describe what the AI is doing right now. Start directly with the description — no preamble.");
    body
}

fn truncate(s: &str, max_chars: usize) -> String {
    if s.chars().count() <= max_chars { return s.to_string(); }
    let mut out: String = s.chars().take(max_chars).collect();
    out.push_str("…");
    out
}

pub fn system_prompt() -> &'static str { SYSTEM_PROMPT }
```

Add test to the existing test module:

```rust
#[test]
fn build_prompt_includes_turn_text_and_file_list() {
    use chrono::Utc;
    let turns = vec![
        SessionTurnRecord {
            session_id: "s1".to_string(),
            timestamp: Utc::now(),
            role: "user".to_string(),
            text: "fix the login page".to_string(),
            tool_names: vec![],
        },
        SessionTurnRecord {
            session_id: "s1".to_string(),
            timestamp: Utc::now(),
            role: "assistant".to_string(),
            text: "I'll update the auth code.".to_string(),
            tool_names: vec!["Edit".to_string()],
        },
    ];
    let input = SummaryInput {
        turns: &turns,
        diff_stats: Some((12, 3)),
        recent_files: vec!["src/auth.ts".to_string()],
    };
    let p = build_prompt(&input);
    assert!(p.contains("fix the login page"));
    assert!(p.contains("update the auth code"));
    assert!(p.contains("src/auth.ts"));
    assert!(p.contains("12 lines added, 3 removed"));
    assert!(p.contains("non-programmer"));
}

#[test]
fn system_prompt_forbids_jargon_explicitly() {
    let sp = system_prompt();
    assert!(sp.contains("non-programmer"));
    assert!(sp.contains("middleware"));  // in the list of jargon to avoid
}
```

- [ ] **Step 2: Run tests**

```bash
cd /Users/costaxanthos/conductor/repos/vigil/daemon
cargo test summarizer
```

Expected: pass.

- [ ] **Step 3: Commit**

```bash
cd /Users/costaxanthos/conductor/repos/vigil
git add daemon/src/summarizer.rs
git commit -m "$(cat <<'EOF'
feat(daemon): add summary prompt builder

build_prompt composes a non-technical prompt from recent turns + diff
stats + file list. System prompt explicitly forbids common developer
jargon and asks for 2-4 plain-English sentences.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 11: Subprocess runner for `claude -p`

**Why:** Actually call the CLI, capture stdout, handle timeout.

**Files:**
- Modify: `daemon/src/summarizer.rs`
- Modify: `daemon/Cargo.toml` (verify `tokio` has `process` feature)

- [ ] **Step 1: Ensure tokio process feature is on**

Check `daemon/Cargo.toml`. The `tokio` dep should include `"process"` and `"time"`:

```toml
tokio = { version = "1.51", features = ["rt-multi-thread", "macros", "process", "time", "io-util", "sync", "fs"] }
```

If features are missing, add them. Run `cargo build` to confirm.

- [ ] **Step 2: Append the async runner and test**

Add to `daemon/src/summarizer.rs`:

```rust
use std::time::Duration;
use tokio::process::Command as TokioCommand;
use tokio::time::timeout;

pub async fn run_claude(prompt: &str, system: &str) -> Result<String, SummaryError> {
    let child = TokioCommand::new("claude")
        .arg("-p")
        .arg(prompt)
        .arg("--system-prompt").arg(system)
        .arg("--model").arg("claude-haiku-4-5-20251001")
        .arg("--output-format").arg("text")
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::piped())
        .kill_on_drop(true)
        .spawn()
        .map_err(|e| SummaryError::Spawn(e.to_string()))?;

    let output = timeout(Duration::from_secs(20), child.wait_with_output())
        .await
        .map_err(|_| SummaryError::Timeout)?
        .map_err(|e| SummaryError::Wait(e.to_string()))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
        return Err(SummaryError::NonZeroExit(stderr));
    }
    Ok(String::from_utf8_lossy(&output.stdout).trim().to_string())
}

#[derive(Debug)]
pub enum SummaryError {
    Spawn(String),
    Wait(String),
    NonZeroExit(String),
    Timeout,
}

impl std::fmt::Display for SummaryError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            SummaryError::Spawn(s) => write!(f, "spawn failed: {}", s),
            SummaryError::Wait(s) => write!(f, "wait failed: {}", s),
            SummaryError::NonZeroExit(s) => write!(f, "non-zero exit: {}", s),
            SummaryError::Timeout => write!(f, "timed out"),
        }
    }
}

impl std::error::Error for SummaryError {}
```

Add test:

```rust
#[tokio::test]
async fn run_claude_errors_cleanly_when_binary_missing() {
    // Force-run a binary that almost certainly does not exist.
    let err = run_claude_with_bin("definitely-not-a-real-binary-zyxw", "prompt", "system")
        .await
        .expect_err("should error");
    assert!(matches!(err, SummaryError::Spawn(_)));
}
```

And expose a test-only variant with configurable binary by refactoring `run_claude`:

```rust
pub async fn run_claude(prompt: &str, system: &str) -> Result<String, SummaryError> {
    run_claude_with_bin("claude", prompt, system).await
}

async fn run_claude_with_bin(bin: &str, prompt: &str, system: &str) -> Result<String, SummaryError> {
    let child = TokioCommand::new(bin)
        .arg("-p")
        .arg(prompt)
        .arg("--system-prompt").arg(system)
        .arg("--model").arg("claude-haiku-4-5-20251001")
        .arg("--output-format").arg("text")
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::piped())
        .kill_on_drop(true)
        .spawn()
        .map_err(|e| SummaryError::Spawn(e.to_string()))?;

    let output = timeout(Duration::from_secs(20), child.wait_with_output())
        .await
        .map_err(|_| SummaryError::Timeout)?
        .map_err(|e| SummaryError::Wait(e.to_string()))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
        return Err(SummaryError::NonZeroExit(stderr));
    }
    Ok(String::from_utf8_lossy(&output.stdout).trim().to_string())
}
```

- [ ] **Step 3: Run test**

```bash
cd /Users/costaxanthos/conductor/repos/vigil/daemon
cargo test summarizer::tests::run_claude_errors_cleanly_when_binary_missing -- --nocapture
```

Expected: pass (the error variant is `Spawn`).

- [ ] **Step 4: Commit**

```bash
cd /Users/costaxanthos/conductor/repos/vigil
git add daemon/src/summarizer.rs daemon/Cargo.toml
git commit -m "$(cat <<'EOF'
feat(daemon): subprocess runner for claude -p with timeout

run_claude spawns the Claude Code CLI with the summary prompt, captures
stdout, and errors cleanly on spawn failure, non-zero exit, or 20s timeout.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 12: Summary cache table + generator orchestration

**Why:** Cache the latest summary per session so the app reads it without re-calling the CLI. Background job generates them.

**Files:**
- Modify: `daemon/src/store.rs`
- Modify: `daemon/src/summarizer.rs`

- [ ] **Step 1: Add `session_summaries` schema and API**

In `daemon/src/store.rs`, in `init_schema`:

```rust
conn.execute(
    "CREATE TABLE IF NOT EXISTS session_summaries (\
        session_id TEXT PRIMARY KEY, \
        text TEXT NOT NULL, \
        generated_at TEXT NOT NULL, \
        backend TEXT NOT NULL\
    )",
    [],
)?;
```

Add methods on `Store`:

```rust
pub fn upsert_summary(&self, session_id: &str, text: &str, backend: &str) -> rusqlite::Result<()> {
    let now = Utc::now().to_rfc3339();
    self.conn.execute(
        "INSERT INTO session_summaries (session_id, text, generated_at, backend) VALUES (?1, ?2, ?3, ?4) \
         ON CONFLICT(session_id) DO UPDATE SET text = excluded.text, generated_at = excluded.generated_at, backend = excluded.backend",
        rusqlite::params![session_id, text, now, backend],
    )?;
    Ok(())
}

pub fn get_summary(&self, session_id: &str) -> rusqlite::Result<Option<(String, String, String)>> {
    let row: Result<(String, String, String), _> = self.conn.query_row(
        "SELECT text, generated_at, backend FROM session_summaries WHERE session_id = ?1",
        rusqlite::params![session_id],
        |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
    );
    match row {
        Ok(tup) => Ok(Some(tup)),
        Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
        Err(e) => Err(e),
    }
}
```

Test:

```rust
#[test]
fn summary_upsert_and_get() {
    let store = Store::open_in_memory().unwrap();
    assert!(store.get_summary("s1").unwrap().is_none());
    store.upsert_summary("s1", "first draft", "claude").unwrap();
    let got = store.get_summary("s1").unwrap().unwrap();
    assert_eq!(got.0, "first draft");
    store.upsert_summary("s1", "revised", "claude").unwrap();
    let got = store.get_summary("s1").unwrap().unwrap();
    assert_eq!(got.0, "revised");
}
```

- [ ] **Step 2: Orchestration function in summarizer**

Add to `daemon/src/summarizer.rs`:

```rust
use crate::store::Store;

pub async fn generate_and_cache(
    store: &Store,
    session_id: &str,
    recent_files: Vec<String>,
    diff_stats: Option<(u32, u32)>,
) -> Result<String, SummaryError> {
    let turns = store.recent_turns(session_id, 16)
        .map_err(|e| SummaryError::Wait(e.to_string()))?;
    if turns.is_empty() {
        return Err(SummaryError::NonZeroExit("no turns for session".to_string()));
    }
    let input = SummaryInput {
        turns: &turns,
        diff_stats,
        recent_files,
    };
    let prompt = build_prompt(&input);
    let system = system_prompt();
    let text = match detect_backend() {
        SummaryBackend::Claude => run_claude(&prompt, system).await?,
        SummaryBackend::Codex => {
            // V1 stubs Codex — fall back to returning an error so the caller shows a placeholder.
            return Err(SummaryError::NonZeroExit("codex backend not yet wired".to_string()));
        }
        SummaryBackend::None => {
            return Err(SummaryError::NonZeroExit("no CLI available".to_string()));
        }
    };
    store.upsert_summary(session_id, &text, "claude")
        .map_err(|e| SummaryError::Wait(e.to_string()))?;
    Ok(text)
}
```

- [ ] **Step 3: Run tests**

```bash
cd /Users/costaxanthos/conductor/repos/vigil/daemon
cargo test
```

Expected: all pass. (The `generate_and_cache` is not unit-tested here — it would require either a real `claude` CLI or a subprocess mock. Integration test comes later.)

- [ ] **Step 4: Commit**

```bash
cd /Users/costaxanthos/conductor/repos/vigil
git add daemon/src/store.rs daemon/src/summarizer.rs
git commit -m "$(cat <<'EOF'
feat(daemon): summary cache + orchestration

New session_summaries table with upsert_summary/get_summary. generate_and_cache
builds the prompt from recent turns, calls the CLI, and caches the result
for fast reads.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 13: Wire JSONL tailer + summary scheduler into the `watch` subcommand

**Why:** All the pieces exist; now wire them into the long-running daemon.

**Files:**
- Modify: `daemon/src/cli.rs` (or wherever the `watch` subcommand's loop lives)

- [ ] **Step 1: Add the wiring**

In `daemon/src/cli.rs`, locate the `watch` handler (there is a long-running async function that starts `watcher::start(...)` and a process scanner on a 10-second interval per the codebase map). Add:

```rust
use crate::sessionlog::{start_tailer, TailerEvent};
use crate::store::{SessionTurnRecord, Store};
use crate::summarizer;
use std::collections::HashMap;
use std::path::PathBuf;
use std::time::{Duration, Instant};

// Inside the `watch` handler, after the existing watcher starts:

let claude_projects_root: PathBuf = home::home_dir()
    .map(|h| h.join(".claude").join("projects"))
    .expect("home dir");
std::fs::create_dir_all(&claude_projects_root).ok();

let (_sess_watcher, mut sess_rx) = start_tailer(&claude_projects_root)
    .map_err(|e| format!("failed to start session tailer: {}", e))?;

let mut last_summary: HashMap<String, Instant> = HashMap::new();
let debounce = Duration::from_secs(30);

let store_for_tailer = store.clone(); // assuming store is Arc<Store>; if not, wrap it
let store_for_summary = store.clone();

tokio::spawn(async move {
    while let Some(ev) = sess_rx.recv().await {
        let Some(session_id) = extract_session_id_from_path(&ev.path) else { continue };
        let record = SessionTurnRecord {
            session_id: session_id.clone(),
            timestamp: chrono::Utc::now(),
            role: ev.turn.role,
            text: ev.turn.text,
            tool_names: ev.turn.tool_names,
        };
        if let Err(e) = store_for_tailer.insert_session_turn(&record) {
            eprintln!("vigil: insert turn failed: {}", e);
            continue;
        }
        let last = last_summary.get(&session_id).copied();
        let due = match last {
            Some(t) => t.elapsed() >= debounce,
            None => true,
        };
        if !due { continue; }
        last_summary.insert(session_id.clone(), Instant::now());

        let store_inner = store_for_summary.clone();
        tokio::spawn(async move {
            if let Err(e) = summarizer::generate_and_cache(
                &store_inner,
                &session_id,
                Vec::new(),
                None,
            ).await {
                eprintln!("vigil: summary failed for {}: {}", session_id, e);
            }
        });
    }
});

// helper:
fn extract_session_id_from_path(path: &std::path::Path) -> Option<String> {
    path.file_stem()?.to_str().map(|s| s.to_string())
}
```

Adjust based on the actual shape of the `watch` loop. If `store` is not currently shared across tasks, wrap it in `Arc<Store>` (add `Clone` derives as needed — `Store` can be made `Clone`-friendly by holding `Arc<Mutex<Connection>>` if it isn't already).

- [ ] **Step 2: Build and smoke-test**

```bash
cd /Users/costaxanthos/conductor/repos/vigil/daemon
cargo build
```

Expected: builds clean. Any borrow/lifetime errors from threading `store` — address by wrapping in `Arc`. If you have to change `Store`'s internals, keep existing tests green.

- [ ] **Step 3: Manual integration sanity check**

Run the daemon pointed at a test directory, have an actual Claude Code session write a line, and check the SQLite:

```bash
cd /Users/costaxanthos/conductor/repos/vigil/daemon
cargo run -- watch /tmp &
DAEMON_PID=$!
# Simulate a JSONL append:
mkdir -p ~/.claude/projects/test-vigil
echo '{"message":{"role":"assistant","content":"I am updating the login flow."},"timestamp":"2026-04-16T10:00:00Z","sessionId":"test-sess-1"}' >> ~/.claude/projects/test-vigil/test-sess-1.jsonl
sleep 2
sqlite3 ~/.vigil/vigil.db "SELECT session_id, role, substr(text, 1, 60) FROM session_turns ORDER BY id DESC LIMIT 1;"
kill $DAEMON_PID
```

Expected: the row with `test-sess-1 | assistant | I am updating the login flow.` is present.

- [ ] **Step 4: Commit**

```bash
cd /Users/costaxanthos/conductor/repos/vigil
git add daemon/src/cli.rs
git commit -m "$(cat <<'EOF'
feat(daemon): wire JSONL tailer + summary debouncer into watch

Watch subcommand now tails ~/.claude/projects/**/*.jsonl, persists turns
to session_turns, and schedules a debounced summary regeneration (30s)
per session via the summarizer.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

# Phase E — Tauri Bridge

## Task 14: Tauri command `get_hosts` and `get_live_sessions`

**Why:** Frontend needs host-grouped live sessions to populate the left rail.

**Files:**
- Modify: `app/src-tauri/src/commands.rs`
- Modify: `app/src-tauri/src/store.rs`
- Modify: `app/src-tauri/src/main.rs`

- [ ] **Step 1: Define response types in `app/src-tauri/src/commands.rs`**

Add near the top:

```rust
use serde::{Deserialize, Serialize};

#[derive(Serialize, Deserialize, Clone)]
pub struct HostInfo {
    pub kind: String,          // matches daemon HostKind::as_str()
    pub active_sessions: u32,
}

#[derive(Serialize, Deserialize, Clone)]
pub struct LiveSession {
    pub session_id: String,
    pub host_kind: String,
    pub agent: String,
    pub repo_path: Option<String>,
    pub started_at: String,
    pub ended_at: String,
    pub model: Option<String>,
    pub is_live: bool,
    pub description: String,
    pub files_added: u32,
    pub files_removed: u32,
    pub cost_usd: f64,
    pub confidence: u32,
}
```

- [ ] **Step 2: Implement store queries in `app/src-tauri/src/store.rs`**

Add two functions that query the SQLite (read-only connection):

```rust
use rusqlite::Connection;
use std::collections::HashMap;

pub fn list_hosts(conn: &Connection, since_minutes: i64) -> rusqlite::Result<Vec<(String, u32)>> {
    let since_rfc3339 = chrono::Utc::now()
        .checked_sub_signed(chrono::Duration::minutes(since_minutes))
        .unwrap()
        .to_rfc3339();
    let mut stmt = conn.prepare(
        "SELECT COALESCE(host_kind, 'unknown') as hk, COUNT(DISTINCT COALESCE(session_id, '')) as n \
         FROM events WHERE timestamp >= ?1 AND COALESCE(session_id, '') != '' \
         GROUP BY hk ORDER BY n DESC"
    )?;
    let rows = stmt.query_map(rusqlite::params![since_rfc3339], |row| {
        Ok((row.get::<_, String>(0)?, row.get::<_, i64>(1)? as u32))
    })?;
    Ok(rows.filter_map(Result::ok).collect())
}

pub fn list_live_sessions(conn: &Connection, since_minutes: i64) -> rusqlite::Result<Vec<HashMap<String, serde_json::Value>>> {
    let since_rfc3339 = chrono::Utc::now()
        .checked_sub_signed(chrono::Duration::minutes(since_minutes))
        .unwrap()
        .to_rfc3339();
    // Group events by session_id; aggregate the display fields. Join with session_summaries for description.
    let mut stmt = conn.prepare(
        "SELECT \
            e.session_id, \
            MAX(COALESCE(e.host_kind, 'unknown')) AS host_kind, \
            MAX(e.agent) AS agent, \
            MAX(e.repo_path) AS repo_path, \
            MIN(e.timestamp) AS started, \
            MAX(e.timestamp) AS ended, \
            MAX(e.model) AS model, \
            MAX(e.is_live) AS is_live, \
            COALESCE(MAX(ss.text), '') AS summary \
         FROM events e \
         LEFT JOIN session_summaries ss ON ss.session_id = e.session_id \
         WHERE e.timestamp >= ?1 AND e.session_id IS NOT NULL \
         GROUP BY e.session_id \
         ORDER BY ended DESC"
    )?;
    let rows = stmt.query_map(rusqlite::params![since_rfc3339], |row| {
        let mut m = HashMap::new();
        m.insert("session_id".into(), row.get::<_, String>(0)?.into());
        m.insert("host_kind".into(), row.get::<_, String>(1)?.into());
        m.insert("agent".into(), row.get::<_, String>(2)?.into());
        m.insert("repo_path".into(), row.get::<_, Option<String>>(3)?.into());
        m.insert("started_at".into(), row.get::<_, String>(4)?.into());
        m.insert("ended_at".into(), row.get::<_, String>(5)?.into());
        m.insert("model".into(), row.get::<_, Option<String>>(6)?.into());
        let is_live: i64 = row.get(7).unwrap_or(0);
        m.insert("is_live".into(), (is_live != 0).into());
        m.insert("description".into(), row.get::<_, String>(8)?.into());
        Ok(m)
    })?;
    Ok(rows.filter_map(Result::ok).collect())
}
```

(If the existing `app/src-tauri/src/store.rs` uses a different pattern — e.g., typed `Session` struct — follow it. The query shapes are the important part.)

- [ ] **Step 3: Implement the Tauri commands**

In `app/src-tauri/src/commands.rs`:

```rust
#[tauri::command]
pub fn get_hosts() -> Result<Vec<HostInfo>, String> {
    let conn = crate::store::open_readonly().map_err(|e| e.to_string())?;
    let rows = crate::store::list_hosts(&conn, 10).map_err(|e| e.to_string())?;
    Ok(rows.into_iter().map(|(k, n)| HostInfo { kind: k, active_sessions: n }).collect())
}

#[tauri::command]
pub fn get_live_sessions() -> Result<Vec<serde_json::Value>, String> {
    let conn = crate::store::open_readonly().map_err(|e| e.to_string())?;
    let rows = crate::store::list_live_sessions(&conn, 60).map_err(|e| e.to_string())?;
    Ok(rows.into_iter().map(|m| serde_json::to_value(m).unwrap()).collect())
}
```

(Reuse the existing `open_readonly` helper — name may differ. Confirm by reading the top of `store.rs`.)

- [ ] **Step 4: Register the commands in `main.rs`**

In `app/src-tauri/src/main.rs`, locate the `.invoke_handler(tauri::generate_handler![...])` call and append:

```rust
.invoke_handler(tauri::generate_handler![
    // ... existing commands ...
    commands::get_hosts,
    commands::get_live_sessions,
])
```

- [ ] **Step 5: Build and confirm**

```bash
cd /Users/costaxanthos/conductor/repos/vigil/app
npm run tauri:build -- --debug 2>&1 | tail -20
```

Expected: succeeds (or at worst succeeds with warnings).

- [ ] **Step 6: Commit**

```bash
cd /Users/costaxanthos/conductor/repos/vigil
git add app/src-tauri/src/
git commit -m "$(cat <<'EOF'
feat(tauri): get_hosts and get_live_sessions commands

Read-only SQLite queries that return host counts and live session rows
for the new dashboard layout.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 15: Tauri commands `get_summary`, `refresh_summary`, `detect_cli`, `save_api_key`

**Why:** Frontend needs to read summaries, trigger re-summarization on demand, detect CLI availability for onboarding, and store an API key fallback.

**Files:**
- Modify: `app/src-tauri/src/commands.rs`
- Modify: `app/src-tauri/src/main.rs`
- Modify: `app/src-tauri/Cargo.toml`

- [ ] **Step 1: Add a keyring dep (if needed)**

Inspect `app/src-tauri/Cargo.toml`. If no keyring plugin exists, add:

```toml
tauri-plugin-keychain = "1"  # or "tauri-plugin-keyring = \"2\"" depending on availability in the current Tauri v2 plugin matrix
```

(If the current Tauri v2 plugin ecosystem name differs, use the one actually available. The `keyring` crate directly also works: `keyring = "3"`.)

For V1 simplicity, use the `keyring` crate directly without a Tauri plugin:

```toml
keyring = "3"
```

- [ ] **Step 2: Implement commands**

In `app/src-tauri/src/commands.rs`:

```rust
#[derive(Serialize, Deserialize, Clone)]
pub struct SummaryResponse {
    pub text: String,
    pub generated_at: String,
    pub backend: String,
    pub stale_seconds: i64,
}

#[tauri::command]
pub fn get_summary(session_id: String) -> Result<Option<SummaryResponse>, String> {
    let conn = crate::store::open_readonly().map_err(|e| e.to_string())?;
    let row: Option<(String, String, String)> = conn.query_row(
        "SELECT text, generated_at, backend FROM session_summaries WHERE session_id = ?1",
        rusqlite::params![session_id],
        |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
    ).ok();

    let Some((text, generated_at, backend)) = row else { return Ok(None); };
    let stale = (chrono::Utc::now()
        - chrono::DateTime::parse_from_rfc3339(&generated_at)
            .map_err(|e| e.to_string())?
            .with_timezone(&chrono::Utc)
    ).num_seconds();
    Ok(Some(SummaryResponse { text, generated_at, backend, stale_seconds: stale }))
}

#[tauri::command]
pub async fn refresh_summary(session_id: String) -> Result<(), String> {
    // Signal the daemon to refresh via a simple sentinel file it watches, or
    // shell out to `vigil refresh-summary <id>`. Simplest V1:
    let home = std::env::home_dir().ok_or("no home dir")?;
    let trigger_dir = home.join(".vigil").join("refresh-triggers");
    std::fs::create_dir_all(&trigger_dir).map_err(|e| e.to_string())?;
    let trigger = trigger_dir.join(format!("{}.flag", session_id.replace('/', "_")));
    std::fs::write(&trigger, chrono::Utc::now().to_rfc3339()).map_err(|e| e.to_string())?;
    Ok(())
}

#[derive(Serialize, Clone)]
pub struct CliStatus {
    pub claude: bool,
    pub codex: bool,
}

#[tauri::command]
pub fn detect_cli() -> CliStatus {
    let claude = std::process::Command::new("claude").arg("--version")
        .output().map(|o| o.status.success()).unwrap_or(false);
    let codex = std::process::Command::new("codex").arg("--version")
        .output().map(|o| o.status.success()).unwrap_or(false);
    CliStatus { claude, codex }
}

#[tauri::command]
pub fn save_api_key(provider: String, key: String) -> Result<(), String> {
    let entry = keyring::Entry::new("vigil", &format!("api-key-{}", provider))
        .map_err(|e| e.to_string())?;
    entry.set_password(&key).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn has_api_key(provider: String) -> bool {
    keyring::Entry::new("vigil", &format!("api-key-{}", provider))
        .and_then(|e| e.get_password())
        .is_ok()
}
```

And in the daemon's `watch` loop, poll `~/.vigil/refresh-triggers/*.flag`: for each flag, regenerate that session's summary immediately and delete the flag. Add this poll in a small `tokio::spawn` (5-second interval) in `cli.rs`:

```rust
let store_trig = store.clone();
tokio::spawn(async move {
    let trigger_dir = home::home_dir().unwrap().join(".vigil").join("refresh-triggers");
    loop {
        if let Ok(entries) = std::fs::read_dir(&trigger_dir) {
            for entry in entries.flatten() {
                let path = entry.path();
                if path.extension().and_then(|e| e.to_str()) != Some("flag") { continue; }
                let Some(session_id) = path.file_stem().and_then(|s| s.to_str()) else { continue };
                let session_id = session_id.replace('_', "/");
                let _ = std::fs::remove_file(&path);
                let store_inner = store_trig.clone();
                let sid = session_id.clone();
                tokio::spawn(async move {
                    let _ = crate::summarizer::generate_and_cache(&store_inner, &sid, Vec::new(), None).await;
                });
            }
        }
        tokio::time::sleep(std::time::Duration::from_secs(5)).await;
    }
});
```

- [ ] **Step 3: Register commands**

In `main.rs`:

```rust
.invoke_handler(tauri::generate_handler![
    // ... existing ...
    commands::get_hosts,
    commands::get_live_sessions,
    commands::get_summary,
    commands::refresh_summary,
    commands::detect_cli,
    commands::save_api_key,
    commands::has_api_key,
])
```

- [ ] **Step 4: Build**

```bash
cd /Users/costaxanthos/conductor/repos/vigil/app
npm run tauri:build -- --debug 2>&1 | tail -10
```

Expected: builds.

- [ ] **Step 5: Commit**

```bash
cd /Users/costaxanthos/conductor/repos/vigil
git add app/src-tauri/ daemon/src/cli.rs
git commit -m "$(cat <<'EOF'
feat(tauri): summary, CLI detection, and Keychain API key commands

Adds get_summary, refresh_summary (via daemon flag file), detect_cli for
onboarding, and save_api_key/has_api_key using the keyring crate.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

# Phase F — Frontend: Layout Shell

## Task 16: `ThreePaneGrid` with resizable dividers

**Why:** All UI sits inside this shell. Get it right once.

**Files:**
- Create: `app/src/components/layout/ThreePaneGrid.tsx`
- Create: `app/src/store/selection.ts`
- Create: `app/src/__tests__/selection.test.ts`

- [ ] **Step 1: Create the selection store (Zustand)**

Create `app/src/store/selection.ts`:

```ts
import { create } from "zustand";
import { persist } from "zustand/middleware";

export interface SelectionState {
  selectedSessionId: string | null;
  leftWidth: number;
  rightWidth: number;
  setSelected: (id: string | null) => void;
  setLeftWidth: (px: number) => void;
  setRightWidth: (px: number) => void;
}

export const useSelection = create<SelectionState>()(
  persist(
    (set) => ({
      selectedSessionId: null,
      leftWidth: 280,
      rightWidth: 320,
      setSelected: (id) => set({ selectedSessionId: id }),
      setLeftWidth: (px) => set({ leftWidth: clamp(px, 200, 480) }),
      setRightWidth: (px) => set({ rightWidth: clamp(px, 240, 520) }),
    }),
    { name: "vigil-selection" },
  ),
);

function clamp(v: number, lo: number, hi: number) {
  return Math.min(hi, Math.max(lo, v));
}
```

- [ ] **Step 2: Write tests for the selection store**

Create `app/src/__tests__/selection.test.ts`:

```ts
import { describe, it, expect, beforeEach } from "vitest";
import { useSelection } from "../store/selection";

describe("useSelection", () => {
  beforeEach(() => {
    localStorage.clear();
    // Reset store to defaults:
    useSelection.setState({
      selectedSessionId: null,
      leftWidth: 280,
      rightWidth: 320,
    });
  });

  it("starts with nothing selected", () => {
    expect(useSelection.getState().selectedSessionId).toBeNull();
  });

  it("setSelected updates state", () => {
    useSelection.getState().setSelected("sess-abc");
    expect(useSelection.getState().selectedSessionId).toBe("sess-abc");
  });

  it("clamps left width to allowed range", () => {
    useSelection.getState().setLeftWidth(50);
    expect(useSelection.getState().leftWidth).toBe(200);
    useSelection.getState().setLeftWidth(9000);
    expect(useSelection.getState().leftWidth).toBe(480);
  });

  it("clamps right width to allowed range", () => {
    useSelection.getState().setRightWidth(10);
    expect(useSelection.getState().rightWidth).toBe(240);
    useSelection.getState().setRightWidth(9999);
    expect(useSelection.getState().rightWidth).toBe(520);
  });
});
```

- [ ] **Step 3: Run tests**

```bash
cd /Users/costaxanthos/conductor/repos/vigil/app
npm run test -- selection
```

Expected: 4 passing.

- [ ] **Step 4: Create `ThreePaneGrid`**

Create `app/src/components/layout/ThreePaneGrid.tsx`:

```tsx
import { useCallback, useRef } from "react";
import { useSelection } from "../../store/selection";

interface Props {
  left: React.ReactNode;
  middle: React.ReactNode;
  right: React.ReactNode;
}

export function ThreePaneGrid({ left, middle, right }: Props) {
  const leftWidth = useSelection((s) => s.leftWidth);
  const rightWidth = useSelection((s) => s.rightWidth);
  const setLeft = useSelection((s) => s.setLeftWidth);
  const setRight = useSelection((s) => s.setRightWidth);

  const gridRef = useRef<HTMLDivElement>(null);

  const onLeftDrag = useDividerDrag((deltaPx) => setLeft(leftWidth + deltaPx));
  const onRightDrag = useDividerDrag((deltaPx) => setRight(rightWidth - deltaPx));

  return (
    <div
      ref={gridRef}
      className="h-full w-full grid"
      style={{ gridTemplateColumns: `${leftWidth}px 4px 1fr 4px ${rightWidth}px` }}
    >
      <div className="overflow-hidden">{left}</div>
      <Divider onDrag={onLeftDrag} />
      <div className="overflow-hidden">{middle}</div>
      <Divider onDrag={onRightDrag} />
      <div className="overflow-hidden">{right}</div>
    </div>
  );
}

function Divider({ onDrag }: { onDrag: (e: React.PointerEvent) => void }) {
  return (
    <div
      onPointerDown={onDrag}
      className="cursor-col-resize hover:bg-white/10 transition-colors"
      style={{ touchAction: "none" }}
    />
  );
}

function useDividerDrag(onDelta: (deltaPx: number) => void) {
  return useCallback(
    (e: React.PointerEvent) => {
      e.preventDefault();
      const startX = e.clientX;
      const target = e.currentTarget as HTMLElement;
      target.setPointerCapture(e.pointerId);

      let last = startX;
      const move = (ev: PointerEvent) => {
        const delta = ev.clientX - last;
        last = ev.clientX;
        onDelta(delta);
      };
      const up = () => {
        target.releasePointerCapture(e.pointerId);
        window.removeEventListener("pointermove", move);
        window.removeEventListener("pointerup", up);
      };
      window.addEventListener("pointermove", move);
      window.addEventListener("pointerup", up);
    },
    [onDelta],
  );
}
```

- [ ] **Step 5: Typecheck**

```bash
cd /Users/costaxanthos/conductor/repos/vigil/app
npx tsc --noEmit
```

Expected: passes. Zustand's `persist` middleware may be already available (Zustand is installed). If `@types` complains, ensure `zustand` is on latest minor — it ships types directly.

- [ ] **Step 6: Commit**

```bash
cd /Users/costaxanthos/conductor/repos/vigil
git add app/src/
git commit -m "$(cat <<'EOF'
feat(frontend): ThreePaneGrid shell with resizable dividers

Uses Zustand selection store with persist middleware so pane widths and
selection survive restarts. Clamped ranges prevent degenerate layouts.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

# Phase G — Frontend: Left Rail

## Task 17: Host tokens (color + display name)

**Why:** Used by every sidebar render. Centralize the map.

**Files:**
- Create: `app/src/lib/host-tokens.ts`
- Create: `app/src/__tests__/host-tokens.test.ts`

- [ ] **Step 1: Create the token map**

Create `app/src/lib/host-tokens.ts`:

```ts
import type { HostKind } from "../types";

export interface HostToken {
  label: string;
  color: string;   // hex — also used for box-shadow glow
}

const MAP: Record<HostKind, HostToken> = {
  ghostty:   { label: "Ghostty",    color: "#00ff88" },
  iterm2:    { label: "iTerm2",     color: "#ffb800" },
  terminal:  { label: "Terminal",   color: "#60a5fa" },
  warp:      { label: "Warp",       color: "#f472b6" },
  kitty:     { label: "Kitty",      color: "#fb923c" },
  alacritty: { label: "Alacritty",  color: "#818cf8" },
  conductor: { label: "Conductor",  color: "#a78bfa" },
  cursor:    { label: "Cursor",     color: "#00d9ff" },
  vscode:    { label: "VS Code",    color: "#0ea5e9" },
  zed:       { label: "Zed",        color: "#34d399" },
  windsurf:  { label: "Windsurf",   color: "#f59e0b" },
  unknown:   { label: "Other",      color: "#9ca3af" },
};

export function hostToken(kind: HostKind): HostToken {
  return MAP[kind];
}
```

- [ ] **Step 2: Write tests**

Create `app/src/__tests__/host-tokens.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { hostToken } from "../lib/host-tokens";
import { HOST_KINDS } from "../types";

describe("hostToken", () => {
  it("returns a label and color for every HostKind", () => {
    for (const kind of HOST_KINDS) {
      const t = hostToken(kind);
      expect(t.label).toBeTruthy();
      expect(t.color).toMatch(/^#[0-9a-f]{6}$/i);
    }
  });

  it("Conductor is purple", () => {
    expect(hostToken("conductor").color).toBe("#a78bfa");
  });

  it("unknown is labeled 'Other'", () => {
    expect(hostToken("unknown").label).toBe("Other");
  });
});
```

- [ ] **Step 3: Run tests**

```bash
cd /Users/costaxanthos/conductor/repos/vigil/app
npm run test -- host-tokens
```

Expected: 3 passing.

- [ ] **Step 4: Commit**

```bash
cd /Users/costaxanthos/conductor/repos/vigil
git add app/src/lib/host-tokens.ts app/src/__tests__/host-tokens.test.ts
git commit -m "$(cat <<'EOF'
feat(frontend): host token map (label + color)

Centralized lookup for host display names and their accent colors.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 18: `SessionRow` — compact left-rail card

**Why:** The most-rendered atom in the left rail. Keep it tight and accessible.

**Files:**
- Create: `app/src/components/SessionRow.tsx`

- [ ] **Step 1: Create component**

Create `app/src/components/SessionRow.tsx`:

```tsx
import { motion } from "framer-motion";
import { hostToken } from "../lib/host-tokens";
import type { SessionGroup } from "../types";

interface Props {
  session: SessionGroup;
  selected: boolean;
  onSelect: () => void;
}

export function SessionRow({ session, selected, onSelect }: Props) {
  const token = hostToken(session.hostKind);
  const addedRemoved = tallyFiles(session);

  return (
    <motion.button
      type="button"
      onClick={onSelect}
      layout
      initial={{ opacity: 0, x: -6 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ type: "spring", stiffness: 400, damping: 30 }}
      className="w-full text-left px-2.5 py-2 rounded-md transition-colors"
      style={{
        background: selected ? `${token.color}1A` : "transparent",
        borderLeft: `2px solid ${selected ? token.color : "transparent"}`,
        boxShadow: selected ? `inset 0 0 0 1px ${token.color}26` : undefined,
      }}
    >
      <div className="flex items-baseline justify-between gap-2">
        <span className={`text-[12px] truncate ${selected ? "text-white font-semibold" : "text-white/80"}`}>
          {session.description || "(no description)"}
        </span>
        <span className="text-[10px] font-mono text-white/40 shrink-0">
          {shortModel(session.model)}
        </span>
      </div>
      <div className="text-[11px] text-white/50 flex justify-between gap-2 mt-0.5">
        <span className="truncate">{session.agent} · {repoName(session.repoPath)}</span>
        <span className="font-mono shrink-0">
          <span className="text-emerald-400">+{addedRemoved.added}</span>{" "}
          <span className="text-rose-400">-{addedRemoved.removed}</span>
        </span>
      </div>
    </motion.button>
  );
}

function tallyFiles(s: SessionGroup) {
  return s.files.reduce(
    (acc, f) => ({ added: acc.added + (f.added || 0), removed: acc.removed + (f.removed || 0) }),
    { added: 0, removed: 0 },
  );
}

function repoName(p: string): string {
  if (!p) return "";
  const parts = p.split("/").filter(Boolean);
  return parts[parts.length - 1] ?? p;
}

function shortModel(model: string | null): string {
  if (!model) return "";
  if (model.includes("opus")) return "Opus";
  if (model.includes("sonnet")) return "Sonnet";
  if (model.includes("haiku")) return "Haiku";
  if (model.includes("gpt")) return "GPT";
  return model.split("-")[0] ?? "";
}
```

- [ ] **Step 2: Typecheck**

```bash
cd /Users/costaxanthos/conductor/repos/vigil/app
npx tsc --noEmit
```

Expected: passes.

- [ ] **Step 3: Commit**

```bash
cd /Users/costaxanthos/conductor/repos/vigil
git add app/src/components/SessionRow.tsx
git commit -m "$(cat <<'EOF'
feat(frontend): SessionRow — compact left-rail session card

Shows description, short model tag, agent · repo, and +X -Y diff stats.
Selected state uses host-color tint with inset border glow.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 19: `HostGroup` — host header with pulsing dot and its sessions

**Files:**
- Create: `app/src/components/HostGroup.tsx`

- [ ] **Step 1: Create component**

Create `app/src/components/HostGroup.tsx`:

```tsx
import { motion } from "framer-motion";
import { hostToken } from "../lib/host-tokens";
import { SessionRow } from "./SessionRow";
import type { HostKind, SessionGroup } from "../types";

interface Props {
  hostKind: HostKind;
  sessions: SessionGroup[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}

export function HostGroup({ hostKind, sessions, selectedId, onSelect }: Props) {
  const token = hostToken(hostKind);
  const liveCount = sessions.filter((s) => s.isLive).length;

  return (
    <div className="px-1.5 mb-2.5">
      <div className="flex items-center gap-2 py-1 px-1.5">
        <motion.span
          aria-hidden
          className="w-1.5 h-1.5 rounded-full"
          style={{ background: token.color, boxShadow: `0 0 8px ${token.color}` }}
          animate={liveCount > 0 ? { opacity: [0.6, 1, 0.6] } : { opacity: 0.45 }}
          transition={{ duration: 2, repeat: Infinity }}
        />
        <span className="text-[12px] text-white/75 font-semibold">{token.label}</span>
        <span className="text-[10px] text-white/35 ml-auto">{sessions.length}</span>
      </div>
      <div className="ml-3.5 mt-1 space-y-[3px]">
        {sessions.map((s) => (
          <SessionRow
            key={s.id}
            session={s}
            selected={selectedId === s.id}
            onSelect={() => onSelect(s.id)}
          />
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Typecheck**

```bash
cd /Users/costaxanthos/conductor/repos/vigil/app && npx tsc --noEmit
```

- [ ] **Step 3: Commit**

```bash
cd /Users/costaxanthos/conductor/repos/vigil
git add app/src/components/HostGroup.tsx
git commit -m "$(cat <<'EOF'
feat(frontend): HostGroup header with pulsing status dot

Renders host name + live-count; animates the dot only when at least one
session in the group is live.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 20: `LeftRail` — translucent sidebar assembling host groups

**Files:**
- Create: `app/src/components/layout/LeftRail.tsx`

- [ ] **Step 1: Create the rail**

Create `app/src/components/layout/LeftRail.tsx`:

```tsx
import { useMemo } from "react";
import { HostGroup } from "../HostGroup";
import { hostToken } from "../../lib/host-tokens";
import { useSelection } from "../../store/selection";
import type { HostKind, SessionGroup } from "../../types";
import { HOST_KINDS } from "../../types";

interface Props {
  sessions: SessionGroup[];
}

export function LeftRail({ sessions }: Props) {
  const selectedId = useSelection((s) => s.selectedSessionId);
  const setSelected = useSelection((s) => s.setSelected);

  const { groups, idleHosts, totalLive } = useMemo(() => partition(sessions), [sessions]);

  return (
    <aside
      className="h-full overflow-y-auto"
      style={{
        background: "rgba(24,24,27,0.55)",
        backdropFilter: "blur(20px)",
        WebkitBackdropFilter: "blur(20px)",
        borderRight: "1px solid rgba(255,255,255,0.06)",
      }}
    >
      <div className="px-3.5 pt-3.5 pb-2.5 flex items-center justify-between">
        <div className="text-[11px] tracking-[0.08em] uppercase text-white/45 font-semibold">
          Active now
        </div>
        <div className="text-[10px] text-white/35">{totalLive}</div>
      </div>

      {groups.length === 0 && (
        <div className="px-4 py-6 text-[12px] text-white/45">
          No agent activity yet. Start a session in a supported host to see it appear here.
        </div>
      )}

      {groups.map(({ kind, items }) => (
        <HostGroup
          key={kind}
          hostKind={kind}
          sessions={items}
          selectedId={selectedId}
          onSelect={setSelected}
        />
      ))}

      {idleHosts.length > 0 && (
        <div className="px-3.5 py-2.5 mt-3 opacity-50">
          <div className="text-[10px] tracking-[0.08em] uppercase text-white/35 font-semibold">
            Idle
          </div>
          <div className="text-[12px] text-white/55 mt-1.5">
            {idleHosts.map((k) => hostToken(k).label).join(" · ")}
          </div>
        </div>
      )}
    </aside>
  );
}

function partition(sessions: SessionGroup[]) {
  const byHost = new Map<HostKind, SessionGroup[]>();
  for (const s of sessions) {
    const kind = s.hostKind;
    if (!byHost.has(kind)) byHost.set(kind, []);
    byHost.get(kind)!.push(s);
  }
  const seenKinds = new Set(byHost.keys());
  const groups = Array.from(byHost.entries())
    .map(([kind, items]) => ({ kind, items: [...items].sort((a, b) => b.endTime.localeCompare(a.endTime)) }))
    .sort((a, b) => b.items.length - a.items.length);

  const idleHosts = HOST_KINDS.filter((k) => !seenKinds.has(k) && k !== "unknown");
  const totalLive = sessions.filter((s) => s.isLive).length;

  return { groups, idleHosts, totalLive };
}
```

- [ ] **Step 2: Typecheck**

```bash
cd /Users/costaxanthos/conductor/repos/vigil/app && npx tsc --noEmit
```

- [ ] **Step 3: Commit**

```bash
cd /Users/costaxanthos/conductor/repos/vigil
git add app/src/components/layout/LeftRail.tsx
git commit -m "$(cat <<'EOF'
feat(frontend): LeftRail with translucent background and host partitioning

Groups sessions by host, shows idle hosts as a dim footer line, renders
pulsing active-now header count. Backdrop blur for the glass effect.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

# Phase H — Frontend: Middle Pane

## Task 21: Session header + running pill

**Files:**
- Create: `app/src/components/SessionHeader.tsx`

- [ ] **Step 1: Create the component**

```tsx
// app/src/components/SessionHeader.tsx
import { motion } from "framer-motion";
import { hostToken } from "../lib/host-tokens";
import type { SessionGroup } from "../types";
import { relativeTime } from "../types";

interface Props {
  session: SessionGroup;
}

export function SessionHeader({ session }: Props) {
  const token = hostToken(session.hostKind);
  const elapsed = elapsedSince(session.startTime);

  return (
    <div className="px-5 py-3.5 border-b border-white/5 flex items-center justify-between">
      <div>
        <div className="text-[14px] text-white font-semibold">{session.description || "Session"}</div>
        <div className="text-[11px] text-white/50 font-mono mt-0.5">
          {session.repoPath ? `${repoName(session.repoPath)} · ` : ""}
          {token.label} · {elapsed}
        </div>
      </div>
      {session.isLive ? (
        <motion.div
          className="flex items-center gap-1.5 rounded-full px-2.5 py-1"
          style={{ background: `${token.color}1A` }}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
        >
          <motion.span
            className="w-1.5 h-1.5 rounded-full"
            style={{ background: token.color }}
            animate={{ opacity: [0.6, 1, 0.6] }}
            transition={{ duration: 2, repeat: Infinity }}
          />
          <span className="text-[11px] text-white/75">Running</span>
        </motion.div>
      ) : (
        <div className="rounded-full px-2.5 py-1 bg-white/5">
          <span className="text-[11px] text-white/55">Closed · {relativeTime(session.endTime)}</span>
        </div>
      )}
    </div>
  );
}

function repoName(p: string): string {
  const parts = (p ?? "").split("/").filter(Boolean);
  return parts[parts.length - 1] ?? p;
}

function elapsedSince(startIso: string): string {
  const start = new Date(startIso).getTime();
  const ms = Math.max(0, Date.now() - start);
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ${s % 60}s`;
  const h = Math.floor(m / 60);
  return `${h}h ${m % 60}m`;
}
```

- [ ] **Step 2: Typecheck and commit**

```bash
cd /Users/costaxanthos/conductor/repos/vigil/app && npx tsc --noEmit
cd /Users/costaxanthos/conductor/repos/vigil
git add app/src/components/SessionHeader.tsx
git commit -m "$(cat <<'EOF'
feat(frontend): SessionHeader with running pill and elapsed time

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 22: `SummaryBlock` — plain-English summary with cross-fade refresh

**Files:**
- Create: `app/src/components/SummaryBlock.tsx`

- [ ] **Step 1: Create the component**

```tsx
// app/src/components/SummaryBlock.tsx
import { AnimatePresence, motion } from "framer-motion";
import { hostToken } from "../lib/host-tokens";
import type { HostKind } from "../types";

interface Props {
  summary: string | null;
  generatedAt: string | null;
  hostKind: HostKind;
  model: string | null;
  onRefresh?: () => void;
  isRefreshing?: boolean;
  fallbackDescription?: string;
  hasCli: boolean;
}

export function SummaryBlock({
  summary, generatedAt, hostKind, model, onRefresh, isRefreshing, fallbackDescription, hasCli,
}: Props) {
  const token = hostToken(hostKind);
  const display = summary ?? fallbackDescription ?? "";

  return (
    <div
      className="px-5 py-4 border-b border-white/5"
      style={{ background: `linear-gradient(180deg, ${token.color}0F, transparent)` }}
    >
      <div className="flex items-center justify-between mb-1.5">
        <div className="text-[10px] tracking-[0.08em] uppercase text-white/40 font-semibold">
          What's happening
        </div>
        {onRefresh && (
          <button
            type="button"
            onClick={onRefresh}
            disabled={isRefreshing || !hasCli}
            className="text-[11px] text-white/50 hover:text-white/80 disabled:opacity-40 transition-colors"
          >
            {isRefreshing ? "refreshing…" : "refresh"}
          </button>
        )}
      </div>
      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={display || "empty"}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.4 }}
          className="text-[13px] text-white/90 leading-relaxed"
        >
          {display
            ? display
            : hasCli
              ? <ShimmerLines />
              : <div className="text-white/55">Connect Claude or Codex in settings to see plain-English summaries of what the agent is doing.</div>}
        </motion.div>
      </AnimatePresence>
      {generatedAt && (
        <div className="mt-2 text-[11px] text-white/40">
          Generated {relativeTimeFromIso(generatedAt)}
          {model ? ` by ${humanModel(model)}` : null}
        </div>
      )}
    </div>
  );
}

function ShimmerLines() {
  return (
    <div className="space-y-1.5">
      <div className="h-3 rounded bg-white/6 animate-pulse w-[92%]" />
      <div className="h-3 rounded bg-white/6 animate-pulse w-[78%]" />
      <div className="h-3 rounded bg-white/6 animate-pulse w-[64%]" />
    </div>
  );
}

function relativeTimeFromIso(iso: string): string {
  const diff = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (diff < 60) return `${Math.floor(diff)}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  return `${Math.floor(diff / 3600)}h ago`;
}

function humanModel(m: string): string {
  if (m.includes("opus")) return "Claude Opus";
  if (m.includes("sonnet")) return "Claude Sonnet";
  if (m.includes("haiku")) return "Claude Haiku";
  if (m.includes("gpt")) return "GPT";
  return m;
}
```

- [ ] **Step 2: Typecheck and commit**

```bash
cd /Users/costaxanthos/conductor/repos/vigil/app && npx tsc --noEmit
cd /Users/costaxanthos/conductor/repos/vigil
git add app/src/components/SummaryBlock.tsx
git commit -m "$(cat <<'EOF'
feat(frontend): SummaryBlock with cross-fade refresh and shimmer

Handles three states: summary present (cross-fade on update), loading
(shimmer), no-CLI (prompt to connect).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 23: `ActivityStream` — timestamped, auto-scrolling feed

**Files:**
- Create: `app/src/components/ActivityStream.tsx`

- [ ] **Step 1: Create the component**

```tsx
// app/src/components/ActivityStream.tsx
import { useEffect, useRef } from "react";
import { motion } from "framer-motion";
import type { SessionGroup, SessionFile } from "../types";

interface Props {
  session: SessionGroup;
}

interface Row {
  id: string;
  timestamp: string;
  glyph: string;
  glyphColor: string;
  text: React.ReactNode;
  added?: number;
  removed?: number;
}

export function ActivityStream({ session }: Props) {
  const rows: Row[] = fileRows(session.files);
  const ref = useRef<HTMLDivElement>(null);
  const lockedToBottom = useRef(true);

  useEffect(() => {
    if (!ref.current) return;
    if (lockedToBottom.current) ref.current.scrollTop = ref.current.scrollHeight;
  }, [rows.length]);

  function onScroll() {
    if (!ref.current) return;
    const { scrollTop, scrollHeight, clientHeight } = ref.current;
    lockedToBottom.current = scrollHeight - (scrollTop + clientHeight) < 20;
  }

  return (
    <div ref={ref} onScroll={onScroll} className="flex-1 overflow-y-auto px-5 py-3 font-mono text-[12px]">
      {rows.length === 0 && (
        <div className="text-white/45 text-[12px]">No activity yet.</div>
      )}
      {rows.map((r) => (
        <motion.div
          key={r.id}
          initial={{ opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.18 }}
          className="flex gap-2.5 py-1.5 text-white/55"
        >
          <span className="text-white/30 min-w-[44px]">{shortTime(r.timestamp)}</span>
          <span style={{ color: r.glyphColor }} className="min-w-[14px]">{r.glyph}</span>
          <span className="flex-1 truncate">{r.text}</span>
          {typeof r.added === "number" && (
            <span className="ml-auto text-white/30">+{r.added} -{r.removed}</span>
          )}
        </motion.div>
      ))}
    </div>
  );
}

function fileRows(files: SessionFile[]): Row[] {
  return files.map((f, i) => {
    const glyph = f.kind === "file_create" ? "+" : f.kind === "file_delete" ? "×" : "~";
    const color = f.kind === "file_create" ? "#4ade80" : f.kind === "file_delete" ? "#f87171" : "#60a5fa";
    return {
      id: `${i}-${f.path}`,
      timestamp: new Date().toISOString(), // session files don't currently carry per-file timestamps; stamp uniformly
      glyph,
      glyphColor: color,
      text: <span className="text-white/85">{f.path}</span>,
      added: f.added,
      removed: f.removed,
    };
  });
}

function shortTime(iso: string): string {
  const d = new Date(iso);
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

function pad(n: number): string { return String(n).padStart(2, "0"); }
```

- [ ] **Step 2: Typecheck and commit**

```bash
cd /Users/costaxanthos/conductor/repos/vigil/app && npx tsc --noEmit
cd /Users/costaxanthos/conductor/repos/vigil
git add app/src/components/ActivityStream.tsx
git commit -m "$(cat <<'EOF'
feat(frontend): ActivityStream — timestamped feed with sticky bottom

Auto-scrolls to the newest row unless the user has scrolled up.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 24: `SessionFooter` — model + cost + tool count

**Files:**
- Create: `app/src/components/SessionFooter.tsx`

- [ ] **Step 1: Create the component**

```tsx
// app/src/components/SessionFooter.tsx
import { hostToken } from "../lib/host-tokens";
import type { SessionGroup } from "../types";
import { formatCost } from "../types";

interface Props {
  session: SessionGroup;
}

export function SessionFooter({ session }: Props) {
  const token = hostToken(session.hostKind);
  const fileCount = session.files.length;

  return (
    <div className="px-5 py-2.5 border-t border-white/5 flex items-center justify-between text-[11px] text-white/45">
      <div className="flex items-center gap-3">
        <span className="inline-flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full" style={{ background: token.color }} aria-hidden />
          <span className="text-white/60">{humanModel(session.model)}</span>
          {session.isLive && <span className="text-white/40">· working</span>}
        </span>
        {session.costUsd > 0 && <span>{formatCost(session.costUsd)}</span>}
      </div>
      <div className="font-mono">{fileCount} files touched</div>
    </div>
  );
}

function humanModel(m: string | null): string {
  if (!m) return "unknown";
  if (m.includes("opus")) return "Claude Opus";
  if (m.includes("sonnet")) return "Claude Sonnet";
  if (m.includes("haiku")) return "Claude Haiku";
  if (m.includes("gpt-5")) return "GPT-5";
  if (m.includes("gpt")) return "GPT";
  return m;
}
```

- [ ] **Step 2: Typecheck and commit**

```bash
cd /Users/costaxanthos/conductor/repos/vigil/app && npx tsc --noEmit
cd /Users/costaxanthos/conductor/repos/vigil
git add app/src/components/SessionFooter.tsx
git commit -m "$(cat <<'EOF'
feat(frontend): SessionFooter — model, cost, file count

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 25: `MiddlePane` — assemble header, summary, stream, footer

**Files:**
- Create: `app/src/components/layout/MiddlePane.tsx`

- [ ] **Step 1: Create the pane**

```tsx
// app/src/components/layout/MiddlePane.tsx
import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { ActivityStream } from "../ActivityStream";
import { SessionFooter } from "../SessionFooter";
import { SessionHeader } from "../SessionHeader";
import { SummaryBlock } from "../SummaryBlock";
import type { SessionGroup } from "../../types";

interface Props {
  session: SessionGroup | null;
  hasCli: boolean;
}

interface ServerSummary {
  text: string;
  generated_at: string;
  backend: string;
  stale_seconds: number;
}

export function MiddlePane({ session, hasCli }: Props) {
  const [summary, setSummary] = useState<ServerSummary | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    setSummary(null);
    if (!session) return;
    let cancelled = false;
    async function load() {
      try {
        const res = await invoke<ServerSummary | null>("get_summary", { sessionId: session.id });
        if (!cancelled) setSummary(res);
      } catch (_) {
        if (!cancelled) setSummary(null);
      }
    }
    load();
    const id = window.setInterval(load, 5000);
    return () => { cancelled = true; window.clearInterval(id); };
  }, [session?.id]);

  if (!session) {
    return (
      <div className="h-full flex items-center justify-center bg-[#121214]">
        <div className="text-center max-w-sm px-6">
          <div className="text-[14px] text-white/75 mb-1.5">No session selected</div>
          <div className="text-[12px] text-white/45">
            Pick a session from the left, or start one in Claude Code / Conductor / Cursor.
          </div>
        </div>
      </div>
    );
  }

  async function onRefresh() {
    if (!session || refreshing) return;
    setRefreshing(true);
    try {
      await invoke("refresh_summary", { sessionId: session.id });
      window.setTimeout(async () => {
        try {
          const res = await invoke<ServerSummary | null>("get_summary", { sessionId: session.id });
          setSummary(res);
        } finally {
          setRefreshing(false);
        }
      }, 1500);
    } catch {
      setRefreshing(false);
    }
  }

  return (
    <section className="h-full flex flex-col bg-[#121214]">
      <SessionHeader session={session} />
      <SummaryBlock
        summary={summary?.text ?? session.summaryPlainEnglish ?? null}
        generatedAt={summary?.generated_at ?? session.summaryGeneratedAt ?? null}
        hostKind={session.hostKind}
        model={session.model}
        onRefresh={onRefresh}
        isRefreshing={refreshing}
        fallbackDescription={session.description}
        hasCli={hasCli}
      />
      <ActivityStream session={session} />
      <SessionFooter session={session} />
    </section>
  );
}
```

- [ ] **Step 2: Typecheck and commit**

```bash
cd /Users/costaxanthos/conductor/repos/vigil/app && npx tsc --noEmit
cd /Users/costaxanthos/conductor/repos/vigil
git add app/src/components/layout/MiddlePane.tsx
git commit -m "$(cat <<'EOF'
feat(frontend): MiddlePane composes header + summary + stream + footer

Polls get_summary every 5s while a session is selected; refresh button
fires refresh_summary and re-fetches after 1.5s.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

# Phase I — Frontend: Right Rail

## Task 26: `RightRail` — tabs + `FilesPanel` + diff drawer

**Files:**
- Create: `app/src/components/FilesPanel.tsx`
- Create: `app/src/components/layout/RightRail.tsx`

- [ ] **Step 1: Create `FilesPanel`**

```tsx
// app/src/components/FilesPanel.tsx
import { useState } from "react";
import { DiffViewer } from "./DiffViewer";
import type { SessionFile } from "../types";

interface Props {
  files: SessionFile[];
}

export function FilesPanel({ files }: Props) {
  const [open, setOpen] = useState<string | null>(null);
  const selected = files.find((f) => f.path === open) ?? null;

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <div className="flex-1 overflow-y-auto font-mono text-[11px]">
        {files.length === 0 && (
          <div className="px-4 py-5 text-white/45">No files touched yet.</div>
        )}
        {files.map((f) => {
          const isOpen = open === f.path;
          return (
            <button
              key={f.path}
              type="button"
              onClick={() => setOpen(isOpen ? null : f.path)}
              className={`w-full flex items-center justify-between px-4 py-1.5 text-left hover:bg-white/4 transition-colors ${isOpen ? "bg-white/5 text-white" : "text-white/75"}`}
            >
              <span className="truncate">{f.path}</span>
              <span className="text-white/35 shrink-0 ml-2">
                {kindLetter(f.kind)} <span className="text-emerald-400">+{f.added}</span> <span className="text-rose-400">-{f.removed}</span>
              </span>
            </button>
          );
        })}
      </div>
      {selected?.diff && (
        <div className="border-t border-white/5 max-h-[45%] overflow-auto">
          <div className="px-4 py-2 text-[11px] text-white/55 font-mono">{selected.path}</div>
          <DiffViewer diff={selected.diff} />
        </div>
      )}
    </div>
  );
}

function kindLetter(k: string): string {
  if (k === "file_create") return "N";
  if (k === "file_delete") return "D";
  return "U";
}
```

- [ ] **Step 2: Create `RightRail`**

```tsx
// app/src/components/layout/RightRail.tsx
import { useState } from "react";
import { FilesPanel } from "../FilesPanel";
import type { SessionGroup } from "../../types";

type Tab = "all" | "changes" | "checks" | "review";

interface Props {
  session: SessionGroup | null;
}

export function RightRail({ session }: Props) {
  const [tab, setTab] = useState<Tab>("changes");
  const changeCount = session ? session.files.length : 0;

  return (
    <aside
      className="h-full flex flex-col"
      style={{
        background: "rgba(18,18,20,0.75)",
        borderLeft: "1px solid rgba(255,255,255,0.05)",
      }}
    >
      <nav className="px-4 py-3 border-b border-white/5 flex gap-4 text-[12px]">
        <TabButton active={tab === "all"} onClick={() => setTab("all")}>All files</TabButton>
        <TabButton active={tab === "changes"} onClick={() => setTab("changes")}>
          Changes {changeCount > 0 ? changeCount : null}
        </TabButton>
        <TabButton active={tab === "checks"} onClick={() => setTab("checks")}>Checks</TabButton>
        <TabButton active={tab === "review"} onClick={() => setTab("review")}>Review</TabButton>
      </nav>
      {!session && <div className="px-4 py-5 text-[12px] text-white/45">Select a session to see its changes.</div>}
      {session && tab === "changes" && <FilesPanel files={session.files} />}
      {session && tab !== "changes" && (
        <div className="px-4 py-5 text-[12px] text-white/45">
          This tab is not wired yet. For V1 the changes tab is the canonical view.
        </div>
      )}
      <div className="border-t border-white/5 px-4 py-2.5 text-[11px] text-white/55 flex gap-3.5">
        <span>Setup</span><span>Run</span><span>Terminal</span>
        <span className="ml-auto text-white/30">+</span>
      </div>
    </aside>
  );
}

function TabButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`pb-0.5 transition-colors ${active ? "text-white border-b border-white" : "text-white/45 hover:text-white/75"}`}
    >
      {children}
    </button>
  );
}
```

- [ ] **Step 3: Typecheck and commit**

```bash
cd /Users/costaxanthos/conductor/repos/vigil/app && npx tsc --noEmit
cd /Users/costaxanthos/conductor/repos/vigil
git add app/src/components/FilesPanel.tsx app/src/components/layout/RightRail.tsx
git commit -m "$(cat <<'EOF'
feat(frontend): RightRail with tabs and FilesPanel + diff drawer

Changes tab is populated in V1; other tabs show a placeholder. Expanding
a file row opens the DiffViewer in a bottom drawer.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

# Phase J — Data Wiring

## Task 27: `useDaemonData` reads new commands and fields

**Files:**
- Modify: `app/src/hooks.ts`

- [ ] **Step 1: Extend the polling hook**

Open `app/src/hooks.ts`. In `fetchAll` (or equivalent), add Tauri invokes alongside the existing ones:

```ts
const [hosts, liveSessions, cliStatus] = await Promise.all([
  invoke<HostInfo[]>("get_hosts"),
  invoke<LiveSessionRow[]>("get_live_sessions"),
  invoke<{ claude: boolean; codex: boolean }>("detect_cli"),
]);
```

Define the types near the top:

```ts
import type { HostKind } from "./types";

interface HostInfo {
  kind: HostKind;
  active_sessions: number;
}

interface LiveSessionRow {
  session_id: string;
  host_kind: HostKind;
  agent: string;
  repo_path: string | null;
  started_at: string;
  ended_at: string;
  model: string | null;
  is_live: boolean;
  description: string;
}
```

Merge these into the returned `DaemonState`. Map each `LiveSessionRow` into a `SessionGroup` (using the existing grouping logic for files from events, keyed by session_id — the existing `groupEventsIntoSessions` needs a variant that also accepts the server-side rows and fills the new fields).

Simplest V1 approach: keep `groupEventsIntoSessions(events)` producing the base list, then enrich each `SessionGroup` with fields from the matching `LiveSessionRow`:

```ts
const enriched = grouped.map((g) => {
  const row = liveSessions.find((r) => r.session_id === g.id || r.session_id === maybeOriginalId(g));
  return {
    ...g,
    hostKind: row?.host_kind ?? "unknown",
    hostPid: null,
    model: row?.model ?? null,
    isLive: row?.is_live ?? false,
    summaryPlainEnglish: row?.description ?? null,   // description already is the summary in V1
    summaryGeneratedAt: null,
  } as SessionGroup;
});
```

Add to `DaemonState`:

```ts
export interface DaemonState {
  // ... existing fields ...
  hosts: HostInfo[];
  cli: { claude: boolean; codex: boolean };
}
```

Return these from `useDaemonData`.

- [ ] **Step 2: Typecheck**

```bash
cd /Users/costaxanthos/conductor/repos/vigil/app && npx tsc --noEmit
```

Fix any mismatches where callers read `DaemonState` without the new fields — supply them with default empty values in the fallback demo path too.

- [ ] **Step 3: Commit**

```bash
cd /Users/costaxanthos/conductor/repos/vigil
git add app/src/hooks.ts
git commit -m "$(cat <<'EOF'
feat(frontend): poll get_hosts, get_live_sessions, detect_cli

Enriches each grouped session with host_kind, model, is_live, and the
plain-English description from the daemon.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 28: Rewrite `App.tsx` to render the three-pane layout

**Files:**
- Modify: `app/src/App.tsx`
- Modify: `app/src/components/TopBar.tsx`

- [ ] **Step 1: Simplify TopBar**

Edit `app/src/components/TopBar.tsx` to keep only the logo + connection pill and remove the old filter dropdowns (they'll return in V2 as right-click/context menu):

```tsx
// app/src/components/TopBar.tsx
import logo from "/logo.png";

interface Props {
  connected: boolean;
  hasNewEvents: boolean;
  onOpenCmd: () => void;
}

export function TopBar({ connected, hasNewEvents, onOpenCmd }: Props) {
  return (
    <header className="h-11 flex items-center justify-between px-3.5 border-b border-white/5 bg-[#121214]">
      <div className="flex items-center gap-2">
        <img src={logo} alt="Vigil" className="w-5 h-5" />
        <span className="text-[13px] text-white font-semibold">Vigil</span>
        <span
          className={`w-1.5 h-1.5 rounded-full ml-1.5 ${connected ? "bg-emerald-400" : "bg-rose-400"}`}
          style={{ boxShadow: connected ? `0 0 6px ${hasNewEvents ? "#4ade80" : "#10b981"}` : "none" }}
        />
      </div>
      <button
        type="button"
        onClick={onOpenCmd}
        className="text-[11px] text-white/50 hover:text-white/80 border border-white/10 px-2 py-0.5 rounded font-mono"
      >
        ⌘K
      </button>
    </header>
  );
}
```

- [ ] **Step 2: Rewrite `App.tsx`**

```tsx
// app/src/App.tsx
import { useState, useMemo } from "react";
import { useDaemonData } from "./hooks";
import { TopBar } from "./components/TopBar";
import { ThreePaneGrid } from "./components/layout/ThreePaneGrid";
import { LeftRail } from "./components/layout/LeftRail";
import { MiddlePane } from "./components/layout/MiddlePane";
import { RightRail } from "./components/layout/RightRail";
import { Onboarding } from "./components/Onboarding";
import { CommandPalette } from "./components/CommandPalette";
import { useSelection } from "./store/selection";
import { groupEventsIntoSessions } from "./types";

export default function App() {
  const data = useDaemonData();
  const [cmdOpen, setCmdOpen] = useState(false);
  const selectedId = useSelection((s) => s.selectedSessionId);

  const sessions = useMemo(() => data.sessions ?? groupEventsIntoSessions(data.events, data.commitGroups), [data.sessions, data.events, data.commitGroups]);
  const selected = sessions.find((s) => s.id === selectedId) ?? sessions[0] ?? null;
  const hasCli = data.cli.claude || data.cli.codex;

  const needsOnboarding = !hasCli && !data.demoMode;

  return (
    <div className="h-screen w-screen flex flex-col text-white">
      <TopBar
        connected={data.connected}
        hasNewEvents={data.hasNewEvents}
        onOpenCmd={() => setCmdOpen(true)}
      />
      <div className="flex-1 overflow-hidden">
        {needsOnboarding ? (
          <Onboarding cli={data.cli} />
        ) : (
          <ThreePaneGrid
            left={<LeftRail sessions={sessions} />}
            middle={<MiddlePane session={selected} hasCli={hasCli} />}
            right={<RightRail session={selected} />}
          />
        )}
      </div>
      <CommandPalette open={cmdOpen} agents={data.activeAgents} onSelectAgent={(_a) => setCmdOpen(false)} />
    </div>
  );
}
```

(If `useDaemonData` doesn't yet expose a pre-enriched `sessions` array, the `useMemo` fallback computes it from raw events. The enriched one lives on `data.sessions` per Task 27.)

- [ ] **Step 3: Typecheck**

```bash
cd /Users/costaxanthos/conductor/repos/vigil/app && npx tsc --noEmit
```

- [ ] **Step 4: Commit**

```bash
cd /Users/costaxanthos/conductor/repos/vigil
git add app/src/App.tsx app/src/components/TopBar.tsx
git commit -m "$(cat <<'EOF'
feat(frontend): three-pane App.tsx with simplified TopBar

App now composes ThreePaneGrid with LeftRail, MiddlePane, RightRail.
Renders Onboarding when no CLI is detected. TopBar loses its filter
dropdowns (to return in V2).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

# Phase K — Onboarding + States

## Task 29: `Onboarding` component — detected CLI or paste-a-key fallback

**Files:**
- Create: `app/src/components/Onboarding.tsx`

- [ ] **Step 1: Create the component**

```tsx
// app/src/components/Onboarding.tsx
import { useState } from "react";
import { invoke } from "@tauri-apps/api/core";

interface Props {
  cli: { claude: boolean; codex: boolean };
}

export function Onboarding({ cli }: Props) {
  const [provider, setProvider] = useState<"anthropic" | "openai">("anthropic");
  const [key, setKey] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  async function onSave() {
    if (!key.trim()) return;
    setSaving(true);
    try {
      await invoke("save_api_key", { provider, key: key.trim() });
      setSaved(true);
      setKey("");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="h-full w-full flex items-center justify-center bg-[#0f0f11] text-white">
      <div className="max-w-md w-full px-6 py-10">
        <div className="text-[18px] font-semibold mb-1.5">Connect a Claude to get started</div>
        <div className="text-[13px] text-white/65 leading-relaxed mb-6">
          Vigil watches what AI coding agents are doing and writes plain-English summaries of their work.
          It uses your own Claude Code or Codex to generate those summaries — no extra account required.
        </div>

        <div className="space-y-2 mb-6">
          <DetectRow label="Claude Code" ok={cli.claude} />
          <DetectRow label="Codex CLI"  ok={cli.codex} />
        </div>

        {(cli.claude || cli.codex) ? (
          <div className="rounded-md border border-emerald-400/20 bg-emerald-400/5 px-3.5 py-2.5 text-[12px] text-white/85">
            Ready — Vigil will use {cli.claude ? "Claude Code" : "Codex"} for summaries.
          </div>
        ) : (
          <div className="space-y-3">
            <div className="text-[12px] text-white/55">
              Neither CLI was detected on your PATH. You can install one, or paste an API key below.
            </div>
            <div className="flex items-center gap-2 text-[12px]">
              <button className={`px-2.5 py-1 rounded ${provider === "anthropic" ? "bg-white/10 text-white" : "text-white/55 hover:text-white/85"}`} onClick={() => setProvider("anthropic")}>Anthropic</button>
              <button className={`px-2.5 py-1 rounded ${provider === "openai" ? "bg-white/10 text-white" : "text-white/55 hover:text-white/85"}`} onClick={() => setProvider("openai")}>OpenAI</button>
            </div>
            <input
              type="password"
              value={key}
              onChange={(e) => setKey(e.target.value)}
              placeholder={provider === "anthropic" ? "sk-ant-..." : "sk-..."}
              className="w-full bg-white/5 border border-white/10 rounded px-3 py-1.5 text-[12px] text-white/95 placeholder-white/35 font-mono"
            />
            <button
              type="button"
              onClick={onSave}
              disabled={saving || !key.trim()}
              className="w-full bg-white/10 hover:bg-white/15 disabled:opacity-40 text-[12px] text-white py-1.5 rounded transition-colors"
            >
              {saving ? "saving…" : saved ? "saved — relaunch Vigil" : "save key in Keychain"}
            </button>
            <div className="text-[11px] text-white/45">Stored securely in macOS Keychain. You can delete it anytime from Keychain Access.</div>
          </div>
        )}
      </div>
    </div>
  );
}

function DetectRow({ label, ok }: { label: string; ok: boolean }) {
  return (
    <div className="flex items-center gap-2 text-[13px]">
      <span className={`w-1.5 h-1.5 rounded-full ${ok ? "bg-emerald-400" : "bg-white/25"}`} style={{ boxShadow: ok ? "0 0 6px #4ade80" : "none" }} />
      <span className="text-white/85">{label}</span>
      <span className="ml-auto text-[11px] text-white/45">{ok ? "detected" : "not found"}</span>
    </div>
  );
}
```

- [ ] **Step 2: Typecheck and commit**

```bash
cd /Users/costaxanthos/conductor/repos/vigil/app && npx tsc --noEmit
cd /Users/costaxanthos/conductor/repos/vigil
git add app/src/components/Onboarding.tsx
git commit -m "$(cat <<'EOF'
feat(frontend): onboarding screen — detect CLI or paste API key

Shows green pill when claude/codex is detected and a "Ready" callout; falls
back to provider toggle + password-masked key paste stored in Keychain.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 30: Empty and error states pass + final manual verification

**Why:** Catch anything the above tasks drop (disconnected daemon, zero sessions, missing diff).

**Files:**
- Modify: `app/src/App.tsx` (disconnect pill)
- Manual verification

- [ ] **Step 1: Add a disconnected pill to the top bar**

In `app/src/App.tsx`, right under `<TopBar ... />`, conditionally render a slim banner when `data.connected === false`:

```tsx
{!data.connected && (
  <div className="bg-rose-500/10 border-b border-rose-400/20 px-3.5 py-1 text-[11px] text-rose-200 flex items-center gap-2">
    <span className="w-1.5 h-1.5 rounded-full bg-rose-400" />
    <span>Daemon not reachable · last seen {data.error ?? "never"}</span>
  </div>
)}
```

- [ ] **Step 2: Manual verification checklist**

Start the daemon (one terminal) and the app (another):

```bash
# Terminal A
cd /Users/costaxanthos/conductor/repos/vigil/daemon
cargo run -- watch /Users/costaxanthos/conductor/repos/vigil

# Terminal B
cd /Users/costaxanthos/conductor/repos/vigil/app
npm run tauri:dev
```

With a real Claude Code session running in another window against this repo, verify:

- [ ] Window opens at ~1280×800 with three visible panes
- [ ] Left rail has a translucent/blurred background over the window
- [ ] A host section appears for your current terminal (Ghostty, iTerm2, Warp, etc.)
- [ ] Sessions show under their host; selected session shows the host-colored left border
- [ ] Middle pane shows a non-technical "What's happening" sentence for the selected session (may take up to 30 seconds to generate)
- [ ] Activity stream shows file edits with diff counts
- [ ] Right rail's Changes tab lists the files; clicking one opens the diff drawer
- [ ] Pane dividers drag smoothly and persist widths after relaunch
- [ ] Refresh button in the summary block triggers a new summary within a few seconds
- [ ] With no CLI on PATH (test by temporarily renaming `claude`), the onboarding screen appears
- [ ] Shutting down the daemon raises the rose "Daemon not reachable" banner

Fix anything that fails, commit as a `fix:` with context.

- [ ] **Step 3: Final commit**

```bash
cd /Users/costaxanthos/conductor/repos/vigil
git add app/src/App.tsx
git commit -m "$(cat <<'EOF'
feat(frontend): disconnected banner for daemon outage

Shows a slim rose banner when the Tauri layer can't reach the SQLite
store; all other UI stays rendered from last-known state.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

# Self-Review Checklist

Run these in your head before declaring the plan done. Fix inline if any trigger.

**Spec coverage:**
- §3 three-pane layout → Tasks 16, 20, 25, 26, 28 ✓
- §3.1 translucent left rail → Task 20 ✓
- §3.2 "What's happening" summary → Tasks 22, 25 ✓
- §3.3 right-rail tabs + changes → Task 26 ✓
- §4.1 `Host` + `HostKind` → Tasks 2, 3 ✓
- §4.2 extended SessionGroup → Tasks 2, 4, 5 ✓
- §4.3 JSONL data source → Tasks 6, 7, 13 ✓
- §5 summary pipeline → Tasks 9, 10, 11, 12, 13, 15, 25 ✓
- §6 host detection → Tasks 3, 5 ✓
- §7 visual tokens + motion → distributed across Tasks 18, 19, 20, 21, 22, 26 ✓
- §8 onboarding → Task 29 ✓
- §9.1 dead code cleanup → Task 1 ✓
- §9.1 window size → Task 1 ✓
- §11 disconnected state → Task 30 ✓

Gaps to address in a later plan (explicit V1.5/V2 deferrals, not missed):
- Cursor SQLite/log integration — V1.5, out of scope.
- Codex real subprocess wiring — V1.5, stubbed error return in Task 12.
- Checks/Review/All Files tabs populated — V2, placeholder in Task 26.
- Keyboard nav — V2.

**Placeholder scan:** no "TBD", "TODO", or "implement later" remain (a few "V2" pointers exist but are documented deferrals, not unfinished steps).

**Type consistency:**
- `HostKind` (TS) ↔ `HostKind` (Rust with `#[serde(rename_all = "snake_case")]`) — the values match (`ghostty`, `iterm2`, etc.) ✓
- `LiveSession`/`LiveSessionRow` — names used in Tauri and TS consistently ✓
- `SessionGroup` additions: same field names everywhere (`hostKind`, `model`, `isLive`, `summaryPlainEnglish`, `summaryGeneratedAt`) ✓
- Tauri command names: `get_hosts`, `get_live_sessions`, `get_summary`, `refresh_summary`, `detect_cli`, `save_api_key`, `has_api_key` — used verbatim in both backend and frontend ✓

---

# Execution Handoff

**Plan complete and saved to `docs/superpowers/plans/2026-04-16-vigil-dashboard-redesign.md`. Two execution options:**

**1. Subagent-Driven (recommended)** — I dispatch a fresh subagent per task, review between tasks, fast iteration.

**2. Inline Execution** — Execute tasks in this session using `executing-plans`, batch execution with checkpoints.

**Which approach?**
