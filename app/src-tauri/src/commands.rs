use chrono::{Duration, Utc};
use serde::Serialize;
use tauri::State;

use crate::store::Store;
use std::sync::Mutex;

pub type DbState = Mutex<Option<Store>>;

fn with_store<T>(state: &State<'_, DbState>, f: impl FnOnce(&Store) -> Result<T, String>) -> Result<T, String> {
    let guard = state.lock().map_err(|e| format!("lock error: {e}"))?;
    let store = guard.as_ref().ok_or_else(|| "database not available".to_string())?;
    f(store)
}

#[derive(Serialize)]
pub struct EventResponse {
    pub id: Option<i64>,
    pub timestamp: String,
    pub kind: String,
    pub file_path: Option<String>,
    pub agent: String,
    pub diff: Option<String>,
}

#[derive(Serialize)]
pub struct CollisionResponse {
    pub file_path: String,
    pub agents: Vec<String>,
}

#[derive(Serialize)]
pub struct AgentStatResponse {
    pub agent: String,
    pub count: u64,
}

#[derive(Serialize)]
pub struct SessionResponse {
    pub id: String,
    pub agent: String,
    pub start_time: String,
    pub end_time: String,
    pub files: Vec<String>,
    pub event_count: u64,
    pub confidence_score: u32,
    pub repo_path: Option<String>,
}

#[derive(Serialize)]
pub struct FileDiffResponse {
    pub file_path: String,
    pub diff: String,
}

#[tauri::command(rename_all = "snake_case")]
pub fn get_active_agents(state: State<'_, DbState>) -> Result<Vec<String>, String> {
    with_store(&state, |store| {
        let since = Utc::now() - Duration::minutes(10);
        store.active_agents_since(&since).map_err(|e| e.to_string())
    })
}

#[tauri::command(rename_all = "snake_case")]
pub fn get_recent_events(state: State<'_, DbState>, limit: u32) -> Result<Vec<EventResponse>, String> {
    with_store(&state, |store| {
        let events = store.recent_events(limit).map_err(|e| e.to_string())?;
        Ok(events
            .into_iter()
            .map(|e| EventResponse {
                id: e.id,
                timestamp: e.timestamp.to_rfc3339(),
                kind: e.kind.as_str().to_string(),
                file_path: e.file_path,
                agent: e.agent,
                diff: e.diff,
            })
            .collect())
    })
}

#[tauri::command(rename_all = "snake_case")]
pub fn get_collisions(state: State<'_, DbState>) -> Result<Vec<CollisionResponse>, String> {
    with_store(&state, |store| {
        let since = Utc::now() - Duration::minutes(5);
        let collisions = store.file_collisions(&since).map_err(|e| e.to_string())?;
        Ok(collisions
            .into_iter()
            .map(|(path, agents)| CollisionResponse {
                file_path: path,
                agents,
            })
            .collect())
    })
}

#[tauri::command(rename_all = "snake_case")]
pub fn get_event_count(state: State<'_, DbState>) -> Result<u64, String> {
    with_store(&state, |store| {
        let today = Utc::now().date_naive().and_hms_opt(0, 0, 0).unwrap();
        let since = today.and_utc();
        store.event_count_since(&since).map_err(|e| e.to_string())
    })
}

#[tauri::command(rename_all = "snake_case")]
pub fn get_agent_stats(state: State<'_, DbState>) -> Result<Vec<AgentStatResponse>, String> {
    with_store(&state, |store| {
        let today = Utc::now().date_naive().and_hms_opt(0, 0, 0).unwrap();
        let since = today.and_utc();
        let stats = store.agent_stats_since(&since).map_err(|e| e.to_string())?;
        Ok(stats
            .into_iter()
            .map(|(agent, count)| AgentStatResponse { agent, count })
            .collect())
    })
}

/// Return recent sessions grouped by agent with a 5-minute gap threshold.
#[tauri::command(rename_all = "snake_case")]
pub fn get_sessions(state: State<'_, DbState>, hours: Option<u64>) -> Result<Vec<SessionResponse>, String> {
    with_store(&state, |store| {
        let hours = hours.unwrap_or(24);
        let since = Utc::now() - Duration::hours(hours as i64);
        let events = store.events_since(&since).map_err(|e| e.to_string())?;

        // Group events into sessions: same agent, events within 5 minutes of each other.
        let mut sessions: Vec<SessionResponse> = Vec::new();
        let gap = Duration::minutes(5);

        for event in &events {
            let ts = event.timestamp;
            let agent = &event.agent;

            let fits_existing = sessions.iter_mut().rev().find(|s| {
                s.agent == *agent && {
                    let end = chrono::DateTime::parse_from_rfc3339(&s.end_time)
                        .map(|dt| dt.with_timezone(&Utc))
                        .unwrap_or(Utc::now());
                    (ts - end).abs() < gap
                }
            });

            if let Some(session) = fits_existing {
                session.end_time = ts.to_rfc3339();
                session.event_count += 1;
                if let Some(ref fp) = event.file_path {
                    if !session.files.contains(fp) {
                        session.files.push(fp.clone());
                    }
                }
                if session.repo_path.is_none() {
                    session.repo_path = event.repo_path.clone();
                }
            } else {
                let id = format!("{}-{}", agent, ts.timestamp_millis());
                sessions.push(SessionResponse {
                    id,
                    agent: agent.clone(),
                    start_time: ts.to_rfc3339(),
                    end_time: ts.to_rfc3339(),
                    files: event.file_path.iter().cloned().collect(),
                    event_count: 1,
                    confidence_score: 0,
                    repo_path: event.repo_path.clone(),
                });
            }
        }

        // Compute a simple confidence score per session.
        for session in &mut sessions {
            session.confidence_score = compute_confidence(session);
        }

        // Most recent first.
        sessions.reverse();
        Ok(sessions)
    })
}

/// Simple confidence heuristic: higher for fewer files, lower for many files or short sessions.
fn compute_confidence(session: &SessionResponse) -> u32 {
    let file_count = session.files.len() as u32;
    let event_count = session.event_count as u32;

    // Base score starts at 80.
    let mut score: i32 = 80;

    // Penalize large change sets.
    if file_count > 10 {
        score -= ((file_count - 10) * 3) as i32;
    }

    // Bonus for moderate activity (suggests iterative work, not bulk dump).
    if event_count > 3 && event_count < 50 {
        score += 10;
    }

    // Penalize very low activity (single file touch = less signal).
    if event_count <= 1 {
        score -= 15;
    }

    score.clamp(10, 100) as u32
}

/// Return per-file diffs for a given session.
#[tauri::command(rename_all = "snake_case")]
pub fn get_session_diffs(state: State<'_, DbState>, session_id: String) -> Result<Vec<FileDiffResponse>, String> {
    // Parse agent and timestamp from session_id format: "agent-timestamp_millis"
    with_store(&state, |store| {
        let hours = 24u64;
        let since = Utc::now() - Duration::hours(hours as i64);
        let events = store.events_since(&since).map_err(|e| e.to_string())?;
        let gap = Duration::minutes(5);

        // Rebuild sessions to find the one matching session_id.
        struct TempSession {
            id: String,
            agent: String,
            end_time: chrono::DateTime<Utc>,
            files: Vec<String>,
        }
        let mut sessions: Vec<TempSession> = Vec::new();

        for event in &events {
            let ts = event.timestamp;
            let agent = &event.agent;

            let fits_existing = sessions.iter_mut().rev().find(|s| {
                s.agent == *agent && (ts - s.end_time).abs() < gap
            });

            if let Some(s) = fits_existing {
                s.end_time = ts;
                if let Some(ref fp) = event.file_path {
                    if !s.files.contains(fp) {
                        s.files.push(fp.clone());
                    }
                }
            } else {
                let id = format!("{}-{}", agent, ts.timestamp_millis());
                sessions.push(TempSession {
                    id,
                    agent: agent.clone(),
                    end_time: ts,
                    files: event.file_path.iter().cloned().collect(),
                });
            }
        }

        let target = sessions.into_iter().find(|s| s.id == session_id);
        let files = match target {
            Some(s) => s.files,
            None => return Err(format!("session not found: {session_id}")),
        };

        // Get diffs for each file.
        let mut diffs = Vec::new();
        for file_path in &files {
            let diff = get_file_diff(file_path);
            diffs.push(FileDiffResponse {
                file_path: file_path.clone(),
                diff,
            });
        }

        Ok(diffs)
    })
}

/// Run git diff on a file to get its current unstaged changes.
fn get_file_diff(path: &str) -> String {
    let file_path = std::path::Path::new(path);
    let parent = match file_path.parent() {
        Some(p) => p,
        None => return "(no parent directory)".to_string(),
    };

    let output = std::process::Command::new("git")
        .args(["diff", "HEAD", "--no-color", "-U3", "--", path])
        .current_dir(parent)
        .output();

    match output {
        Ok(o) if o.status.success() => {
            let diff = String::from_utf8_lossy(&o.stdout).to_string();
            if diff.trim().is_empty() {
                "(no changes)".to_string()
            } else {
                diff
            }
        }
        _ => "(could not generate diff)".to_string(),
    }
}

/// Rollback rejected files by running git checkout HEAD -- <file> for each.
#[tauri::command(rename_all = "snake_case")]
pub fn rollback_files(files: Vec<String>, repo_path: String) -> Result<Vec<String>, String> {
    let mut results = Vec::new();
    for file in &files {
        let output = std::process::Command::new("git")
            .args(["checkout", "HEAD", "--", file])
            .current_dir(&repo_path)
            .output()
            .map_err(|e| format!("failed to run git: {e}"))?;

        if output.status.success() {
            results.push(format!("reverted: {file}"));
        } else {
            let stderr = String::from_utf8_lossy(&output.stderr);
            results.push(format!("failed: {file} -- {}", stderr.trim()));
        }
    }
    Ok(results)
}
