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
