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
