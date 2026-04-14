//! Selective rollback module.
//!
//! Groups events into sessions by agent + time gap, generates diffs for
//! modified files, and provides per-file accept/reject rollback.

use std::collections::BTreeMap;
use std::io::{self, BufRead, Write};
use std::path::Path;
use std::process::Command as ProcessCommand;

use chrono::{DateTime, Duration, Utc};
use rusqlite::{params, Connection, Result};

/// Maximum gap between consecutive events before a new session starts.
const SESSION_GAP_MINUTES: i64 = 5;

/// A detected session — a sequence of events from one agent with no gap > 5 min.
#[derive(Debug, Clone)]
pub struct Session {
    pub id: String,
    pub agent: String,
    pub start_time: DateTime<Utc>,
    pub end_time: DateTime<Utc>,
    pub file_count: usize,
    pub event_count: usize,
    pub files: Vec<String>,
    pub repo_path: Option<String>,
}

/// Result of a rollback operation on a single file.
#[derive(Debug, Clone, Copy, PartialEq)]
pub enum FileAction {
    Accepted,
    Rejected,
    Skipped,
}

/// Result of a full rollback operation.
#[derive(Debug)]
pub struct RollbackResult {
    pub accepted: usize,
    pub rejected: usize,
    pub skipped: usize,
    pub errors: Vec<String>,
}

/// Query events and group them into sessions.
/// A session is events from the same agent where no gap > SESSION_GAP_MINUTES.
pub fn get_sessions(
    conn: &Connection,
    since: &DateTime<Utc>,
    agent_filter: Option<&str>,
) -> Result<Vec<Session>> {
    let mut sql = String::from(
        "SELECT id, timestamp, agent, file_path, repo_path
         FROM events
         WHERE timestamp >= ?1
           AND kind IN ('file_create', 'file_modify', 'file_delete')
           AND file_path IS NOT NULL",
    );
    let mut param_values: Vec<Box<dyn rusqlite::types::ToSql>> =
        vec![Box::new(since.to_rfc3339())];

    if let Some(agent) = agent_filter {
        sql.push_str(" AND agent = ?2");
        param_values.push(Box::new(agent.to_string()));
    }

    sql.push_str(" ORDER BY agent, timestamp ASC");

    let params_ref: Vec<&dyn rusqlite::types::ToSql> =
        param_values.iter().map(|p| p.as_ref()).collect();

    let mut stmt = conn.prepare(&sql)?;
    let rows: Vec<(i64, String, String, String, Option<String>)> = stmt
        .query_map(params_ref.as_slice(), |row| {
            Ok((
                row.get(0)?,
                row.get(1)?,
                row.get(2)?,
                row.get(3)?,
                row.get(4)?,
            ))
        })?
        .filter_map(|r| r.ok())
        .collect();

    let gap = Duration::minutes(SESSION_GAP_MINUTES);
    let mut sessions: Vec<Session> = Vec::new();
    let mut current_agent = String::new();
    let mut current_start: Option<DateTime<Utc>> = None;
    let mut current_end: Option<DateTime<Utc>> = None;
    let mut current_files: BTreeMap<String, ()> = BTreeMap::new();
    let mut current_event_count = 0usize;
    let mut current_repo: Option<String> = None;
    let mut session_counter = 0usize;

    let flush = |sessions: &mut Vec<Session>,
                 counter: &mut usize,
                 agent: &str,
                 start: DateTime<Utc>,
                 end: DateTime<Utc>,
                 files: &BTreeMap<String, ()>,
                 event_count: usize,
                 repo: &Option<String>| {
        *counter += 1;
        let id = format!("s-{:04}", *counter);
        sessions.push(Session {
            id,
            agent: agent.to_string(),
            start_time: start,
            end_time: end,
            file_count: files.len(),
            event_count,
            files: files.keys().cloned().collect(),
            repo_path: repo.clone(),
        });
    };

    for (_event_id, ts_str, agent, file_path, repo_path) in &rows {
        let ts = DateTime::parse_from_rfc3339(ts_str)
            .map(|dt| dt.with_timezone(&Utc))
            .unwrap_or_else(|_| Utc::now());

        if agent != &current_agent {
            // New agent — flush previous session if any.
            if let (Some(start), Some(end)) = (current_start, current_end) {
                flush(
                    &mut sessions,
                    &mut session_counter,
                    &current_agent,
                    start,
                    end,
                    &current_files,
                    current_event_count,
                    &current_repo,
                );
            }
            current_agent = agent.clone();
            current_start = Some(ts);
            current_end = Some(ts);
            current_files = BTreeMap::new();
            current_files.insert(file_path.clone(), ());
            current_event_count = 1;
            current_repo = repo_path.clone();
        } else if let Some(end) = current_end {
            if ts - end > gap {
                // Gap exceeded — flush and start new session.
                flush(
                    &mut sessions,
                    &mut session_counter,
                    &current_agent,
                    current_start.unwrap(),
                    end,
                    &current_files,
                    current_event_count,
                    &current_repo,
                );
                current_start = Some(ts);
                current_end = Some(ts);
                current_files = BTreeMap::new();
                current_files.insert(file_path.clone(), ());
                current_event_count = 1;
                current_repo = repo_path.clone();
            } else {
                // Same session — extend.
                current_end = Some(ts);
                current_files.insert(file_path.clone(), ());
                current_event_count += 1;
                if current_repo.is_none() {
                    current_repo = repo_path.clone();
                }
            }
        }
    }

    // Flush last session.
    if let (Some(start), Some(end)) = (current_start, current_end) {
        flush(
            &mut sessions,
            &mut session_counter,
            &current_agent,
            start,
            end,
            &current_files,
            current_event_count,
            &current_repo,
        );
    }

    // Sort by start time descending.
    sessions.sort_by(|a, b| b.start_time.cmp(&a.start_time));

    Ok(sessions)
}

/// Generate a git diff for a file. Returns None if git is not available or the file has no changes.
pub fn git_diff_for_file(repo_path: &str, file_path: &str) -> Option<String> {
    // Try uncommitted changes first.
    let output = ProcessCommand::new("git")
        .args(["diff", "HEAD", "--", file_path])
        .current_dir(repo_path)
        .output()
        .ok()?;

    let diff = String::from_utf8_lossy(&output.stdout).to_string();
    if !diff.trim().is_empty() {
        return Some(diff);
    }

    // Try staged changes.
    let output = ProcessCommand::new("git")
        .args(["diff", "--cached", "--", file_path])
        .current_dir(repo_path)
        .output()
        .ok()?;

    let diff = String::from_utf8_lossy(&output.stdout).to_string();
    if !diff.trim().is_empty() {
        return Some(diff);
    }

    None
}

/// Rollback a single file using git checkout.
pub fn rollback_file(repo_path: &str, file_path: &str) -> std::result::Result<(), String> {
    let output = ProcessCommand::new("git")
        .args(["checkout", "HEAD", "--", file_path])
        .current_dir(repo_path)
        .output()
        .map_err(|e| format!("Failed to run git: {e}"))?;

    if output.status.success() {
        Ok(())
    } else {
        let stderr = String::from_utf8_lossy(&output.stderr);
        Err(format!("git checkout failed: {stderr}"))
    }
}

/// Run an interactive rollback for a session.
pub fn interactive_rollback(
    session: &Session,
    dry_run: bool,
    reject_all: bool,
) -> RollbackResult {
    let repo = match &session.repo_path {
        Some(r) => r.as_str(),
        None => {
            println!("  No repo_path recorded for this session. Cannot rollback.");
            return RollbackResult {
                accepted: 0,
                rejected: 0,
                skipped: session.files.len(),
                errors: vec!["No repo_path".to_string()],
            };
        }
    };

    let mut result = RollbackResult {
        accepted: 0,
        rejected: 0,
        skipped: 0,
        errors: Vec::new(),
    };

    let stdin = io::stdin();
    let mut reader = stdin.lock();

    for file in &session.files {
        let diff = git_diff_for_file(repo, file);

        println!();
        println!("  FILE: {file}");
        if let Some(ref d) = diff {
            // Show a compact diff summary.
            let added = d.lines().filter(|l| l.starts_with('+') && !l.starts_with("+++")).count();
            let removed = d.lines().filter(|l| l.starts_with('-') && !l.starts_with("---")).count();
            println!("  +{added} -{removed} lines changed");

            // Print first 20 lines of diff.
            for (i, line) in d.lines().enumerate() {
                if i >= 20 {
                    println!("  ... ({} more lines)", d.lines().count() - 20);
                    break;
                }
                println!("  {line}");
            }
        } else {
            println!("  (no uncommitted changes)");
            result.skipped += 1;
            continue;
        }

        let action = if reject_all {
            FileAction::Rejected
        } else {
            print!("  [a]ccept / [r]eject / [s]kip > ");
            io::stdout().flush().ok();
            let mut input = String::new();
            reader.read_line(&mut input).ok();
            match input.trim().chars().next() {
                Some('r') | Some('R') => FileAction::Rejected,
                Some('a') | Some('A') => FileAction::Accepted,
                _ => FileAction::Skipped,
            }
        };

        match action {
            FileAction::Accepted => {
                println!("  -> accepted");
                result.accepted += 1;
            }
            FileAction::Rejected => {
                if dry_run {
                    println!("  -> would reject (dry run)");
                } else {
                    match rollback_file(repo, file) {
                        Ok(()) => println!("  -> rejected (restored)"),
                        Err(e) => {
                            println!("  -> error: {e}");
                            result.errors.push(format!("{file}: {e}"));
                        }
                    }
                }
                result.rejected += 1;
            }
            FileAction::Skipped => {
                println!("  -> skipped");
                result.skipped += 1;
            }
        }
    }

    result
}

#[cfg(test)]
mod tests {
    use super::*;
    use rusqlite::Connection;

    fn test_db() -> Connection {
        let conn = Connection::open_in_memory().unwrap();
        conn.execute_batch(
            "CREATE TABLE events (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                timestamp TEXT NOT NULL,
                kind TEXT NOT NULL,
                file_path TEXT,
                agent TEXT NOT NULL,
                session_id TEXT,
                repo_path TEXT,
                branch TEXT,
                diff TEXT,
                metadata TEXT
            );
            CREATE TABLE cost_events (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                event_id INTEGER,
                timestamp TEXT,
                agent TEXT,
                session_id TEXT,
                model TEXT,
                input_tokens INTEGER DEFAULT 0,
                output_tokens INTEGER DEFAULT 0,
                cache_read_tokens INTEGER DEFAULT 0,
                cache_write_tokens INTEGER DEFAULT 0,
                cost_usd REAL DEFAULT 0.0
            );",
        )
        .unwrap();
        conn
    }

    fn insert_event(conn: &Connection, agent: &str, file: &str, ts: &str, repo: Option<&str>) {
        conn.execute(
            "INSERT INTO events (timestamp, kind, file_path, agent, repo_path) VALUES (?1, 'file_modify', ?2, ?3, ?4)",
            params![ts, file, agent, repo],
        )
        .unwrap();
    }

    #[test]
    fn events_close_together_same_session() {
        let conn = test_db();
        // 3 minutes apart — should be one session.
        insert_event(&conn, "claude-code", "a.rs", "2026-04-13T10:00:00Z", Some("/repo"));
        insert_event(&conn, "claude-code", "b.rs", "2026-04-13T10:03:00Z", Some("/repo"));

        let since = DateTime::parse_from_rfc3339("2026-04-13T00:00:00Z")
            .unwrap()
            .with_timezone(&Utc);
        let sessions = get_sessions(&conn, &since, None).unwrap();
        assert_eq!(sessions.len(), 1);
        assert_eq!(sessions[0].event_count, 2);
        assert_eq!(sessions[0].file_count, 2);
    }

    #[test]
    fn events_far_apart_different_sessions() {
        let conn = test_db();
        // 6 minutes apart — should be two sessions.
        insert_event(&conn, "claude-code", "a.rs", "2026-04-13T10:00:00Z", Some("/repo"));
        insert_event(&conn, "claude-code", "b.rs", "2026-04-13T10:06:00Z", Some("/repo"));

        let since = DateTime::parse_from_rfc3339("2026-04-13T00:00:00Z")
            .unwrap()
            .with_timezone(&Utc);
        let sessions = get_sessions(&conn, &since, None).unwrap();
        assert_eq!(sessions.len(), 2);
        assert_eq!(sessions[0].event_count, 1);
        assert_eq!(sessions[1].event_count, 1);
    }

    #[test]
    fn different_agents_different_sessions() {
        let conn = test_db();
        insert_event(&conn, "claude-code", "a.rs", "2026-04-13T10:00:00Z", Some("/repo"));
        insert_event(&conn, "cursor", "b.rs", "2026-04-13T10:01:00Z", Some("/repo"));

        let since = DateTime::parse_from_rfc3339("2026-04-13T00:00:00Z")
            .unwrap()
            .with_timezone(&Utc);
        let sessions = get_sessions(&conn, &since, None).unwrap();
        assert_eq!(sessions.len(), 2);
    }

    #[test]
    fn agent_filter_works() {
        let conn = test_db();
        insert_event(&conn, "claude-code", "a.rs", "2026-04-13T10:00:00Z", Some("/repo"));
        insert_event(&conn, "cursor", "b.rs", "2026-04-13T10:01:00Z", Some("/repo"));

        let since = DateTime::parse_from_rfc3339("2026-04-13T00:00:00Z")
            .unwrap()
            .with_timezone(&Utc);
        let sessions = get_sessions(&conn, &since, Some("cursor")).unwrap();
        assert_eq!(sessions.len(), 1);
        assert_eq!(sessions[0].agent, "cursor");
    }

    #[test]
    fn session_tracks_unique_files() {
        let conn = test_db();
        // Same file modified twice — should count as 1 unique file.
        insert_event(&conn, "claude-code", "a.rs", "2026-04-13T10:00:00Z", Some("/repo"));
        insert_event(&conn, "claude-code", "a.rs", "2026-04-13T10:01:00Z", Some("/repo"));
        insert_event(&conn, "claude-code", "b.rs", "2026-04-13T10:02:00Z", Some("/repo"));

        let since = DateTime::parse_from_rfc3339("2026-04-13T00:00:00Z")
            .unwrap()
            .with_timezone(&Utc);
        let sessions = get_sessions(&conn, &since, None).unwrap();
        assert_eq!(sessions.len(), 1);
        assert_eq!(sessions[0].event_count, 3);
        assert_eq!(sessions[0].file_count, 2);
    }

    #[test]
    fn session_preserves_repo_path() {
        let conn = test_db();
        insert_event(&conn, "claude-code", "a.rs", "2026-04-13T10:00:00Z", Some("/my/repo"));

        let since = DateTime::parse_from_rfc3339("2026-04-13T00:00:00Z")
            .unwrap()
            .with_timezone(&Utc);
        let sessions = get_sessions(&conn, &since, None).unwrap();
        assert_eq!(sessions[0].repo_path.as_deref(), Some("/my/repo"));
    }

    #[test]
    fn empty_events_no_sessions() {
        let conn = test_db();
        let since = DateTime::parse_from_rfc3339("2026-04-13T00:00:00Z")
            .unwrap()
            .with_timezone(&Utc);
        let sessions = get_sessions(&conn, &since, None).unwrap();
        assert!(sessions.is_empty());
    }

    #[test]
    fn session_boundary_exact_five_minutes() {
        let conn = test_db();
        // Exactly 5 minutes — should still be same session (gap must EXCEED 5 min).
        insert_event(&conn, "claude-code", "a.rs", "2026-04-13T10:00:00Z", Some("/repo"));
        insert_event(&conn, "claude-code", "b.rs", "2026-04-13T10:05:00Z", Some("/repo"));

        let since = DateTime::parse_from_rfc3339("2026-04-13T00:00:00Z")
            .unwrap()
            .with_timezone(&Utc);
        let sessions = get_sessions(&conn, &since, None).unwrap();
        assert_eq!(sessions.len(), 1);
    }

    #[test]
    fn multiple_agents_interleaved() {
        let conn = test_db();
        insert_event(&conn, "aider", "x.rs", "2026-04-13T10:00:00Z", Some("/repo"));
        insert_event(&conn, "aider", "y.rs", "2026-04-13T10:02:00Z", Some("/repo"));
        insert_event(&conn, "claude-code", "a.rs", "2026-04-13T10:01:00Z", Some("/repo"));
        insert_event(&conn, "claude-code", "b.rs", "2026-04-13T10:04:00Z", Some("/repo"));

        let since = DateTime::parse_from_rfc3339("2026-04-13T00:00:00Z")
            .unwrap()
            .with_timezone(&Utc);
        let sessions = get_sessions(&conn, &since, None).unwrap();
        // Sorted by agent then time: aider gets 1 session, claude-code gets 1 session.
        assert_eq!(sessions.len(), 2);
    }

    #[test]
    fn rollback_result_default() {
        let result = RollbackResult {
            accepted: 3,
            rejected: 2,
            skipped: 1,
            errors: vec![],
        };
        assert_eq!(result.accepted, 3);
        assert_eq!(result.rejected, 2);
        assert_eq!(result.skipped, 1);
    }
}
