#[allow(unused_imports)]
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
