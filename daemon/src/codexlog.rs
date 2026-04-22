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
}
