use crate::store::{
    default_db_path, AgentStatRow, CollisionRow, CommitGroup, CostTotalRow, EventRow, PrRow, Store,
    WorkspaceSummaryRow, LiveSummaryRow,
};

pub fn try_open_store() -> Option<Store> {
    let path = default_db_path();
    if !path.exists() { return None; }
    Store::open(&path).ok()
}

fn open_store() -> Result<Store, String> {
    let path = default_db_path();
    if !path.exists() {
        return Err("Daemon not running. Start with: vigil watch <dir>".into());
    }
    Store::open(&path).map_err(|e| format!("Failed to open database: {e}"))
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
pub fn get_active_agents() -> Result<Vec<String>, String> {
    let store = open_store()?;
    store
        .query_active_agents()
        .map_err(|e| format!("Query failed: {e}"))
}

#[tauri::command(rename_all = "snake_case")]
pub fn get_recent_events(limit: u32) -> Result<Vec<EventRow>, String> {
    let store = open_store()?;
    store
        .query_recent_events(limit)
        .map_err(|e| format!("Query failed: {e}"))
}

#[tauri::command(rename_all = "snake_case")]
pub fn get_collisions() -> Result<Vec<CollisionRow>, String> {
    let store = open_store()?;
    store
        .query_collisions()
        .map_err(|e| format!("Query failed: {e}"))
}

#[tauri::command(rename_all = "snake_case")]
pub fn get_agent_stats() -> Result<Vec<AgentStatRow>, String> {
    let store = open_store()?;
    store
        .query_agent_stats()
        .map_err(|e| format!("Query failed: {e}"))
}

#[tauri::command(rename_all = "snake_case")]
pub fn get_event_count() -> Result<i64, String> {
    let store = open_store()?;
    store
        .query_event_count()
        .map_err(|e| format!("Query failed: {e}"))
}

#[tauri::command(rename_all = "snake_case")]
pub fn get_cost_summary(hours: Option<i64>) -> Result<CostTotalRow, String> {
    let store = open_store()?;
    store
        .query_cost_summary(hours.unwrap_or(24))
        .map_err(|e| format!("Query failed: {e}"))
}

#[tauri::command(rename_all = "snake_case")]
pub fn get_commit_activity(hours: Option<i64>) -> Result<Vec<CommitGroup>, String> {
    let store = open_store()?;
    store
        .query_commit_groups(hours.unwrap_or(24))
        .map_err(|e| format!("Query failed: {e}"))
}

#[tauri::command(rename_all = "snake_case")]
pub fn get_workspace_summary() -> Result<WorkspaceSummaryRow, String> {
    let store = open_store()?;
    store
        .query_workspace_summary()
        .map_err(|e| format!("Query failed: {e}"))
}

#[tauri::command(rename_all = "snake_case")]
pub fn get_pull_requests(repo_path: Option<String>) -> Result<Vec<PrRow>, String> {
    let store = open_store()?;
    store
        .query_pull_requests(repo_path.as_deref())
        .map_err(|e| format!("Query failed: {e}"))
}

#[tauri::command(rename_all = "snake_case")]
pub fn get_live_summary() -> Result<LiveSummaryRow, String> {
    let store = open_store()?;
    store
        .query_live_summary()
        .map_err(|e| format!("Query failed: {e}"))
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
