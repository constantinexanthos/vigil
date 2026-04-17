use notify::{RecommendedWatcher, RecursiveMode, Watcher};
use serde::Deserialize;
use std::collections::HashMap;
use std::fs::File;
use std::io::{BufRead, BufReader, Seek, SeekFrom};
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};
use tokio::sync::mpsc::{UnboundedReceiver, UnboundedSender};

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

    use std::io::Write;
    use tempfile::TempDir;

    #[tokio::test]
    async fn tailer_emits_appended_lines() {
        let dir = TempDir::new().unwrap();
        let (_watcher, mut rx) = start_tailer(dir.path()).unwrap();

        // Give the watcher a moment to initialize.
        tokio::time::sleep(std::time::Duration::from_millis(200)).await;

        let path = dir.path().join("test.jsonl");
        let mut f = std::fs::OpenOptions::new()
            .create(true).append(true).open(&path).unwrap();
        writeln!(f, r#"{{"message":{{"role":"user","content":"first"}}}}"#).unwrap();
        writeln!(f, r#"{{"message":{{"role":"assistant","content":"second"}}}}"#).unwrap();
        drop(f);

        let mut seen = Vec::new();
        let deadline = std::time::Instant::now() + std::time::Duration::from_secs(5);
        while seen.len() < 2 && std::time::Instant::now() < deadline {
            if let Ok(Some(ev)) = tokio::time::timeout(std::time::Duration::from_millis(250), rx.recv()).await {
                seen.push(ev.turn.text);
            }
        }
        assert_eq!(seen, vec!["first".to_string(), "second".to_string()]);
    }
}
