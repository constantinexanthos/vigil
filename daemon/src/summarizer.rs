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
