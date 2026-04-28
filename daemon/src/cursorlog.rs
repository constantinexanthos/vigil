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
}
