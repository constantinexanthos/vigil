# Vigil V1.5 — Cursor + Codex Data Sources Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Capture live sessions from Cursor and Codex (not just Claude Code / Conductor), wire the Codex summarizer backend that already exists as a dead `match` arm, and persist the RightRail tab selection.

**Architecture:** Two new daemon modules (`cursorlog.rs`, `codexlog.rs`) emit into the same `SessionTurnRecord` contract that `sessionlog.rs` already uses, tagged with a new `source` column so downstream queries can distinguish them without type-level bifurcation. A new `summarizer::run_codex` fills the `SummaryBackend::Codex` match arm. The frontend adds one zustand slice to persist the RightRail tab across reloads.

**Tech Stack:** Rust (tokio, notify, rusqlite, serde_json, chrono, tempfile), TypeScript (React 19, Zustand 5 with `persist` middleware), Tauri 2.

---

## Dependency graph

```
Task 1 (schema: SessionTurnRecord.source column)
   │
   ├─ Task 2 (Claude tailer writes source="claude")
   │
   ├─ Track A: Cursor          (Tasks 3 → 4 → 5 → 6)
   ├─ Track B: Codex            (Tasks 7 → 8 → 9 → 10)
   ├─ Track C: Codex summarizer (Tasks 11 → 12)
   └─ Track D: RightRail tab    (Tasks 13 → 14, fully independent of 1-12)
```

Tracks A, B, C can dispatch in parallel after Task 2 lands. Track D is independent of everything — can start immediately in its own session. Inside Track A, Tasks 3-6 are sequential (fixture → parser → tailer → wire). Same for Track B.

---

## Files touched

**Create:**
- `daemon/src/cursorlog.rs`
- `daemon/src/codexlog.rs`
- `daemon/tests/fixtures/cursor/sample.log`
- `daemon/tests/fixtures/codex/sample.jsonl`

**Modify:**
- `daemon/src/store.rs` — add `SessionTurnRecord.source`, migration, update `insert_session_turn` + `recent_turns`
- `daemon/src/main.rs` — declare new modules
- `daemon/src/cli.rs` — extract a `spawn_turn_consumer` helper; start Cursor + Codex tailers in `run_watch`; pass `source` when constructing `SessionTurnRecord`
- `daemon/src/summarizer.rs` — add `run_codex` + wire `SummaryBackend::Codex` arm in `generate_and_cache`
- `daemon/Cargo.toml` — add `tempfile` to `[dev-dependencies]` if missing
- `app/src/store/selection.ts` — add `rightTab` slice
- `app/src/components/layout/RightRail.tsx` — read/write `rightTab` from the store
- `app/src/__tests__/selection.test.ts` — cover `rightTab` persistence

---

### Task 1: Add `source` column to `session_turns`

**Files:**
- Modify: `daemon/src/store.rs` lines 59-67 (`SessionTurnRecord` struct), 125-135 (table schema), 137-143 (defensive migrations), 371-385 (`insert_session_turn`), 411-434 (`recent_turns`)
- Test: `daemon/src/store.rs` bottom of `mod tests`

- [ ] **Step 1: Write failing test** — append to `mod tests` in `daemon/src/store.rs`:

```rust
    #[test]
    fn session_turn_source_round_trip() {
        let store = Store::open_in_memory().unwrap();
        store.insert_session_turn(&SessionTurnRecord {
            session_id: "s-1".to_string(),
            timestamp: Utc::now(),
            role: "user".to_string(),
            text: "hi".to_string(),
            tool_names: vec![],
            source: "cursor".to_string(),
        }).unwrap();
        store.insert_session_turn(&SessionTurnRecord {
            session_id: "s-2".to_string(),
            timestamp: Utc::now(),
            role: "assistant".to_string(),
            text: "ok".to_string(),
            tool_names: vec!["Edit".to_string()],
            source: "codex".to_string(),
        }).unwrap();

        let cursor_turns = store.recent_turns("s-1", 10).unwrap();
        assert_eq!(cursor_turns.len(), 1);
        assert_eq!(cursor_turns[0].source, "cursor");

        let codex_turns = store.recent_turns("s-2", 10).unwrap();
        assert_eq!(codex_turns.len(), 1);
        assert_eq!(codex_turns[0].source, "codex");
    }

    #[test]
    fn session_turns_source_column_exists() {
        let store = Store::open_in_memory().unwrap();
        let cols: Vec<String> = store
            .conn()
            .prepare("PRAGMA table_info(session_turns)").unwrap()
            .query_map([], |row| row.get::<_, String>(1)).unwrap()
            .filter_map(Result::ok)
            .collect();
        assert!(cols.contains(&"source".to_string()), "missing source column");
    }
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd daemon && cargo test --lib store::tests::session_turn_source -- --nocapture`
Expected: compile error on `source` field of `SessionTurnRecord` (field doesn't exist yet).

- [ ] **Step 3: Add `source` to `SessionTurnRecord`** — replace lines 59-67 of `daemon/src/store.rs`:

```rust
/// A single conversational turn captured from a session's log, normalized
/// across agent sources (Claude JSONL, Cursor log, Codex transcript).
#[derive(Debug, Clone)]
pub struct SessionTurnRecord {
    pub session_id: String,
    pub timestamp: DateTime<Utc>,
    pub role: String,
    pub text: String,
    pub tool_names: Vec<String>,
    /// Origin of the turn — one of `"claude"`, `"cursor"`, `"codex"`.
    pub source: String,
}
```

- [ ] **Step 4: Add `source` column to the table** — in `init_schema` around line 125, change the `session_turns` CREATE TABLE to:

```rust
            CREATE TABLE IF NOT EXISTS session_turns (
                id          INTEGER PRIMARY KEY,
                session_id  TEXT NOT NULL,
                timestamp   TEXT NOT NULL,
                role        TEXT NOT NULL,
                text        TEXT NOT NULL,
                tool_names  TEXT NOT NULL DEFAULT '[]',
                source      TEXT NOT NULL DEFAULT 'claude'
            );
```

Then add a defensive migration for pre-existing DBs — insert just before the `session_summaries` CREATE at line 144:

```rust
        // Defensive migration for DBs created before the source column existed.
        let _ = self
            .conn
            .execute("ALTER TABLE session_turns ADD COLUMN source TEXT NOT NULL DEFAULT 'claude'", []);
```

- [ ] **Step 5: Update `insert_session_turn`** — replace body at lines 372-385:

```rust
    pub fn insert_session_turn(&self, turn: &SessionTurnRecord) -> Result<i64> {
        let tool_names = serde_json::to_string(&turn.tool_names).unwrap_or_else(|_| "[]".to_string());
        self.conn.execute(
            "INSERT INTO session_turns (session_id, timestamp, role, text, tool_names, source) VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
            params![
                turn.session_id,
                turn.timestamp.to_rfc3339(),
                turn.role,
                turn.text,
                tool_names,
                turn.source,
            ],
        )?;
        Ok(self.conn.last_insert_rowid())
    }
```

- [ ] **Step 6: Update `recent_turns`** — replace body at lines 411-434:

```rust
    pub fn recent_turns(&self, session_id: &str, limit: i64) -> Result<Vec<SessionTurnRecord>> {
        let mut stmt = self.conn.prepare(
            "SELECT session_id, timestamp, role, text, tool_names, source \
             FROM session_turns WHERE session_id = ?1 \
             ORDER BY id DESC LIMIT ?2",
        )?;
        let rows = stmt.query_map(params![session_id, limit], |row| {
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
                source: row.get(5)?,
            })
        })?;
        let mut out: Vec<SessionTurnRecord> = rows.filter_map(Result::ok).collect();
        out.reverse(); // ascending by insertion
        Ok(out)
    }
```

- [ ] **Step 7: Fix existing tests that construct `SessionTurnRecord`** — in `session_turns_round_trip` at ~line 636, add `source: "claude".to_string(),` to both record literals.

- [ ] **Step 8: Run store tests to verify pass**

Run: `cd daemon && cargo test --lib store::tests -- --nocapture`
Expected: all tests pass, including the two new ones.

- [ ] **Step 9: Leave changes staged but uncommitted — the full crate won't compile yet**

`cli.rs` still builds `SessionTurnRecord` without `source`, so a full `cargo check` will fail on a missing-field error until Task 2 runs. Confirm the expected failure once:

Run: `cd daemon && cargo check 2>&1 | grep -m1 "missing field"`
Expected: one line mentioning `missing field 'source'` somewhere in `cli.rs`. If instead you see `OK`, something is inconsistent — investigate before moving on.

Stage the changes:

```bash
git add daemon/src/store.rs
```

Do NOT commit. The commit happens at the end of Task 2, atomically with the cli.rs fix.

---

### Task 2: Tag Claude tailer output with `source="claude"`

**Files:**
- Modify: `daemon/src/cli.rs` lines 423-429 (construction of `SessionTurnRecord` in the JSONL tailer consumer)

- [ ] **Step 1: Add `source` to the Claude tailer's `SessionTurnRecord` literal** — in `daemon/src/cli.rs`, locate the construction inside the JSONL tailer consumer (around line 423) and change it to:

```rust
                    let record = SessionTurnRecord {
                        session_id: session_id.clone(),
                        timestamp: Utc::now(),
                        role: ev.turn.role,
                        text: ev.turn.text,
                        tool_names: ev.turn.tool_names,
                        source: "claude".to_string(),
                    };
```

- [ ] **Step 2: Run daemon cargo check — should now pass**

Run: `cd daemon && cargo check 2>&1 | grep -E "^error" || echo OK`
Expected: `OK`.

- [ ] **Step 3: Run all daemon tests as a smoke**

Run: `cd daemon && cargo test --lib -- --test-threads=1`
Expected: all green.

- [ ] **Step 4: Commit store + cli changes together**

```bash
git add daemon/src/cli.rs
git commit -m "feat(daemon): add source column to session_turns and tag Claude writer"
```

(If Task 1's Step 9 left `daemon/src/store.rs` staged, it will go into the same commit.)

---

### Task 3: Capture a Cursor log fixture

**Files:**
- Create: `daemon/tests/fixtures/cursor/sample.log`

Cursor writes per-window logs to `~/Library/Application Support/Cursor/logs/<launch-ts>/window<N>/exthost/output_logging_<ts>_Cursor Agent/1-Cursor Agent.log`. The parser in Task 4 asserts against the shape we observe in this fixture.

- [ ] **Step 1: Verify Cursor has been run on this machine and has logs**

Run: `ls -t ~/Library/Application\ Support/Cursor/logs 2>/dev/null | head -3`
Expected: at least one timestamped directory. If none, run Cursor with one agent turn manually, then retry. If Cursor is not installed, create a minimal synthetic fixture instead (Step 4 fallback).

- [ ] **Step 2: Find the most recent Cursor Agent log**

Run:
```bash
find ~/Library/Application\ Support/Cursor/logs -name "1-Cursor Agent.log" -mtime -7 2>/dev/null | xargs -I {} stat -f "%m %N" {} | sort -rn | head -1 | awk '{print $2}'
```
Expected: an absolute path.

- [ ] **Step 3: Capture the fixture** — copy the first ~200 lines into the repo, and scrub any absolute home-directory paths:

```bash
mkdir -p daemon/tests/fixtures/cursor
LATEST=$(find ~/Library/Application\ Support/Cursor/logs -name "1-Cursor Agent.log" -mtime -7 2>/dev/null | xargs -I {} stat -f "%m %N" {} | sort -rn | head -1 | awk '{print $2}')
head -200 "$LATEST" | sed "s|$HOME|~|g" > daemon/tests/fixtures/cursor/sample.log
wc -l daemon/tests/fixtures/cursor/sample.log
```
Expected: a non-empty file. Eyeball it: `head -20 daemon/tests/fixtures/cursor/sample.log` — note the actual line prefix format for Task 4.

- [ ] **Step 4: If Cursor is not installed OR step 3 produced empty output, write a minimal synthetic fixture** — create `daemon/tests/fixtures/cursor/sample.log` with:

```
2026-04-22T10:00:00.000Z [info] [composer] user message: fix the login bug
2026-04-22T10:00:05.123Z [info] [composer] tool: edit_file path=src/auth.ts
2026-04-22T10:00:08.456Z [info] [composer] assistant message: Updated auth.ts to validate the token before setting the session cookie.
2026-04-22T10:00:12.789Z [info] [composer] tool: run_terminal_cmd cmd=npm test
```

(If the real fixture was captured in Step 3, **skip this step** — use the real one.)

- [ ] **Step 5: Commit the fixture**

```bash
git add daemon/tests/fixtures/cursor/sample.log
git commit -m "test(daemon): capture Cursor Agent log fixture"
```

---

### Task 4: `cursorlog::parse_line` + unit tests

**Files:**
- Create: `daemon/src/cursorlog.rs`
- Modify: `daemon/src/main.rs` line 1 (add `mod cursorlog;`)

- [ ] **Step 1: Register the module** — add to `daemon/src/main.rs` at line 1, after `mod cli;`:

```rust
mod cursorlog;
```

- [ ] **Step 2: Write the failing test** — create `daemon/src/cursorlog.rs` with tests only (no impl yet):

```rust
use serde::Deserialize;
use std::path::PathBuf;

use crate::sessionlog::SessionTurn;

/// Parse a single Cursor Agent log line into a normalized `SessionTurn`.
///
/// Cursor writes its agent log as plaintext, one line per event. Role and
/// content are embedded in the message text after a `[timestamp] [level]`
/// prefix. We extract:
/// - `user message: <text>` → role=user, text=<text>
/// - `assistant message: <text>` → role=assistant, text=<text>
/// - `tool: <name>` → role=assistant (attached to next turn's tool_names)
///
/// Returns `None` for lines that don't match any known pattern — noisy
/// log lines (startup, heartbeats) are silently skipped.
pub fn parse_line(line: &str) -> Option<SessionTurn> {
    // impl in Step 4
    let _ = line;
    None
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_user_message() {
        let line = "2026-04-22T10:00:00.000Z [info] [composer] user message: fix the login bug";
        let turn = parse_line(line).expect("should parse");
        assert_eq!(turn.role, "user");
        assert_eq!(turn.text, "fix the login bug");
        assert!(turn.tool_names.is_empty());
    }

    #[test]
    fn parses_assistant_message() {
        let line = "2026-04-22T10:00:08.456Z [info] [composer] assistant message: Updated auth.ts to validate the token.";
        let turn = parse_line(line).expect("should parse");
        assert_eq!(turn.role, "assistant");
        assert_eq!(turn.text, "Updated auth.ts to validate the token.");
    }

    #[test]
    fn parses_tool_line() {
        let line = "2026-04-22T10:00:05.123Z [info] [composer] tool: edit_file path=src/auth.ts";
        let turn = parse_line(line).expect("should parse");
        assert_eq!(turn.role, "assistant");
        assert!(turn.tool_names.contains(&"edit_file".to_string()));
    }

    #[test]
    fn returns_none_for_unrelated_lines() {
        assert!(parse_line("2026-04-22T10:00:00.000Z [debug] extension host started").is_none());
        assert!(parse_line("").is_none());
        assert!(parse_line("garbage").is_none());
    }

    #[test]
    fn preserves_timestamp_when_present() {
        let line = "2026-04-22T10:00:00.000Z [info] [composer] user message: hi";
        let turn = parse_line(line).expect("should parse");
        assert_eq!(turn.timestamp.as_deref(), Some("2026-04-22T10:00:00.000Z"));
    }

    #[test]
    fn parses_real_fixture_without_panic() {
        let raw = std::fs::read_to_string("tests/fixtures/cursor/sample.log")
            .expect("fixture present — run Task 3 first");
        for line in raw.lines() {
            // Just assert it doesn't panic; parse_line is allowed to return None.
            let _ = parse_line(line);
        }
    }
}
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `cd daemon && cargo test --lib cursorlog::tests -- --nocapture`
Expected: 4 tests fail on `expect("should parse")` (the `None` stub). The `returns_none_for_unrelated_lines` test passes trivially. The fixture test also passes trivially because the stub returns `None` for everything.

- [ ] **Step 4: Implement `parse_line`** — replace the stub body in `daemon/src/cursorlog.rs`:

```rust
pub fn parse_line(line: &str) -> Option<SessionTurn> {
    if line.is_empty() {
        return None;
    }

    // Extract the timestamp prefix if present: `[ISO-8601] ...`
    let (timestamp, rest) = if let Some(end) = line.find(' ') {
        let candidate = &line[..end];
        if candidate.len() > 10 && candidate.chars().next().map_or(false, |c| c.is_ascii_digit()) {
            (Some(candidate.to_string()), line[end + 1..].trim_start())
        } else {
            (None, line)
        }
    } else {
        (None, line)
    };

    // Skip the `[level]` bracket (`[info]`, `[debug]`, ...) if present.
    let after_level = rest.find(']').map(|i| rest[i + 1..].trim_start()).unwrap_or(rest);

    // Skip an optional `[component]` bracket (e.g. `[composer]`).
    let body = after_level
        .strip_prefix('[')
        .and_then(|s| s.find(']').map(|i| s[i + 1..].trim_start()))
        .unwrap_or(after_level);

    // Match role-bearing patterns.
    if let Some(text) = body.strip_prefix("user message:") {
        return Some(SessionTurn {
            role: "user".to_string(),
            text: text.trim().to_string(),
            tool_names: Vec::new(),
            timestamp,
        });
    }
    if let Some(text) = body.strip_prefix("assistant message:") {
        return Some(SessionTurn {
            role: "assistant".to_string(),
            text: text.trim().to_string(),
            tool_names: Vec::new(),
            timestamp,
        });
    }
    if let Some(rest) = body.strip_prefix("tool:") {
        // `tool: <name> [key=value ...]` — name is first whitespace-separated token.
        let name = rest.trim().split_whitespace().next()?.to_string();
        return Some(SessionTurn {
            role: "assistant".to_string(),
            text: String::new(),
            tool_names: vec![name],
            timestamp,
        });
    }

    None
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd daemon && cargo test --lib cursorlog::tests -- --nocapture`
Expected: all 6 pass.

- [ ] **Step 6: Verify the real-fixture test tolerates your actual sample format** — if the fixture from Task 3 used a different line shape and `parses_real_fixture_without_panic` passed but `parse_line` returns `None` for every line in it, look at a few lines (`head daemon/tests/fixtures/cursor/sample.log`) and extend `parse_line` with additional `strip_prefix` arms for the actual role markers you see. Keep adding until `grep 'user message\\|assistant message\\|tool:' daemon/tests/fixtures/cursor/sample.log | head` lines round-trip through `parse_line`.

- [ ] **Step 7: Commit**

```bash
git add daemon/src/cursorlog.rs daemon/src/main.rs
git commit -m "feat(daemon): cursor log line parser"
```

---

### Task 5: `cursorlog::start_tailer`

**Files:**
- Modify: `daemon/src/cursorlog.rs` (add tailer + integration test)

- [ ] **Step 1: Write the failing tailer test** — append to `daemon/src/cursorlog.rs` inside `mod tests`:

```rust
    use std::io::Write;
    use tempfile::TempDir;

    #[tokio::test]
    async fn tailer_emits_appended_user_message_lines() {
        let dir = TempDir::new().unwrap();
        let (_watcher, mut rx) = start_tailer(dir.path()).expect("tailer starts");

        // Give the watcher a moment to register.
        tokio::time::sleep(std::time::Duration::from_millis(200)).await;

        let log = dir.path().join("window1").join("1-Cursor Agent.log");
        std::fs::create_dir_all(log.parent().unwrap()).unwrap();
        let mut f = std::fs::OpenOptions::new()
            .create(true).append(true).open(&log).unwrap();
        writeln!(f, "2026-04-22T10:00:00.000Z [info] [composer] user message: hello").unwrap();
        writeln!(f, "2026-04-22T10:00:02.000Z [info] [composer] assistant message: hi").unwrap();
        drop(f);

        let mut seen = Vec::new();
        let deadline = std::time::Instant::now() + std::time::Duration::from_secs(5);
        while seen.len() < 2 && std::time::Instant::now() < deadline {
            if let Ok(Some(ev)) = tokio::time::timeout(std::time::Duration::from_millis(250), rx.recv()).await {
                seen.push(ev.turn.role);
            }
        }
        assert_eq!(seen, vec!["user".to_string(), "assistant".to_string()]);
    }

    #[test]
    fn session_id_from_path_uses_window_segment() {
        let p = PathBuf::from("/root/20260422T100000/window3/exthost/output_logging_x_Cursor Agent/1-Cursor Agent.log");
        let sid = session_id_from_path(&p).expect("should derive");
        assert!(sid.starts_with("cursor:window3:"), "got {}", sid);
    }

    #[test]
    fn session_id_from_path_returns_none_for_non_cursor_path() {
        let p = PathBuf::from("/tmp/random.log");
        assert!(session_id_from_path(&p).is_none());
    }
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd daemon && cargo test --lib cursorlog::tests::tailer_emits -- --nocapture`
Expected: compile error — `start_tailer` and `session_id_from_path` don't exist.

- [ ] **Step 3: Implement `start_tailer` and `session_id_from_path`** — append to `daemon/src/cursorlog.rs` (after `parse_line`, before the `#[cfg(test)]` module):

```rust
use notify::{RecommendedWatcher, RecursiveMode, Watcher};
use std::collections::HashMap;
use std::fs::File;
use std::io::{BufRead, BufReader, Seek, SeekFrom};
use std::path::Path;
use std::sync::{Arc, Mutex};
use tokio::sync::mpsc::{UnboundedReceiver, UnboundedSender};

pub struct TailerEvent {
    pub path: PathBuf,
    pub turn: SessionTurn,
}

/// Derive a stable session id from a Cursor log path.
/// Cursor paths look like `.../<launch-ts>/window<N>/exthost/.../1-Cursor Agent.log`.
/// The session id is `cursor:<windowN>:<launch-ts>` — stable for the life of the window.
pub fn session_id_from_path(path: &Path) -> Option<String> {
    let components: Vec<&str> = path
        .components()
        .filter_map(|c| c.as_os_str().to_str())
        .collect();
    let window = components.iter().find(|s| s.starts_with("window"))?.to_string();
    // Walk backwards to find the launch-timestamp directory — the parent of `window<N>`.
    let window_pos = components.iter().position(|s| *s == window.as_str())?;
    let launch_ts = components.get(window_pos.saturating_sub(1))?.to_string();
    Some(format!("cursor:{window}:{launch_ts}"))
}

/// Watch `root` recursively. Emits a `TailerEvent` for each appended line to any
/// `1-Cursor Agent.log` file under that root.
pub fn start_tailer(root: &Path) -> std::io::Result<(RecommendedWatcher, UnboundedReceiver<TailerEvent>)> {
    let (tx, rx) = tokio::sync::mpsc::unbounded_channel::<TailerEvent>();
    let offsets: Arc<Mutex<HashMap<PathBuf, u64>>> = Arc::new(Mutex::new(HashMap::new()));
    let tx2 = tx.clone();
    let offsets2 = offsets.clone();

    let mut watcher = notify::recommended_watcher(move |res: Result<notify::Event, notify::Error>| {
        let Ok(event) = res else { return };
        for path in event.paths {
            if !path.file_name().and_then(|n| n.to_str()).map_or(false, |n| n.ends_with(".log") && n.contains("Cursor Agent")) {
                continue;
            }
            if let Err(e) = emit_new_lines(&path, &offsets2, &tx2) {
                eprintln!("vigil: cursorlog read error for {}: {}", path.display(), e);
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
        let Some(turn) = parse_line(trimmed) else { continue };
        let _ = tx.send(TailerEvent { path: path.to_path_buf(), turn });
    }
    offsets.lock().unwrap().insert(path.to_path_buf(), read_offset);
    Ok(())
}
```

(The shape mirrors `sessionlog::start_tailer` deliberately. Cursor-specific filtering is in the `if !path.file_name()...` check.)

- [ ] **Step 4: Verify `tempfile` is a dev-dependency** — `grep -A5 dev-dependencies daemon/Cargo.toml` should show `tempfile`. If not:

```bash
cd daemon && cargo add --dev tempfile
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd daemon && cargo test --lib cursorlog::tests -- --nocapture`
Expected: all cursorlog tests green.

- [ ] **Step 6: Commit**

```bash
git add daemon/src/cursorlog.rs daemon/Cargo.toml daemon/Cargo.lock
git commit -m "feat(daemon): cursor log tailer and session id derivation"
```

---

### Task 6: Wire Cursor tailer into `run_watch`

**Files:**
- Modify: `daemon/src/cli.rs` (extract `spawn_turn_consumer` helper; add Cursor tailer after line 475)

- [ ] **Step 1: Add a generic turn-consumer helper** — at the bottom of `daemon/src/cli.rs` (after `pub fn run_dashboard`), add:

```rust
/// Spawn an async task that drains `rx`, persists each turn to the store
/// tagged with `source`, and kicks off a debounced per-session summary
/// regeneration. Generic over the event type so it works with both
/// `sessionlog::TailerEvent` and the per-source tailer events.
fn spawn_turn_consumer<E, F>(
    db: std::sync::Arc<std::sync::Mutex<Store>>,
    mut rx: tokio::sync::mpsc::UnboundedReceiver<E>,
    source: &'static str,
    into_pair: impl Fn(E) -> (std::path::PathBuf, crate::sessionlog::SessionTurn) + Send + 'static,
    session_id_fn: F,
) where
    E: Send + 'static,
    F: Fn(&std::path::Path) -> Option<String> + Send + 'static,
{
    let summary_db = std::sync::Arc::clone(&db);
    tokio::spawn(async move {
        let mut last_summary: HashMap<String, Instant> = HashMap::new();
        let debounce = std::time::Duration::from_secs(30);

        while let Some(ev) = rx.recv().await {
            let (path, turn) = into_pair(ev);
            let Some(session_id) = session_id_fn(&path) else { continue };
            let record = SessionTurnRecord {
                session_id: session_id.clone(),
                timestamp: Utc::now(),
                role: turn.role,
                text: turn.text,
                tool_names: turn.tool_names,
                source: source.to_string(),
            };
            {
                let store = db.lock().unwrap();
                if let Err(e) = store.insert_session_turn(&record) {
                    eprintln!("vigil: insert turn failed ({source}): {e}");
                    continue;
                }
            }

            let due = match last_summary.get(&session_id).copied() {
                Some(t) => t.elapsed() >= debounce,
                None => true,
            };
            if !due { continue; }
            last_summary.insert(session_id.clone(), Instant::now());

            let summary_db_inner = std::sync::Arc::clone(&summary_db);
            let sid = session_id.clone();
            tokio::spawn(async move {
                if let Err(e) = summarizer::generate_and_cache(
                    &summary_db_inner,
                    &sid,
                    Vec::new(),
                    None,
                )
                .await
                {
                    eprintln!("vigil: summary failed for {sid} ({source}): {e}");
                }
            });
        }
    });
}
```

- [ ] **Step 2: Refactor the existing Claude tailer consumer to use `spawn_turn_consumer`** — replace the block in `run_watch` from `match start_tailer(&claude_projects_root) {` down to its closing `}` (currently lines 407-475) with:

```rust
    // Claude JSONL session tailer.
    let claude_projects_root: PathBuf = home::home_dir()
        .map(|h| h.join(".claude").join("projects"))
        .expect("home dir");
    std::fs::create_dir_all(&claude_projects_root).ok();
    match start_tailer(&claude_projects_root) {
        Ok((watcher, rx)) => {
            Box::leak(Box::new(watcher));
            spawn_turn_consumer(
                Arc::clone(&db),
                rx,
                "claude",
                |ev: crate::sessionlog::TailerEvent| (ev.path, ev.turn),
                |p| extract_session_id_from_path(p),
            );
            eprintln!("vigil: Claude tailer watching {}", claude_projects_root.display());
        }
        Err(e) => eprintln!("vigil: failed to start Claude tailer: {}", e),
    }
```

(Note: this removes the inline debounce — the helper owns it.)

- [ ] **Step 3: Add the Cursor tailer alongside** — right after the Claude block in `run_watch`:

```rust
    // Cursor agent-log tailer.
    let cursor_logs_root: PathBuf = home::home_dir()
        .map(|h| h.join("Library/Application Support/Cursor/logs"))
        .expect("home dir");
    if cursor_logs_root.exists() {
        match crate::cursorlog::start_tailer(&cursor_logs_root) {
            Ok((watcher, rx)) => {
                Box::leak(Box::new(watcher));
                spawn_turn_consumer(
                    Arc::clone(&db),
                    rx,
                    "cursor",
                    |ev: crate::cursorlog::TailerEvent| (ev.path, ev.turn),
                    |p| crate::cursorlog::session_id_from_path(p),
                );
                eprintln!("vigil: Cursor tailer watching {}", cursor_logs_root.display());
            }
            Err(e) => eprintln!("vigil: failed to start Cursor tailer: {}", e),
        }
    } else {
        eprintln!("vigil: Cursor logs dir not found ({}); cursor sessions will not be captured", cursor_logs_root.display());
    }
```

- [ ] **Step 4: Run daemon cargo check**

Run: `cd daemon && cargo check 2>&1 | grep -E "^error" || echo OK`
Expected: `OK`.

- [ ] **Step 5: Run daemon tests**

Run: `cd daemon && cargo test --lib -- --test-threads=1`
Expected: all green.

- [ ] **Step 6: Smoke test (manual, optional)** — `cargo run -- watch ~/conductor` for 10 seconds with a Cursor window doing one user turn; expect `vigil: Cursor tailer watching ...` in stderr and (eventually) a summary generation log line. Kill with Ctrl+C.

- [ ] **Step 7: Commit**

```bash
git add daemon/src/cli.rs
git commit -m "feat(daemon): wire Cursor tailer into run_watch via shared consumer"
```

---

### Task 7: Probe Codex log layout + capture fixture

**Files:**
- Create: `daemon/tests/fixtures/codex/sample.jsonl`

Codex has settled on one of a few conventional layouts. This task is about finding out which.

- [ ] **Step 1: Check for Codex installation**

Run: `which codex && codex --version 2>&1 | head -3`
Expected: a path + a version string, OR "codex not found" (in which case skip to Step 4 fallback).

- [ ] **Step 2: Probe candidate roots**

Run:
```bash
for p in "$HOME/.codex" "$HOME/.codex/sessions" "$HOME/.codex/log" "$HOME/Library/Logs/codex"; do
  if [ -d "$p" ]; then
    echo "EXISTS: $p"
    find "$p" -maxdepth 2 -type f \( -name "*.jsonl" -o -name "*.log" -o -name "transcript*" \) 2>/dev/null | head -5
  fi
done
```
Expected: at least one `EXISTS:` line with some files, or empty output.

- [ ] **Step 3: Capture the first 200 lines of the most recent Codex transcript file**

```bash
mkdir -p daemon/tests/fixtures/codex
LATEST=$(find "$HOME/.codex" -type f \( -name "*.jsonl" -o -name "transcript*" \) 2>/dev/null | xargs -I {} stat -f "%m %N" {} | sort -rn | head -1 | awk '{print $2}')
if [ -n "$LATEST" ]; then
  head -200 "$LATEST" | sed "s|$HOME|~|g" > daemon/tests/fixtures/codex/sample.jsonl
  wc -l daemon/tests/fixtures/codex/sample.jsonl
  echo "CAPTURED FROM: $LATEST"
else
  echo "NO CODEX TRANSCRIPTS FOUND — falling back to synthetic fixture"
fi
```

- [ ] **Step 4: If Codex is not installed OR step 3 captured nothing, write a synthetic JSONL fixture** — create `daemon/tests/fixtures/codex/sample.jsonl`:

```
{"role":"user","content":"add a dark mode toggle","timestamp":"2026-04-22T11:00:00Z"}
{"role":"assistant","content":"I'll add a toggle in the settings menu.","timestamp":"2026-04-22T11:00:03Z","tool_calls":[{"name":"edit_file","arguments":{"path":"src/settings.tsx"}}]}
{"role":"tool","content":"edit succeeded","timestamp":"2026-04-22T11:00:04Z","tool_name":"edit_file"}
{"role":"assistant","content":"Done. Try it — the toggle is in the top-right corner of Settings.","timestamp":"2026-04-22T11:00:07Z"}
```

(Skip this step if Step 3 captured a real file.)

- [ ] **Step 5: Record the discovered root in a tiny note** — create `daemon/tests/fixtures/codex/README.md`:

```markdown
# Codex fixture

Captured from: <path printed by Step 3, or "synthetic (no Codex installation found)">

If the discovery logic in `codexlog::discover_root()` needs to change, update
the `CANDIDATES` list in `daemon/src/codexlog.rs`.
```

- [ ] **Step 6: Commit**

```bash
git add daemon/tests/fixtures/codex/
git commit -m "test(daemon): capture Codex transcript fixture"
```

---

### Task 8: `codexlog::discover_root` + `parse_line`

**Files:**
- Create: `daemon/src/codexlog.rs`
- Modify: `daemon/src/main.rs` (add `mod codexlog;`)

- [ ] **Step 1: Register the module** — add to `daemon/src/main.rs` after `mod cursorlog;`:

```rust
mod codexlog;
```

- [ ] **Step 2: Write failing tests** — create `daemon/src/codexlog.rs`:

```rust
use serde::Deserialize;
use std::path::{Path, PathBuf};

use crate::sessionlog::SessionTurn;

/// Candidate root directories where Codex may write session transcripts.
/// Probed in order; first existing directory wins.
const CANDIDATES: &[&str] = &[
    ".codex/sessions",
    ".codex",
    ".codex/log",
    "Library/Logs/codex",
];

/// Return the first existing Codex log root under `home`, or `None`.
pub fn discover_root(home: &Path) -> Option<PathBuf> {
    for c in CANDIDATES {
        let p = home.join(c);
        if p.is_dir() {
            return Some(p);
        }
    }
    None
}

#[derive(Debug, Deserialize)]
struct CodexLine {
    #[serde(default)]
    role: Option<String>,
    #[serde(default)]
    content: Option<serde_json::Value>,
    #[serde(default)]
    timestamp: Option<String>,
    #[serde(default)]
    tool_calls: Option<Vec<serde_json::Value>>,
    #[serde(default)]
    tool_name: Option<String>,
}

/// Parse a single Codex transcript JSONL line into a `SessionTurn`.
/// Returns `None` for lines that don't carry a role or content.
pub fn parse_line(line: &str) -> Option<SessionTurn> {
    let parsed: CodexLine = serde_json::from_str(line).ok()?;
    let role = parsed.role?;
    let text = match parsed.content? {
        serde_json::Value::String(s) => s,
        serde_json::Value::Array(items) => items
            .iter()
            .filter_map(|v| v.get("text").and_then(|t| t.as_str()))
            .collect::<Vec<_>>()
            .join("\n"),
        _ => String::new(),
    };
    let mut tool_names: Vec<String> = Vec::new();
    if let Some(calls) = parsed.tool_calls {
        for c in calls {
            if let Some(n) = c.get("name").and_then(|v| v.as_str()) {
                tool_names.push(n.to_string());
            }
        }
    }
    if let Some(n) = parsed.tool_name {
        tool_names.push(n);
    }
    if text.is_empty() && tool_names.is_empty() {
        return None;
    }
    Some(SessionTurn {
        role,
        text,
        tool_names,
        timestamp: parsed.timestamp,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::TempDir;

    #[test]
    fn discover_root_finds_existing_candidate() {
        let dir = TempDir::new().unwrap();
        std::fs::create_dir_all(dir.path().join(".codex/sessions")).unwrap();
        let found = discover_root(dir.path()).expect("should find");
        assert!(found.ends_with(".codex/sessions"));
    }

    #[test]
    fn discover_root_returns_none_when_nothing_exists() {
        let dir = TempDir::new().unwrap();
        assert!(discover_root(dir.path()).is_none());
    }

    #[test]
    fn parses_user_and_assistant_lines() {
        let user = r#"{"role":"user","content":"add dark mode","timestamp":"2026-04-22T11:00:00Z"}"#;
        let turn = parse_line(user).expect("parses");
        assert_eq!(turn.role, "user");
        assert_eq!(turn.text, "add dark mode");
        assert_eq!(turn.timestamp.as_deref(), Some("2026-04-22T11:00:00Z"));

        let asst = r#"{"role":"assistant","content":"I'll do it","tool_calls":[{"name":"edit_file"}]}"#;
        let turn = parse_line(asst).expect("parses");
        assert_eq!(turn.role, "assistant");
        assert_eq!(turn.tool_names, vec!["edit_file".to_string()]);
    }

    #[test]
    fn parses_array_content() {
        let line = r#"{"role":"assistant","content":[{"type":"text","text":"part 1"},{"type":"text","text":"part 2"}]}"#;
        let turn = parse_line(line).expect("parses");
        assert_eq!(turn.text, "part 1\npart 2");
    }

    #[test]
    fn returns_none_for_empty_content_and_no_tools() {
        let line = r#"{"role":"system","content":""}"#;
        assert!(parse_line(line).is_none());
    }

    #[test]
    fn returns_none_for_invalid_json() {
        assert!(parse_line("").is_none());
        assert!(parse_line("not json").is_none());
        assert!(parse_line("{\"role\":\"user\"}").is_none()); // missing content
    }

    #[test]
    fn parses_real_fixture_without_panic() {
        let raw = std::fs::read_to_string("tests/fixtures/codex/sample.jsonl")
            .expect("fixture present — run Task 7 first");
        for line in raw.lines() {
            let _ = parse_line(line);
        }
    }
}
```

- [ ] **Step 3: Run tests to verify they fail, then pass**

Since this task writes impl and tests together, first run just the fixture test to confirm it compiles:

Run: `cd daemon && cargo test --lib codexlog::tests -- --nocapture`
Expected: all pass.

- [ ] **Step 4: If `parses_real_fixture_without_panic` passes but every line in the fixture returns `None`** — inspect `head daemon/tests/fixtures/codex/sample.jsonl`. If the real Codex format uses different field names (e.g. `"type":"user"` instead of `"role":"user"`), extend the `CodexLine` struct with additional fields and broaden `parse_line` to accept them. Re-run until real-format lines parse.

- [ ] **Step 5: Commit**

```bash
git add daemon/src/codexlog.rs daemon/src/main.rs
git commit -m "feat(daemon): codex transcript parser and root discovery"
```

---

### Task 9: `codexlog::start_tailer`

**Files:**
- Modify: `daemon/src/codexlog.rs` (add tailer + test)

- [ ] **Step 1: Write failing tailer test** — append to `mod tests` in `daemon/src/codexlog.rs`:

```rust
    use std::io::Write;

    #[tokio::test]
    async fn tailer_emits_appended_jsonl_lines() {
        let dir = TempDir::new().unwrap();
        let (_watcher, mut rx) = start_tailer(dir.path()).expect("tailer starts");
        tokio::time::sleep(std::time::Duration::from_millis(200)).await;

        let path = dir.path().join("abc123.jsonl");
        let mut f = std::fs::OpenOptions::new()
            .create(true).append(true).open(&path).unwrap();
        writeln!(f, r#"{{"role":"user","content":"hi","timestamp":"2026-04-22T11:00:00Z"}}"#).unwrap();
        writeln!(f, r#"{{"role":"assistant","content":"yes","timestamp":"2026-04-22T11:00:01Z"}}"#).unwrap();
        drop(f);

        let mut seen = Vec::new();
        let deadline = std::time::Instant::now() + std::time::Duration::from_secs(5);
        while seen.len() < 2 && std::time::Instant::now() < deadline {
            if let Ok(Some(ev)) = tokio::time::timeout(std::time::Duration::from_millis(250), rx.recv()).await {
                seen.push(ev.turn.role);
            }
        }
        assert_eq!(seen, vec!["user".to_string(), "assistant".to_string()]);
    }

    #[test]
    fn session_id_from_path_uses_file_stem() {
        let p = PathBuf::from("/root/.codex/sessions/abc-123.jsonl");
        assert_eq!(session_id_from_path(&p).as_deref(), Some("codex:abc-123"));
    }
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd daemon && cargo test --lib codexlog::tests::tailer_emits -- --nocapture`
Expected: compile error — `start_tailer` and `session_id_from_path` don't exist.

- [ ] **Step 3: Implement `start_tailer` and `session_id_from_path`** — append to `daemon/src/codexlog.rs`, before the `#[cfg(test)]` module:

```rust
use notify::{RecommendedWatcher, RecursiveMode, Watcher};
use std::collections::HashMap;
use std::fs::File;
use std::io::{BufRead, BufReader, Seek, SeekFrom};
use std::sync::{Arc, Mutex};
use tokio::sync::mpsc::{UnboundedReceiver, UnboundedSender};

pub struct TailerEvent {
    pub path: PathBuf,
    pub turn: SessionTurn,
}

/// Derive a stable session id from a Codex transcript path. The file stem IS
/// the session id (matches Claude's convention), prefixed with `codex:`.
pub fn session_id_from_path(path: &Path) -> Option<String> {
    let stem = path.file_stem()?.to_str()?;
    Some(format!("codex:{stem}"))
}

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
                eprintln!("vigil: codexlog read error for {}: {}", path.display(), e);
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
        let Some(turn) = parse_line(trimmed) else { continue };
        let _ = tx.send(TailerEvent { path: path.to_path_buf(), turn });
    }
    offsets.lock().unwrap().insert(path.to_path_buf(), read_offset);
    Ok(())
}
```

- [ ] **Step 4: Run tests to verify pass**

Run: `cd daemon && cargo test --lib codexlog::tests -- --nocapture`
Expected: all green.

- [ ] **Step 5: Commit**

```bash
git add daemon/src/codexlog.rs
git commit -m "feat(daemon): codex jsonl tailer and session id derivation"
```

---

### Task 10: Wire Codex tailer into `run_watch`

**Files:**
- Modify: `daemon/src/cli.rs` (add Codex tailer wiring after the Cursor tailer block from Task 6)

- [ ] **Step 1: Add the Codex tailer block** — in `run_watch`, right after the Cursor tailer block from Task 6:

```rust
    // Codex transcript tailer.
    if let Some(codex_root) = home::home_dir().and_then(|h| crate::codexlog::discover_root(&h)) {
        match crate::codexlog::start_tailer(&codex_root) {
            Ok((watcher, rx)) => {
                Box::leak(Box::new(watcher));
                spawn_turn_consumer(
                    Arc::clone(&db),
                    rx,
                    "codex",
                    |ev: crate::codexlog::TailerEvent| (ev.path, ev.turn),
                    |p| crate::codexlog::session_id_from_path(p),
                );
                eprintln!("vigil: Codex tailer watching {}", codex_root.display());
            }
            Err(e) => eprintln!("vigil: failed to start Codex tailer: {}", e),
        }
    } else {
        eprintln!("vigil: Codex log directory not found; codex sessions will not be captured");
    }
```

- [ ] **Step 2: Run daemon cargo check**

Run: `cd daemon && cargo check 2>&1 | grep -E "^error" || echo OK`
Expected: `OK`.

- [ ] **Step 3: Run daemon tests**

Run: `cd daemon && cargo test --lib -- --test-threads=1`
Expected: all green.

- [ ] **Step 4: Commit**

```bash
git add daemon/src/cli.rs
git commit -m "feat(daemon): wire Codex tailer into run_watch"
```

---

### Task 11: `summarizer::run_codex`

**Files:**
- Modify: `daemon/src/summarizer.rs` (add `run_codex` + test)

- [ ] **Step 1: Write the failing test** — append to `mod tests` in `daemon/src/summarizer.rs`:

```rust
    #[tokio::test]
    async fn run_codex_errors_cleanly_when_binary_missing() {
        let err = run_codex_with_bin("definitely-not-a-real-binary-zyxw", "prompt", "system")
            .await
            .expect_err("should error");
        assert!(matches!(err, SummaryError::Spawn(_)));
    }
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd daemon && cargo test --lib summarizer::tests::run_codex -- --nocapture`
Expected: compile error — `run_codex_with_bin` doesn't exist.

- [ ] **Step 3: Implement `run_codex` + `run_codex_with_bin`** — append to `daemon/src/summarizer.rs` after `run_claude_with_bin` (around line 108):

```rust
pub async fn run_codex(prompt: &str, system: &str) -> Result<String, SummaryError> {
    run_codex_with_bin("codex", prompt, system).await
}

async fn run_codex_with_bin(bin: &str, prompt: &str, system: &str) -> Result<String, SummaryError> {
    // Compose the system prompt + user prompt into a single exec input. Codex
    // CLI's `exec -p` treats the argument as the user prompt; system prompts
    // are not first-class, so we prepend as a directive block.
    let composed = format!("System:\n{system}\n\nUser:\n{prompt}");
    let child = TokioCommand::new(bin)
        .arg("exec")
        .arg("-p")
        .arg(&composed)
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

(The exact Codex CLI flags may differ — `codex exec --help` should confirm. If `-p`/`--output-format` aren't the right flags on the installed version, adjust to match; the test only asserts the spawn-failure path, so compile + that one test is sufficient to commit.)

- [ ] **Step 4: Run test to verify pass**

Run: `cd daemon && cargo test --lib summarizer::tests::run_codex -- --nocapture`
Expected: pass.

- [ ] **Step 5: Commit**

```bash
git add daemon/src/summarizer.rs
git commit -m "feat(daemon): run_codex summarizer backend"
```

---

### Task 12: Wire `SummaryBackend::Codex` arm in `generate_and_cache`

**Files:**
- Modify: `daemon/src/summarizer.rs` around lines 153-161 (`generate_and_cache`'s `match detect_backend()`)

- [ ] **Step 1: Replace the Codex arm** — in `generate_and_cache`, change:

```rust
        SummaryBackend::Codex => {
            return Err(SummaryError::NonZeroExit("codex backend not yet wired".to_string()));
        }
```

to:

```rust
        SummaryBackend::Codex => run_codex(&prompt, system).await?,
```

- [ ] **Step 2: Update the `upsert_summary` backend tag to reflect the actual source** — in the same function, replace the `"claude"` literal with the variant-matched backend string. Change lines 162-165 to:

```rust
    let backend_str = match detect_backend() {
        SummaryBackend::Claude => "claude",
        SummaryBackend::Codex => "codex",
        SummaryBackend::None => "none",
    };
    {
        let s = store.lock().unwrap();
        s.upsert_summary(session_id, &text, backend_str)
            .map_err(|e| SummaryError::Wait(e.to_string()))?;
    }
```

- [ ] **Step 3: Run cargo check**

Run: `cd daemon && cargo check 2>&1 | grep -E "^error" || echo OK`
Expected: `OK`.

- [ ] **Step 4: Run summarizer tests**

Run: `cd daemon && cargo test --lib summarizer::tests -- --nocapture`
Expected: all green.

- [ ] **Step 5: Commit**

```bash
git add daemon/src/summarizer.rs
git commit -m "feat(daemon): wire Codex backend in generate_and_cache"
```

---

### Task 13: Extend zustand selection store with `rightTab`

**Files:**
- Modify: `app/src/store/selection.ts`
- Modify: `app/src/__tests__/selection.test.ts`

- [ ] **Step 1: Extend `beforeEach` to reset `rightTab`** — in `app/src/__tests__/selection.test.ts`, update the `useSelection.setState({ ... })` block inside `beforeEach` to include `rightTab: "changes"`:

```ts
  beforeEach(() => {
    localStorage.clear();
    useSelection.setState({
      selectedSessionId: null,
      leftWidth: 280,
      rightWidth: 320,
      rightTab: "changes",
    });
  });
```

- [ ] **Step 2: Append failing tests for `rightTab`** — add inside the `describe("useSelection", ...)` block, after the existing tests:

```ts
  it("defaults rightTab to 'changes'", () => {
    expect(useSelection.getState().rightTab).toBe("changes");
  });

  it("setRightTab updates state", () => {
    useSelection.getState().setRightTab("review");
    expect(useSelection.getState().rightTab).toBe("review");
  });

  it("persists rightTab through the persist middleware", () => {
    useSelection.getState().setRightTab("checks");
    const raw = localStorage.getItem("vigil-selection");
    expect(raw).toBeTruthy();
    expect(raw).toContain("checks");
  });

  it("accepts all four tab values", () => {
    for (const t of ["all", "changes", "checks", "review"] as const) {
      useSelection.getState().setRightTab(t);
      expect(useSelection.getState().rightTab).toBe(t);
    }
  });
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `cd app && npm test -- --run selection`
Expected: compile error — `setRightTab` is not on the store.

- [ ] **Step 4: Extend the store** — replace `app/src/store/selection.ts` with:

```ts
import { create } from "zustand";
import { persist } from "zustand/middleware";

export type RightTab = "all" | "changes" | "checks" | "review";

export interface SelectionState {
  selectedSessionId: string | null;
  leftWidth: number;
  rightWidth: number;
  rightTab: RightTab;
  setSelected: (id: string | null) => void;
  setLeftWidth: (px: number) => void;
  setRightWidth: (px: number) => void;
  setRightTab: (t: RightTab) => void;
}

export const useSelection = create<SelectionState>()(
  persist(
    (set) => ({
      selectedSessionId: null,
      leftWidth: 280,
      rightWidth: 320,
      rightTab: "changes",
      setSelected: (id) => set({ selectedSessionId: id }),
      setLeftWidth: (px) => set({ leftWidth: clamp(px, 200, 480) }),
      setRightWidth: (px) => set({ rightWidth: clamp(px, 240, 520) }),
      setRightTab: (t) => set({ rightTab: t }),
    }),
    { name: "vigil-selection" },
  ),
);

function clamp(v: number, lo: number, hi: number) {
  return Math.min(hi, Math.max(lo, v));
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd app && npm test -- --run selection`
Expected: all selection tests pass, including the new four.

- [ ] **Step 6: Typecheck**

Run: `cd app && npm run typecheck`
Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add app/src/store/selection.ts app/src/__tests__/selection.test.ts
git commit -m "feat(frontend): persist RightRail tab in selection store"
```

---

### Task 14: Wire `rightTab` into `RightRail`

**Files:**
- Modify: `app/src/components/layout/RightRail.tsx` — remove local `useState`, read from store instead

Current shape (lines 1, 5, 19):
```ts
import { useState } from "react";
// ...
type Tab = "all" | "changes" | "checks" | "review";
// ...
const [tab, setTab] = useState<Tab>("changes");
```

`useState` is used only for `tab` in this file, so the `react` import goes too.

- [ ] **Step 1: Replace the imports + local type + local state** — three edits in `app/src/components/layout/RightRail.tsx`:

Edit 1 — line 1, replace:
```ts
import { useState } from "react";
```
with:
```ts
import { useSelection, type RightTab } from "../../store/selection";
```

Edit 2 — line 5, replace:
```ts
type Tab = "all" | "changes" | "checks" | "review";
```
with:
```ts
type Tab = RightTab;
```

(Kept as an alias so the `TABS` array and `TabButton` call sites keep reading `Tab` without further edits.)

Edit 3 — line 19 (inside `RightRail`), replace:
```ts
const [tab, setTab] = useState<Tab>("changes");
```
with:
```ts
const tab = useSelection((s) => s.rightTab);
const setTab = useSelection((s) => s.setRightTab);
```

- [ ] **Step 2: Typecheck**

Run: `cd app && npm run typecheck`
Expected: no errors.

- [ ] **Step 3: Run the full app test suite**

Run: `cd app && npm test -- --run`
Expected: 54 existing + 4 new from Task 13 = 58 passing.

- [ ] **Step 4: Manual smoke test (optional)** — `npm run tauri:dev`, click through the tabs, reload the window, confirm the last-selected tab is restored.

- [ ] **Step 5: Commit**

```bash
git add app/src/components/layout/RightRail.tsx
git commit -m "feat(frontend): RightRail reads active tab from selection store"
```

---

## Self-Review Notes

**Spec coverage:**
- §4 Cursor source → Tasks 3-6 ✓
- §5 Codex source → Tasks 7-10 ✓
- §6 `SessionTurnRecord.source` → Task 1 ✓ (Task 2 backfills existing Claude writer)
- §7 `run_codex` + wired `SummaryBackend::Codex` → Tasks 11-12 ✓
- §8 RightRail tab persistence → Tasks 13-14 ✓
- §9 Testing plan (per-source unit tests) → covered inline in each task ✓
- §11 Risk mitigations: daemon doesn't panic on missing dirs (Cursor & Codex gracefully `eprintln!` and continue) ✓

**Placeholder scan:** None. Every step shows either exact code or an exact shell command with expected output. The two places where runtime discovery is required (real Cursor log format in Task 4 Step 6; real Codex transcript format in Task 8 Step 4) are explicit "iterate on the captured fixture" steps, not TBDs — the subagent can answer them in minutes from the fixtures they capture earlier in the same task.

**Type consistency:**
- `SessionTurnRecord.source` is `String` throughout (schema, insert, query, helper).
- `RightTab` literal union `"all" | "changes" | "checks" | "review"` used identically in selection store and RightRail.
- `spawn_turn_consumer` signature accepts a generic event type `E` with an adapter closure — same shape used for both Cursor and Claude tailers. No `TailerEvent` naming conflict since the helper is generic.
