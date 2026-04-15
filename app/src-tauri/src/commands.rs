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
