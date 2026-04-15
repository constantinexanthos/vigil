//! Real-time event streaming from the daemon's SQLite store.
//!
//! Spawns a background thread that polls the database for new events
//! (id > last_seen) and emits them to the React frontend via Tauri events.

use crate::store::{default_db_path, Store};
use tauri::{AppHandle, Emitter};

const POLL_INTERVAL_MS: u64 = 500;

/// Payload emitted to the frontend for each batch of new events.
#[derive(Debug, Clone, serde::Serialize)]
struct StreamPayload {
    events: Vec<crate::store::EventRow>,
    scores: Vec<crate::store::ConfidenceScore>,
    collisions: Vec<crate::store::CollisionRow>,
    event_count: i64,
    active_agents: Vec<String>,
}

/// Start the background event streamer. Call once during app setup.
pub fn start(app: &AppHandle) {
    let handle = app.clone();

    std::thread::spawn(move || {
        let mut last_id: i64 = 0;

        // Initialize last_id from current max.
        let db_path = default_db_path();
        if db_path.exists() {
            if let Ok(store) = Store::open(&db_path) {
                last_id = store.max_event_id().unwrap_or(0);
            }
        }

        loop {
            std::thread::sleep(std::time::Duration::from_millis(POLL_INTERVAL_MS));

            let db_path = default_db_path();
            if !db_path.exists() {
                continue;
            }

            let store = match Store::open(&db_path) {
                Ok(s) => s,
                Err(_) => continue,
            };

            // Check for new events.
            let new_events = match store.query_events_after(last_id, 100) {
                Ok(events) => events,
                Err(_) => continue,
            };

            if !new_events.is_empty() {
                if let Some(max) = new_events.iter().map(|e| e.id).max() {
                    last_id = max;
                }

                // Gather full state for the payload.
                let scores = store.query_confidence_scores().unwrap_or_default();
                let collisions = store.query_collisions().unwrap_or_default();
                let event_count = store.query_event_count().unwrap_or(0);
                let active_agents = store.query_active_agents().unwrap_or_default();

                let payload = StreamPayload {
                    events: new_events,
                    scores,
                    collisions,
                    event_count,
                    active_agents,
                };

                let _ = handle.emit("vigil://stream", &payload);
            }
        }
    });
}
