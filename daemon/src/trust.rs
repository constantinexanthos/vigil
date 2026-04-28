//! Confidence scoring engine.
//!
//! Produces a 0–100 score for an agent session based on local heuristics:
//! - File count (many files = more risk)
//! - Self-correction loops (edits to the same file = iterating toward correctness)
//! - Event diversity (only creates vs mixed operations)
//! - Test file presence (did the agent touch tests?)
//! - Diff size (huge diffs = harder to review)
//! - Collision penalty (files touched by multiple agents)

use crate::store::{AgentEvent, EventKind};

/// A scored summary for one agent session or agent's recent activity.
#[derive(Debug, Clone, serde::Serialize)]
pub struct ConfidenceReport {
    pub agent: String,
    pub score: u32,
    pub file_count: usize,
    pub self_corrections: usize,
    pub has_tests: bool,
    pub collision_count: usize,
    pub factors: Vec<ScoringFactor>,
}

#[derive(Debug, Clone, serde::Serialize)]
pub struct ScoringFactor {
    pub name: String,
    pub impact: i32,
    pub reason: String,
}

/// Score a set of events from a single agent.
/// `hallucination_count` is the number of unresolved phantom imports for this agent.
pub fn score_events(agent: &str, events: &[AgentEvent], collision_files: &[String]) -> ConfidenceReport {
    score_events_with_hallucinations(agent, events, collision_files, 0)
}

pub fn score_events_with_hallucinations(
    agent: &str,
    events: &[AgentEvent],
    collision_files: &[String],
    hallucination_count: usize,
) -> ConfidenceReport {
    let mut score: i32 = 75; // Start at a reasonable baseline.
    let mut factors = Vec::new();

    // --- File count ---
    let files: std::collections::HashSet<&str> = events
        .iter()
        .filter_map(|e| e.file_path.as_deref())
        .collect();
    let file_count = files.len();

    if file_count <= 3 {
        let bump = 10;
        score += bump;
        factors.push(ScoringFactor {
            name: "small_scope".into(),
            impact: bump,
            reason: format!("Only {file_count} files — easy to review"),
        });
    } else if file_count > 15 {
        let penalty = -((file_count as i32 - 15).min(20) * 1);
        score += penalty;
        factors.push(ScoringFactor {
            name: "large_scope".into(),
            impact: penalty,
            reason: format!("{file_count} files modified — high review burden"),
        });
    }

    // --- Self-correction loops ---
    // Count files that were modified more than once (agent iterated on them).
    let mut file_edit_counts: std::collections::HashMap<&str, usize> = std::collections::HashMap::new();
    for event in events {
        if matches!(event.kind, EventKind::FileModify | EventKind::FileCreate) {
            if let Some(ref path) = event.file_path {
                *file_edit_counts.entry(path.as_str()).or_default() += 1;
            }
        }
    }
    let self_corrections = file_edit_counts.values().filter(|&&c| c > 1).count();

    if self_corrections > 0 && self_corrections <= 5 {
        let bump = 5;
        score += bump;
        factors.push(ScoringFactor {
            name: "self_correction".into(),
            impact: bump,
            reason: format!("{self_corrections} files re-edited — agent iterated toward correctness"),
        });
    } else if self_corrections > 5 {
        let penalty = -5;
        score += penalty;
        factors.push(ScoringFactor {
            name: "excessive_churn".into(),
            impact: penalty,
            reason: format!("{self_corrections} files re-edited excessively — possible flailing"),
        });
    }

    // --- Test file presence ---
    let has_tests = files.iter().any(|f| {
        let lower = f.to_lowercase();
        lower.contains("test") || lower.contains("spec") || lower.ends_with("_test.rs")
            || lower.ends_with(".test.ts") || lower.ends_with(".test.tsx")
            || lower.ends_with("_test.go") || lower.ends_with("_test.py")
    });

    if has_tests {
        let bump = 10;
        score += bump;
        factors.push(ScoringFactor {
            name: "tests_present".into(),
            impact: bump,
            reason: "Agent modified or created test files".into(),
        });
    } else if file_count > 3 {
        let penalty = -10;
        score += penalty;
        factors.push(ScoringFactor {
            name: "no_tests".into(),
            impact: penalty,
            reason: "No test files in a multi-file change".into(),
        });
    }

    // --- Event diversity ---
    // All-creates with no modifies is suspicious (generated boilerplate?).
    let creates = events.iter().filter(|e| e.kind == EventKind::FileCreate).count();
    let modifies = events.iter().filter(|e| e.kind == EventKind::FileModify).count();

    if creates > 5 && modifies == 0 {
        let penalty = -10;
        score += penalty;
        factors.push(ScoringFactor {
            name: "all_creates".into(),
            impact: penalty,
            reason: format!("{creates} files created with no modifications — possible boilerplate dump"),
        });
    }

    // --- Diff size ---
    let total_diff_bytes: usize = events
        .iter()
        .filter_map(|e| e.diff.as_ref())
        .map(|d| d.len())
        .sum();

    if total_diff_bytes > 50_000 {
        let penalty = -10;
        score += penalty;
        factors.push(ScoringFactor {
            name: "huge_diff".into(),
            impact: penalty,
            reason: format!("{}KB of diffs — very large change", total_diff_bytes / 1024),
        });
    } else if total_diff_bytes > 0 && total_diff_bytes < 5_000 {
        let bump = 5;
        score += bump;
        factors.push(ScoringFactor {
            name: "small_diff".into(),
            impact: bump,
            reason: "Small, focused change".into(),
        });
    }

    // --- Collision penalty ---
    let collision_count = files
        .iter()
        .filter(|f| collision_files.contains(&f.to_string()))
        .count();

    if collision_count > 0 {
        let penalty = -(collision_count as i32 * 10).min(30);
        score += penalty;
        factors.push(ScoringFactor {
            name: "file_collisions".into(),
            impact: penalty,
            reason: format!("{collision_count} files also modified by other agents"),
        });
    }

    // --- Git commits ---
    let has_commits = events.iter().any(|e| e.kind == EventKind::GitCommit);
    if has_commits {
        let bump = 5;
        score += bump;
        factors.push(ScoringFactor {
            name: "committed".into(),
            impact: bump,
            reason: "Agent committed changes to git".into(),
        });
    }

    // --- Hallucinated imports ---
    if hallucination_count > 0 {
        let penalty = -((hallucination_count as i32 * 5).min(25));
        score += penalty;
        factors.push(ScoringFactor {
            name: "phantom_imports".into(),
            impact: penalty,
            reason: format!("{hallucination_count} unresolved import(s) — possible hallucination"),
        });
    }

    // Clamp to 0–100.
    let score = score.clamp(0, 100) as u32;

    ConfidenceReport {
        agent: agent.to_string(),
        score,
        file_count,
        self_corrections,
        has_tests,
        collision_count,
        factors,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use chrono::Utc;

    fn make_event(kind: EventKind, file_path: Option<&str>, diff: Option<&str>) -> AgentEvent {
        AgentEvent {
            id: None,
            timestamp: Utc::now(),
            kind,
            file_path: file_path.map(|s| s.to_string()),
            agent: "claude-code".to_string(),
            session_id: None,
            repo_path: None,
            branch: None,
            diff: diff.map(|s| s.to_string()),
            metadata: None,
            host_kind: None,
            model: None,
            is_live: false,
        }
    }

    #[test]
    fn small_focused_change_scores_high() {
        let events = vec![
            make_event(EventKind::FileModify, Some("src/main.rs"), Some("+line")),
            make_event(EventKind::FileModify, Some("src/main_test.rs"), Some("+test")),
        ];
        let report = score_events("claude-code", &events, &[]);
        assert!(report.score >= 85, "score was {}", report.score);
        assert!(report.has_tests);
        assert_eq!(report.file_count, 2);
    }

    #[test]
    fn large_change_without_tests_scores_lower() {
        let events: Vec<AgentEvent> = (0..20)
            .map(|i| make_event(EventKind::FileCreate, Some(&format!("src/gen_{i}.rs")), None))
            .collect();
        let report = score_events("cursor", &events, &[]);
        assert!(report.score < 70, "score was {}", report.score);
        assert!(!report.has_tests);
    }

    #[test]
    fn collisions_reduce_score() {
        let events = vec![
            make_event(EventKind::FileModify, Some("shared.rs"), Some("+a")),
            make_event(EventKind::FileModify, Some("other.rs"), Some("+b")),
        ];
        let collisions = vec!["shared.rs".to_string()];
        let report = score_events("claude-code", &events, &collisions);
        assert_eq!(report.collision_count, 1);

        let clean_report = score_events("claude-code", &events, &[]);
        assert!(report.score < clean_report.score);
    }

    #[test]
    fn self_corrections_boost_score() {
        let events = vec![
            make_event(EventKind::FileModify, Some("src/lib.rs"), Some("+v1")),
            make_event(EventKind::FileModify, Some("src/lib.rs"), Some("+v2")),
            make_event(EventKind::FileModify, Some("src/lib.rs"), Some("+v3")),
        ];
        let report = score_events("claude-code", &events, &[]);
        assert!(report.self_corrections > 0);
        assert!(report.score >= 80, "score was {}", report.score);
    }

    #[test]
    fn hallucinations_reduce_score() {
        let events = vec![
            make_event(EventKind::FileModify, Some("src/main.rs"), Some("+line")),
        ];
        let clean = score_events("claude-code", &events, &[]);
        let with_phantoms =
            score_events_with_hallucinations("claude-code", &events, &[], 3);
        assert!(
            with_phantoms.score < clean.score,
            "phantom: {} vs clean: {}",
            with_phantoms.score,
            clean.score
        );
        // 3 phantoms * 5 = -15 penalty
        assert_eq!(clean.score - with_phantoms.score, 15);
        assert!(with_phantoms.factors.iter().any(|f| f.name == "phantom_imports"));
    }

    #[test]
    fn hallucination_penalty_caps_at_25() {
        let events = vec![
            make_event(EventKind::FileModify, Some("src/main.rs"), Some("+line")),
        ];
        let clean = score_events("agent", &events, &[]);
        let with_many = score_events_with_hallucinations("agent", &events, &[], 10);
        // 10 * 5 = 50 but capped at 25.
        assert_eq!(clean.score - with_many.score, 25);
    }

    #[test]
    fn score_clamps_to_0_100() {
        // Worst case: tons of files, all creates, no tests, collisions.
        let mut events: Vec<AgentEvent> = (0..30)
            .map(|i| make_event(EventKind::FileCreate, Some(&format!("gen/{i}.rs")), None))
            .collect();
        // Add a huge diff.
        events.push(make_event(
            EventKind::FileCreate,
            Some("gen/huge.rs"),
            Some(&"x".repeat(100_000)),
        ));

        let collisions: Vec<String> = (0..10).map(|i| format!("gen/{i}.rs")).collect();
        let report = score_events("agent", &events, &collisions);
        assert!(report.score <= 100);
        assert!(report.score >= 0);
    }
}
