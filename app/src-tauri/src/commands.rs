use crate::store::{
    default_db_path, AgentStatRow, CollisionRow, CommitGroup, CostTotalRow, EventRow, HostRow,
    LiveSessionRow, LiveSummaryRow, PrRow, ReviewSignalsRow, Store, WorkspaceSummaryRow,
};
use serde::{Deserialize, Serialize};

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

#[tauri::command(rename_all = "snake_case")]
pub fn get_hosts() -> Result<Vec<HostRow>, String> {
    let store = open_store()?;
    store
        .query_hosts(10)
        .map_err(|e| format!("Query failed: {e}"))
}

#[tauri::command(rename_all = "snake_case")]
pub fn get_live_sessions() -> Result<Vec<LiveSessionRow>, String> {
    let store = open_store()?;
    store
        .query_live_sessions(60)
        .map_err(|e| format!("Query failed: {e}"))
}

#[derive(Serialize, Deserialize, Clone)]
pub struct SummaryResponse {
    pub text: String,
    pub generated_at: String,
    pub backend: String,
    pub stale_seconds: i64,
}

#[tauri::command(rename_all = "snake_case")]
pub fn get_summary(session_id: String) -> Result<Option<SummaryResponse>, String> {
    let store = open_store()?;
    let row = store
        .query_summary(&session_id)
        .map_err(|e| format!("Query failed: {e}"))?;
    let Some((text, generated_at, backend)) = row else {
        return Ok(None);
    };
    let parsed = chrono::DateTime::parse_from_rfc3339(&generated_at)
        .map_err(|e| format!("parse generated_at: {e}"))?
        .with_timezone(&chrono::Utc);
    let stale = (chrono::Utc::now() - parsed).num_seconds();
    Ok(Some(SummaryResponse {
        text,
        generated_at,
        backend,
        stale_seconds: stale,
    }))
}

#[tauri::command(rename_all = "snake_case")]
pub async fn refresh_summary(session_id: String) -> Result<(), String> {
    let home = home::home_dir().ok_or_else(|| "no home dir".to_string())?;
    let trigger_dir = home.join(".vigil").join("refresh-triggers");
    std::fs::create_dir_all(&trigger_dir).map_err(|e| e.to_string())?;
    // Replace '/' with '_' so session IDs containing slashes don't create subdirs.
    let sanitized = session_id.replace('/', "_");
    let trigger = trigger_dir.join(format!("{}.flag", sanitized));
    std::fs::write(&trigger, chrono::Utc::now().to_rfc3339()).map_err(|e| e.to_string())?;
    Ok(())
}

#[derive(Serialize, Clone)]
pub struct CliStatus {
    pub claude: bool,
    pub codex: bool,
}

#[tauri::command(rename_all = "snake_case")]
pub fn detect_cli() -> CliStatus {
    let claude = std::process::Command::new("claude")
        .arg("--version")
        .output()
        .map(|o| o.status.success())
        .unwrap_or(false);
    let codex = std::process::Command::new("codex")
        .arg("--version")
        .output()
        .map(|o| o.status.success())
        .unwrap_or(false);
    CliStatus { claude, codex }
}

#[tauri::command(rename_all = "snake_case")]
pub fn save_api_key(provider: String, key: String) -> Result<(), String> {
    let entry = keyring::Entry::new("vigil", &format!("api-key-{}", provider))
        .map_err(|e| e.to_string())?;
    entry.set_password(&key).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command(rename_all = "snake_case")]
pub fn has_api_key(provider: String) -> bool {
    keyring::Entry::new("vigil", &format!("api-key-{}", provider))
        .and_then(|e| e.get_password())
        .is_ok()
}

#[derive(Serialize, Deserialize, Clone)]
pub struct SessionTurnRow {
    pub session_id: String,
    pub timestamp: String,
    pub role: String,
    pub text: String,
    pub tool_names: Vec<String>,
    pub source: String,
}

#[tauri::command(rename_all = "snake_case")]
pub fn get_recent_turns(session_id: String, limit: Option<i64>) -> Result<Vec<SessionTurnRow>, String> {
    let store = open_store()?;
    let turns = store
        .recent_turns(&session_id, limit.unwrap_or(16))
        .map_err(|e| format!("Query failed: {e}"))?;
    Ok(turns
        .into_iter()
        .map(|t| SessionTurnRow {
            session_id: t.session_id,
            timestamp: t.timestamp.to_rfc3339(),
            role: t.role,
            text: t.text,
            tool_names: t.tool_names,
            source: t.source,
        })
        .collect())
}

#[tauri::command(rename_all = "snake_case")]
pub fn get_review_signals(session_id: String) -> Result<ReviewSignalsRow, String> {
    let store = open_store()?;
    store
        .query_session_review(&session_id)
        .map_err(|e| format!("Query failed: {e}"))
}
