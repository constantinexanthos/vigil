use serde::{Deserialize, Serialize};
use std::process::Command;

use crate::store::SessionTurnRecord;

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
}
