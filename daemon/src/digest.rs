use chrono::{Duration, Utc};
use serde::Serialize;

use crate::cost;
use crate::hallucination;
use crate::rollback;
use crate::store::Store;

#[derive(Debug, Clone, Serialize)]
pub struct LiveSummary {
    pub active_session_count: u64,
    pub total_events_1h: u64,
    pub total_cost_1h: Option<f64>,
    pub burn_rate_per_min: Option<f64>,
    pub burn_rate_partial: bool,
    pub cost_tracked_agents: Vec<String>,
    pub agents: Vec<AgentSummary>,
    pub alerts: Vec<Alert>,
    pub hotspots: Vec<(String, Vec<String>)>,
}

#[derive(Debug, Clone, Serialize)]
pub struct AgentSummary {
    pub agent: String,
    pub status: String,
    pub current_file: Option<String>,
    pub events_1h: u64,
    pub cost_1h: Option<f64>,
    pub confidence: Option<f64>,
    pub hallucinations: u64,
}

#[derive(Debug, Clone, Serialize)]
pub struct Alert {
    pub severity: String,
    pub message: String,
    pub timestamp: String,
}

pub fn generate_live_summary(store: &Store) -> LiveSummary {
    let now = Utc::now();
    let one_hour_ago = now - Duration::hours(1);
    let two_min_ago = now - Duration::minutes(2);
    let five_min_ago = now - Duration::minutes(5);
    let conn = store.conn();

    let one_hour_ago_str = one_hour_ago.to_rfc3339();
    let two_min_ago_str = two_min_ago.to_rfc3339();
    let two_hours_ago_str = (now - Duration::hours(2)).to_rfc3339();

    // Total events in last hour
    let total_events_1h: u64 = conn
        .query_row(
            "SELECT COUNT(*) FROM events WHERE timestamp >= ?1",
            rusqlite::params![one_hour_ago_str],
            |row| row.get::<_, i64>(0),
        )
        .unwrap_or(0) as u64;

    // Total cost in last hour (only from agents with cost tracking)
    let raw_cost_1h = cost::total_cost(conn, &one_hour_ago).unwrap_or(0.0);

    // Per-agent data
    let agents_list: Vec<String> = conn
        .prepare("SELECT DISTINCT agent FROM events WHERE timestamp >= ?1 ORDER BY agent")
        .and_then(|mut stmt| {
            let rows = stmt.query_map(rusqlite::params![one_hour_ago_str], |row| row.get(0))?;
            rows.collect()
        })
        .unwrap_or_default();

    let mut agents = Vec::new();
    let mut new_agents: Vec<String> = Vec::new();

    let prior_agents: Vec<String> = conn
        .prepare("SELECT DISTINCT agent FROM events WHERE timestamp >= ?1 AND timestamp < ?2")
        .and_then(|mut stmt| {
            let rows = stmt.query_map(rusqlite::params![two_hours_ago_str, one_hour_ago_str], |row| row.get(0))?;
            rows.collect()
        })
        .unwrap_or_default();

    for agent in &agents_list {
        let events_1h: u64 = conn
            .query_row(
                "SELECT COUNT(*) FROM events WHERE agent = ?1 AND timestamp >= ?2",
                rusqlite::params![agent, one_hour_ago_str],
                |row| row.get::<_, i64>(0),
            )
            .unwrap_or(0) as u64;

        let recent_count: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM events WHERE agent = ?1 AND timestamp >= ?2",
                rusqlite::params![agent, two_min_ago_str],
                |row| row.get(0),
            )
            .unwrap_or(0);
        let status = if recent_count > 0 { "active" } else { "idle" };

        let current_file: Option<String> = conn
            .query_row(
                "SELECT file_path FROM events WHERE agent = ?1 AND file_path IS NOT NULL ORDER BY timestamp DESC LIMIT 1",
                rusqlite::params![agent],
                |row| row.get(0),
            )
            .ok();

        // Cost: None if this agent has no cost data at all
        let agent_costs = cost::cost_by_agent(conn, &one_hour_ago).unwrap_or_default();
        let cost_1h = agent_costs.iter().find(|c| c.agent == *agent).map(|c| c.total_cost_usd);

        let confidence = get_latest_confidence(store, agent);
        let hallucinations = hallucination::count_unresolved(conn, agent).unwrap_or(0) as u64;

        if !prior_agents.contains(agent) {
            new_agents.push(agent.clone());
        }

        agents.push(AgentSummary {
            agent: agent.clone(),
            status: status.to_string(),
            current_file,
            events_1h,
            cost_1h,
            confidence,
            hallucinations,
        });
    }

    let active_session_count = agents.iter().filter(|a| a.status == "active").count() as u64;
    let hotspots = store.file_collisions(&five_min_ago).unwrap_or_default();

    // Alerts
    let mut alerts = Vec::new();
    let now_str = now.to_rfc3339();

    for (file, file_agents) in &hotspots {
        alerts.push(Alert {
            severity: "critical".to_string(),
            message: format!("COLLISION {} -- {}", file, file_agents.join(", ")),
            timestamp: now_str.clone(),
        });
    }

    for agent in &agents {
        if let Some(conf) = agent.confidence {
            if conf < 30.0 && agent.status == "active" {
                alerts.push(Alert {
                    severity: "critical".to_string(),
                    message: format!("{}: confidence {:.0} (critically low)", agent.agent, conf),
                    timestamp: now_str.clone(),
                });
            }
        }
    }

    let burn_rate_per_hour = if raw_cost_1h > 0.0 { raw_cost_1h } else { 0.0 };
    if burn_rate_per_hour > 5.0 {
        alerts.push(Alert {
            severity: "warning".to_string(),
            message: format!("Burn rate ${:.2}/hr exceeds $5/hr threshold", burn_rate_per_hour),
            timestamp: now_str.clone(),
        });
    }

    for agent in &agents {
        if agent.hallucinations > 0 {
            alerts.push(Alert {
                severity: "warning".to_string(),
                message: format!("{}: {} unresolved hallucination(s)", agent.agent, agent.hallucinations),
                timestamp: now_str.clone(),
            });
        }
    }

    for agent in &agents {
        if agent.status == "active" {
            let file_count: i64 = conn
                .query_row(
                    "SELECT COUNT(DISTINCT file_path) FROM events WHERE agent = ?1 AND file_path IS NOT NULL AND timestamp >= ?2",
                    rusqlite::params![agent.agent, one_hour_ago_str],
                    |row| row.get(0),
                )
                .unwrap_or(0);
            if file_count >= 30 {
                alerts.push(Alert {
                    severity: "warning".to_string(),
                    message: format!("{}: touching {} files (scope creep)", agent.agent, file_count),
                    timestamp: now_str.clone(),
                });
            }
        }
    }

    for agent in &new_agents {
        alerts.push(Alert {
            severity: "info".to_string(),
            message: format!("New agent detected: {}", agent),
            timestamp: now_str.clone(),
        });
    }

    // Cost tracking metadata
    let cost_tracked_agents: Vec<String> = agents.iter()
        .filter(|a| a.cost_1h.is_some())
        .map(|a| a.agent.clone())
        .collect();
    let has_any_cost = !cost_tracked_agents.is_empty();
    let all_agents_tracked = cost_tracked_agents.len() == agents.len();
    let burn_rate_partial = has_any_cost && !all_agents_tracked;
    let total_cost_1h = if has_any_cost { Some(raw_cost_1h) } else { None };
    let burn_rate_per_min = total_cost_1h.map(|c| if c > 0.0 { c / 60.0 } else { 0.0 });

    LiveSummary {
        active_session_count,
        total_events_1h,
        total_cost_1h,
        burn_rate_per_min,
        burn_rate_partial,
        cost_tracked_agents,
        agents,
        alerts,
        hotspots,
    }
}

fn get_latest_confidence(store: &Store, agent: &str) -> Option<f64> {
    let one_hour_ago = Utc::now() - Duration::hours(1);
    let sessions = rollback::get_sessions(store.conn(), &one_hour_ago, Some(agent)).unwrap_or_default();
    sessions.first().map(|s| {
        let fc = s.file_count as i32;
        if fc <= 5 { 85.0 } else if fc <= 15 { 70.0 } else { 50.0 }
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::store::{AgentEvent, EventKind};

    fn make_event(agent: &str, file: Option<&str>, minutes_ago: i64) -> AgentEvent {
        AgentEvent {
            id: None,
            timestamp: Utc::now() - Duration::minutes(minutes_ago),
            kind: EventKind::FileModify,
            file_path: file.map(|s| s.to_string()),
            agent: agent.to_string(),
            session_id: None,
            repo_path: None,
            branch: None,
            diff: None,
            metadata: None,
            host_kind: None,
            model: None,
            is_live: false,
        }
    }

    #[test]
    fn empty_store_returns_empty_summary() {
        let store = Store::open_in_memory().unwrap();
        let s = generate_live_summary(&store);
        assert_eq!(s.active_session_count, 0);
        assert_eq!(s.total_events_1h, 0);
        assert_eq!(s.total_cost_1h, None);
        assert!(s.agents.is_empty());
        assert!(s.alerts.is_empty());
    }

    #[test]
    fn agent_status_active_vs_idle() {
        let store = Store::open_in_memory().unwrap();
        store.insert(&make_event("claude-code", Some("a.rs"), 1)).unwrap();
        store.insert(&make_event("cursor", Some("b.rs"), 30)).unwrap();
        let s = generate_live_summary(&store);
        let claude = s.agents.iter().find(|a| a.agent == "claude-code").unwrap();
        let cursor = s.agents.iter().find(|a| a.agent == "cursor").unwrap();
        assert_eq!(claude.status, "active");
        assert_eq!(cursor.status, "idle");
    }

    #[test]
    fn active_session_count_tracks_active_only() {
        let store = Store::open_in_memory().unwrap();
        store.insert(&make_event("claude-code", Some("a.rs"), 1)).unwrap();
        store.insert(&make_event("cursor", Some("b.rs"), 1)).unwrap();
        store.insert(&make_event("aider", Some("c.rs"), 30)).unwrap();
        assert_eq!(generate_live_summary(&store).active_session_count, 2);
    }

    #[test]
    fn total_events_counted() {
        let store = Store::open_in_memory().unwrap();
        for i in 0..5 {
            store.insert(&make_event("claude-code", Some(&format!("f{i}.rs")), 10)).unwrap();
        }
        assert_eq!(generate_live_summary(&store).total_events_1h, 5);
    }

    #[test]
    fn burn_rate_none_without_cost() {
        let store = Store::open_in_memory().unwrap();
        store.insert(&make_event("claude-code", Some("a.rs"), 5)).unwrap();
        let s = generate_live_summary(&store);
        assert_eq!(s.burn_rate_per_min, None);
        assert_eq!(s.total_cost_1h, None);
    }

    #[test]
    fn collision_generates_critical_alert() {
        let store = Store::open_in_memory().unwrap();
        store.insert(&make_event("claude-code", Some("shared.rs"), 1)).unwrap();
        store.insert(&make_event("cursor", Some("shared.rs"), 1)).unwrap();
        let s = generate_live_summary(&store);
        assert!(!s.hotspots.is_empty());
        assert!(s.alerts.iter().any(|a| a.severity == "critical" && a.message.contains("COLLISION")));
    }

    #[test]
    fn current_file_tracks_latest() {
        let store = Store::open_in_memory().unwrap();
        store.insert(&make_event("claude-code", Some("old.rs"), 10)).unwrap();
        store.insert(&make_event("claude-code", Some("new.rs"), 1)).unwrap();
        let s = generate_live_summary(&store);
        let claude = s.agents.iter().find(|a| a.agent == "claude-code").unwrap();
        assert_eq!(claude.current_file.as_deref(), Some("new.rs"));
    }

    #[test]
    fn per_agent_event_count() {
        let store = Store::open_in_memory().unwrap();
        for _ in 0..3 { store.insert(&make_event("claude-code", Some("a.rs"), 5)).unwrap(); }
        store.insert(&make_event("cursor", Some("b.rs"), 5)).unwrap();
        let s = generate_live_summary(&store);
        assert_eq!(s.agents.iter().find(|a| a.agent == "claude-code").unwrap().events_1h, 3);
        assert_eq!(s.agents.iter().find(|a| a.agent == "cursor").unwrap().events_1h, 1);
    }

    #[test]
    fn cost_none_for_agents_without_cost_data() {
        let store = Store::open_in_memory().unwrap();
        store.insert(&make_event("cursor", Some("a.rs"), 5)).unwrap();
        let s = generate_live_summary(&store);
        assert_eq!(s.agents[0].cost_1h, None);
        assert!(!s.burn_rate_partial);
    }
}
