use crate::store::{default_db_path, AgentStatRow, CollisionRow, EventRow, Store};

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
