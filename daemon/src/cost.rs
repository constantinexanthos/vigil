//! Cost intelligence module.
//!
//! Extracts token usage and cost data from hook event metadata stored in the
//! events table, and provides aggregation queries for burn rate analysis.

use chrono::{DateTime, Utc};
use rusqlite::{params, Connection, Result};
use serde::{Deserialize, Serialize};

/// Per-event cost record extracted from hook metadata.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CostRecord {
    pub event_id: i64,
    pub timestamp: String,
    pub agent: String,
    pub session_id: Option<String>,
    pub model: Option<String>,
    pub input_tokens: u64,
    pub output_tokens: u64,
    pub cache_read_tokens: u64,
    pub cache_write_tokens: u64,
    pub cost_usd: f64,
}

/// Aggregated cost summary for a given scope.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CostSummary {
    pub agent: String,
    pub total_input_tokens: u64,
    pub total_output_tokens: u64,
    pub total_cache_read_tokens: u64,
    pub total_cache_write_tokens: u64,
    pub total_cost_usd: f64,
    pub event_count: u64,
}

/// Per-session cost breakdown.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SessionCost {
    pub session_id: String,
    pub agent: String,
    pub model: Option<String>,
    pub input_tokens: u64,
    pub output_tokens: u64,
    pub cache_read_tokens: u64,
    pub cache_write_tokens: u64,
    pub cost_usd: f64,
    pub event_count: u64,
    pub first_seen: String,
    pub last_seen: String,
}

/// Initialize the cost_events table. Called during store schema init.
pub fn init_cost_schema(conn: &Connection) -> Result<()> {
    conn.execute_batch(
        "
        CREATE TABLE IF NOT EXISTS cost_events (
            id                  INTEGER PRIMARY KEY AUTOINCREMENT,
            event_id            INTEGER NOT NULL UNIQUE,
            timestamp           TEXT NOT NULL,
            agent               TEXT NOT NULL,
            session_id          TEXT,
            model               TEXT,
            input_tokens        INTEGER NOT NULL DEFAULT 0,
            output_tokens       INTEGER NOT NULL DEFAULT 0,
            cache_read_tokens   INTEGER NOT NULL DEFAULT 0,
            cache_write_tokens  INTEGER NOT NULL DEFAULT 0,
            cost_usd            REAL NOT NULL DEFAULT 0.0
        );

        CREATE INDEX IF NOT EXISTS idx_cost_timestamp ON cost_events(timestamp);
        CREATE INDEX IF NOT EXISTS idx_cost_agent ON cost_events(agent);
        CREATE INDEX IF NOT EXISTS idx_cost_session ON cost_events(session_id);

        -- Issue #1: same wrap-the-timestamp problem on cost_events. The
        -- get_cost_summary path filters with `datetime(timestamp) >= ?`
        -- and often by agent too.
        CREATE INDEX IF NOT EXISTS idx_cost_dt_timestamp ON cost_events(datetime(timestamp));
        CREATE INDEX IF NOT EXISTS idx_cost_agent_dt     ON cost_events(agent, datetime(timestamp));
        ",
    )
}

/// Extract cost data from a hook event's metadata JSON and insert into cost_events.
/// Returns true if a cost record was inserted, false if metadata had no cost info.
pub fn extract_and_store_cost(
    conn: &Connection,
    event_id: i64,
    timestamp: &DateTime<Utc>,
    agent: &str,
    session_id: Option<&str>,
    metadata_json: &str,
) -> Result<bool> {
    let meta: serde_json::Value = match serde_json::from_str(metadata_json) {
        Ok(v) => v,
        Err(_) => return Ok(false),
    };

    // Extract token usage — may be nested under "token_usage" or at top level.
    let token_usage = meta.get("token_usage");
    let cost_usd = meta
        .get("cost_usd")
        .and_then(|v| v.as_f64())
        .unwrap_or(0.0);

    let input_tokens = token_usage
        .and_then(|t| t.get("input_tokens"))
        .and_then(|v| v.as_u64())
        .unwrap_or(0);
    let output_tokens = token_usage
        .and_then(|t| t.get("output_tokens"))
        .and_then(|v| v.as_u64())
        .unwrap_or(0);
    let cache_read_tokens = token_usage
        .and_then(|t| t.get("cache_read_tokens"))
        .and_then(|v| v.as_u64())
        .unwrap_or(0);
    let cache_write_tokens = token_usage
        .and_then(|t| t.get("cache_write_tokens"))
        .and_then(|v| v.as_u64())
        .unwrap_or(0);

    // Only insert if we have some cost-related data.
    if cost_usd == 0.0 && input_tokens == 0 && output_tokens == 0 {
        return Ok(false);
    }

    let model = meta.get("model").and_then(|v| v.as_str());

    // Compute cost if not provided but tokens are available.
    let final_cost = if cost_usd > 0.0 {
        cost_usd
    } else {
        estimate_cost(model.unwrap_or(""), input_tokens, output_tokens, cache_read_tokens, cache_write_tokens)
    };

    conn.execute(
        "INSERT OR IGNORE INTO cost_events
            (event_id, timestamp, agent, session_id, model, input_tokens, output_tokens,
             cache_read_tokens, cache_write_tokens, cost_usd)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)",
        params![
            event_id,
            timestamp.to_rfc3339(),
            agent,
            session_id,
            model,
            input_tokens as i64,
            output_tokens as i64,
            cache_read_tokens as i64,
            cache_write_tokens as i64,
            final_cost,
        ],
    )?;

    Ok(true)
}

/// Estimate cost from token counts when the provider doesn't report cost directly.
/// Rates are approximate and based on public pricing as of April 2026.
fn estimate_cost(
    model: &str,
    input_tokens: u64,
    output_tokens: u64,
    cache_read_tokens: u64,
    cache_write_tokens: u64,
) -> f64 {
    // Per-million-token pricing.
    let (input_rate, output_rate, cache_read_rate, cache_write_rate) = if model.contains("opus") {
        (15.0, 75.0, 1.5, 18.75)
    } else if model.contains("sonnet") {
        (3.0, 15.0, 0.3, 3.75)
    } else if model.contains("haiku") {
        (0.25, 1.25, 0.025, 0.3)
    } else if model.contains("gpt-4") || model.contains("codex") {
        (2.5, 10.0, 0.0, 0.0) // GPT-4o approximate
    } else {
        (3.0, 15.0, 0.3, 3.75) // Default to Sonnet-tier
    };

    let per_m = 1_000_000.0;
    (input_tokens as f64 / per_m * input_rate)
        + (output_tokens as f64 / per_m * output_rate)
        + (cache_read_tokens as f64 / per_m * cache_read_rate)
        + (cache_write_tokens as f64 / per_m * cache_write_rate)
}

/// Query cost summaries aggregated by agent within a time window.
pub fn cost_by_agent(conn: &Connection, since: &DateTime<Utc>) -> Result<Vec<CostSummary>> {
    let mut stmt = conn.prepare(
        "SELECT agent,
                SUM(input_tokens), SUM(output_tokens),
                SUM(cache_read_tokens), SUM(cache_write_tokens),
                SUM(cost_usd), COUNT(*)
         FROM cost_events
         WHERE timestamp >= ?1
         GROUP BY agent
         ORDER BY SUM(cost_usd) DESC",
    )?;

    let rows = stmt.query_map(params![since.to_rfc3339()], |row| {
        Ok(CostSummary {
            agent: row.get(0)?,
            total_input_tokens: row.get::<_, i64>(1)? as u64,
            total_output_tokens: row.get::<_, i64>(2)? as u64,
            total_cache_read_tokens: row.get::<_, i64>(3)? as u64,
            total_cache_write_tokens: row.get::<_, i64>(4)? as u64,
            total_cost_usd: row.get(5)?,
            event_count: row.get::<_, i64>(6)? as u64,
        })
    })?;

    rows.collect()
}

/// Query cost breakdown by session within a time window.
pub fn cost_by_session(
    conn: &Connection,
    since: &DateTime<Utc>,
    agent_filter: Option<&str>,
) -> Result<Vec<SessionCost>> {
    let mut sql = String::from(
        "SELECT session_id, agent, model,
                SUM(input_tokens), SUM(output_tokens),
                SUM(cache_read_tokens), SUM(cache_write_tokens),
                SUM(cost_usd), COUNT(*),
                MIN(timestamp), MAX(timestamp)
         FROM cost_events
         WHERE timestamp >= ?1 AND session_id IS NOT NULL",
    );
    let mut param_values: Vec<Box<dyn rusqlite::types::ToSql>> =
        vec![Box::new(since.to_rfc3339())];

    if let Some(agent) = agent_filter {
        sql.push_str(" AND agent = ?2");
        param_values.push(Box::new(agent.to_string()));
    }

    sql.push_str(" GROUP BY session_id ORDER BY MAX(timestamp) DESC");

    let params_ref: Vec<&dyn rusqlite::types::ToSql> =
        param_values.iter().map(|p| p.as_ref()).collect();

    let mut stmt = conn.prepare(&sql)?;
    let rows = stmt.query_map(params_ref.as_slice(), |row| {
        Ok(SessionCost {
            session_id: row.get(0)?,
            agent: row.get(1)?,
            model: row.get(2)?,
            input_tokens: row.get::<_, i64>(3)? as u64,
            output_tokens: row.get::<_, i64>(4)? as u64,
            cache_read_tokens: row.get::<_, i64>(5)? as u64,
            cache_write_tokens: row.get::<_, i64>(6)? as u64,
            cost_usd: row.get(7)?,
            event_count: row.get::<_, i64>(8)? as u64,
            first_seen: row.get(9)?,
            last_seen: row.get(10)?,
        })
    })?;

    rows.collect()
}

/// Total cost within a time window across all agents.
pub fn total_cost(conn: &Connection, since: &DateTime<Utc>) -> Result<f64> {
    conn.query_row(
        "SELECT COALESCE(SUM(cost_usd), 0.0) FROM cost_events WHERE timestamp >= ?1",
        params![since.to_rfc3339()],
        |row| row.get(0),
    )
}

/// Backfill cost_events from existing events that have metadata with cost info.
/// Useful for extracting cost data that was captured before the cost table existed.
pub fn backfill_from_events(conn: &Connection) -> Result<u64> {
    let mut stmt = conn.prepare(
        "SELECT id, timestamp, agent, session_id, metadata
         FROM events
         WHERE metadata IS NOT NULL
           AND id NOT IN (SELECT event_id FROM cost_events)",
    )?;

    let mut count = 0u64;
    let rows: Vec<(i64, String, String, Option<String>, String)> = stmt
        .query_map([], |row| {
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

    for (event_id, ts_str, agent, session_id, metadata) in rows {
        let timestamp = DateTime::parse_from_rfc3339(&ts_str)
            .map(|dt| dt.with_timezone(&Utc))
            .unwrap_or_else(|_| Utc::now());

        if extract_and_store_cost(
            conn,
            event_id,
            &timestamp,
            &agent,
            session_id.as_deref(),
            &metadata,
        )? {
            count += 1;
        }
    }

    Ok(count)
}

#[cfg(test)]
mod tests {
    use super::*;
    use rusqlite::Connection;

    fn test_db() -> Connection {
        let conn = Connection::open_in_memory().unwrap();
        // Create the events table too, since backfill reads from it.
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
            );",
        )
        .unwrap();
        init_cost_schema(&conn).unwrap();
        conn
    }

    #[test]
    fn extract_cost_from_metadata() {
        let conn = test_db();
        let now = Utc::now();
        let metadata = r#"{
            "hook_type": "PostToolUse",
            "tool_name": "Edit",
            "model": "claude-sonnet-4-20250514",
            "cost_usd": 0.003,
            "token_usage": {
                "input_tokens": 1500,
                "output_tokens": 200,
                "cache_read_tokens": 500,
                "cache_write_tokens": null
            }
        }"#;

        let inserted = extract_and_store_cost(&conn, 1, &now, "claude-code", Some("sess-1"), metadata).unwrap();
        assert!(inserted);

        let total = total_cost(&conn, &(now - chrono::Duration::hours(1))).unwrap();
        assert!(total > 0.0);
    }

    #[test]
    fn skip_metadata_without_cost() {
        let conn = test_db();
        let now = Utc::now();
        let metadata = r#"{"hook_type": "Notification", "message": "hello"}"#;

        let inserted = extract_and_store_cost(&conn, 2, &now, "claude-code", None, metadata).unwrap();
        assert!(!inserted);
    }

    #[test]
    fn cost_by_agent_aggregation() {
        let conn = test_db();
        let now = Utc::now();

        for i in 0..3 {
            let meta = format!(
                r#"{{"cost_usd": 0.01, "token_usage": {{"input_tokens": 100, "output_tokens": 50}}}}"#
            );
            extract_and_store_cost(&conn, i + 1, &now, "claude-code", Some("s1"), &meta).unwrap();
        }
        let meta = r#"{"cost_usd": 0.005, "token_usage": {"input_tokens": 80, "output_tokens": 30}}"#;
        extract_and_store_cost(&conn, 10, &now, "cursor", Some("s2"), meta).unwrap();

        let since = now - chrono::Duration::hours(1);
        let summaries = cost_by_agent(&conn, &since).unwrap();
        assert_eq!(summaries.len(), 2);
        assert_eq!(summaries[0].agent, "claude-code");
        assert!((summaries[0].total_cost_usd - 0.03).abs() < 0.001);
        assert_eq!(summaries[0].event_count, 3);
    }

    #[test]
    fn cost_by_session_breakdown() {
        let conn = test_db();
        let now = Utc::now();

        let meta = r#"{"cost_usd": 0.05, "model": "claude-opus-4-6", "token_usage": {"input_tokens": 5000, "output_tokens": 1000}}"#;
        extract_and_store_cost(&conn, 1, &now, "claude-code", Some("session-abc"), meta).unwrap();

        let since = now - chrono::Duration::hours(1);
        let sessions = cost_by_session(&conn, &since, None).unwrap();
        assert_eq!(sessions.len(), 1);
        assert_eq!(sessions[0].session_id, "session-abc");
        assert_eq!(sessions[0].model.as_deref(), Some("claude-opus-4-6"));
    }

    #[test]
    fn backfill_extracts_from_events() {
        let conn = test_db();
        let now = Utc::now();

        // Insert events with metadata directly into events table.
        conn.execute(
            "INSERT INTO events (timestamp, kind, agent, session_id, metadata)
             VALUES (?1, 'file_modify', 'claude-code', 'sess-1', ?2)",
            params![
                now.to_rfc3339(),
                r#"{"cost_usd": 0.02, "token_usage": {"input_tokens": 1000, "output_tokens": 500}}"#,
            ],
        )
        .unwrap();

        let count = backfill_from_events(&conn).unwrap();
        assert_eq!(count, 1);

        let total = total_cost(&conn, &(now - chrono::Duration::hours(1))).unwrap();
        assert!((total - 0.02).abs() < 0.001);

        // Running again should not duplicate.
        let count2 = backfill_from_events(&conn).unwrap();
        assert_eq!(count2, 0);
    }

    #[test]
    fn estimate_cost_opus() {
        let cost = estimate_cost("claude-opus-4-6", 1_000_000, 1_000_000, 0, 0);
        // Input: $15/M, Output: $75/M = $90
        assert!((cost - 90.0).abs() < 0.01);
    }

    #[test]
    fn estimate_cost_sonnet() {
        let cost = estimate_cost("claude-sonnet-4-6", 1_000_000, 1_000_000, 0, 0);
        // Input: $3/M, Output: $15/M = $18
        assert!((cost - 18.0).abs() < 0.01);
    }
}
