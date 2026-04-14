use rusqlite::{params, Connection, Result};
use std::path::{Path, PathBuf};

pub struct Store {
    conn: Connection,
}

/// Returns ~/.vigil/vigil.db
pub fn default_db_path() -> PathBuf {
    home::home_dir()
        .expect("cannot determine home directory")
        .join(".vigil")
        .join("vigil.db")
}

impl Store {
    pub fn open(db_path: &Path) -> Result<Self> {
        let conn = Connection::open_with_flags(
            db_path,
            rusqlite::OpenFlags::SQLITE_OPEN_READ_ONLY | rusqlite::OpenFlags::SQLITE_OPEN_NO_MUTEX,
        )?;
        Ok(Self { conn })
    }

    /// Agents with events in the last 10 minutes.
    pub fn query_active_agents(&self) -> Result<Vec<String>> {
        let mut stmt = self.conn.prepare(
            "SELECT DISTINCT agent FROM events
             WHERE timestamp >= datetime('now', '-10 minutes')
             ORDER BY agent",
        )?;
        let rows = stmt.query_map([], |row| row.get(0))?;
        rows.collect()
    }

    pub fn query_recent_events(&self, limit: u32) -> Result<Vec<EventRow>> {
        let mut stmt = self.conn.prepare(
            "SELECT id, timestamp, kind, file_path, agent, diff
             FROM events
             ORDER BY timestamp DESC
             LIMIT ?1",
        )?;
        let rows = stmt.query_map(params![limit as i64], |row| {
            Ok(EventRow {
                id: row.get(0)?,
                timestamp: row.get(1)?,
                kind: row.get(2)?,
                file_path: row.get::<_, Option<String>>(3)?,
                agent: row.get(4)?,
                diff: row.get(5)?,
            })
        })?;
        rows.collect()
    }

    /// Files modified by 2+ agents in the last 5 minutes.
    pub fn query_collisions(&self) -> Result<Vec<CollisionRow>> {
        let mut stmt = self.conn.prepare(
            "SELECT file_path, GROUP_CONCAT(DISTINCT agent) as agents
             FROM events
             WHERE file_path IS NOT NULL
               AND kind IN ('file_create', 'file_modify')
               AND timestamp >= datetime('now', '-5 minutes')
             GROUP BY file_path
             HAVING COUNT(DISTINCT agent) > 1
             ORDER BY file_path",
        )?;
        let rows = stmt.query_map([], |row| {
            let path: String = row.get(0)?;
            let agents_str: String = row.get(1)?;
            let agents: Vec<String> = agents_str.split(',').map(|s| s.to_string()).collect();
            Ok(CollisionRow {
                file_path: path,
                agents,
            })
        })?;
        rows.collect()
    }

    /// Per-agent event counts for today (since midnight UTC).
    pub fn query_agent_stats(&self) -> Result<Vec<AgentStatRow>> {
        let mut stmt = self.conn.prepare(
            "SELECT agent, COUNT(*) as count
             FROM events
             WHERE timestamp >= date('now')
             GROUP BY agent
             ORDER BY count DESC",
        )?;
        let rows = stmt.query_map([], |row| {
            Ok(AgentStatRow {
                agent: row.get(0)?,
                count: row.get(1)?,
            })
        })?;
        rows.collect()
    }

    /// Total event count since midnight UTC today.
    pub fn query_event_count(&self) -> Result<i64> {
        self.conn.query_row(
            "SELECT COUNT(*) FROM events WHERE timestamp >= date('now')",
            [],
            |row| row.get(0),
        )
    }

    /// Query events for a specific agent (for confidence scoring).
    pub fn query_events_for_agent(&self, agent: &str) -> Result<Vec<AgentEventRow>> {
        let mut stmt = self.conn.prepare(
            "SELECT kind, file_path, diff
             FROM events
             WHERE agent = ?1
               AND timestamp >= datetime('now', '-30 minutes')
             ORDER BY timestamp DESC",
        )?;
        let rows = stmt.query_map(params![agent], |row| {
            Ok(AgentEventRow {
                kind: row.get(0)?,
                file_path: row.get(1)?,
                diff: row.get(2)?,
            })
        })?;
        rows.collect()
    }

    /// Get collision file paths (for scoring).
    pub fn query_collision_file_paths(&self) -> Result<Vec<String>> {
        let mut stmt = self.conn.prepare(
            "SELECT file_path
             FROM events
             WHERE file_path IS NOT NULL
               AND kind IN ('file_create', 'file_modify')
               AND timestamp >= datetime('now', '-5 minutes')
             GROUP BY file_path
             HAVING COUNT(DISTINCT agent) > 1",
        )?;
        let rows = stmt.query_map([], |row| row.get(0))?;
        rows.collect()
    }

    /// Compute confidence scores for all active agents.
    pub fn query_confidence_scores(&self) -> Result<Vec<ConfidenceScore>> {
        let agents = self.query_active_agents()?;
        let collision_files = self.query_collision_file_paths().unwrap_or_default();

        let mut scores = Vec::new();
        for agent in &agents {
            let events = self.query_events_for_agent(agent)?;
            let report = score_agent_events(agent, &events, &collision_files);
            scores.push(report);
        }
        Ok(scores)
    }

    /// Get the max event ID (for streaming — poll for id > last_seen).
    pub fn max_event_id(&self) -> Result<i64> {
        self.conn.query_row(
            "SELECT COALESCE(MAX(id), 0) FROM events",
            [],
            |row| row.get(0),
        )
    }

    /// Get events newer than a given ID.
    pub fn query_events_after(&self, after_id: i64, limit: u32) -> Result<Vec<EventRow>> {
        let mut stmt = self.conn.prepare(
            "SELECT id, timestamp, kind, file_path, agent, diff
             FROM events
             WHERE id > ?1
             ORDER BY id ASC
             LIMIT ?2",
        )?;
        let rows = stmt.query_map(params![after_id, limit as i64], |row| {
            Ok(EventRow {
                id: row.get(0)?,
                timestamp: row.get(1)?,
                kind: row.get(2)?,
                file_path: row.get::<_, Option<String>>(3)?,
                agent: row.get(4)?,
                diff: row.get(5)?,
            })
        })?;
        rows.collect()
    }
}

#[derive(Debug, Clone, serde::Serialize)]
pub struct EventRow {
    pub id: i64,
    pub timestamp: String,
    pub kind: String,
    pub file_path: Option<String>,
    pub agent: String,
    pub diff: Option<String>,
}

#[derive(Debug, Clone, serde::Serialize)]
pub struct CollisionRow {
    pub file_path: String,
    pub agents: Vec<String>,
}

#[derive(Debug, Clone, serde::Serialize)]
pub struct AgentStatRow {
    pub agent: String,
    pub count: i64,
}

pub struct AgentEventRow {
    pub kind: String,
    pub file_path: Option<String>,
    pub diff: Option<String>,
}

#[derive(Debug, Clone, serde::Serialize)]
pub struct ConfidenceScore {
    pub agent: String,
    pub score: u32,
    pub file_count: usize,
    pub has_tests: bool,
    pub collision_count: usize,
}

/// Score an agent's recent activity. Mirrors daemon/src/trust.rs logic.
fn score_agent_events(agent: &str, events: &[AgentEventRow], collision_files: &[String]) -> ConfidenceScore {
    use std::collections::{HashMap, HashSet};

    let mut score: i32 = 75;

    let files: HashSet<&str> = events
        .iter()
        .filter_map(|e| e.file_path.as_deref())
        .collect();
    let file_count = files.len();

    // Small scope bonus.
    if file_count <= 3 {
        score += 10;
    } else if file_count > 15 {
        score -= (file_count as i32 - 15).min(20);
    }

    // Self-corrections.
    let mut edit_counts: HashMap<&str, usize> = HashMap::new();
    for e in events {
        if e.kind == "file_modify" || e.kind == "file_create" {
            if let Some(ref p) = e.file_path {
                *edit_counts.entry(p.as_str()).or_default() += 1;
            }
        }
    }
    let self_corrections = edit_counts.values().filter(|&&c| c > 1).count();
    if self_corrections > 0 && self_corrections <= 5 {
        score += 5;
    } else if self_corrections > 5 {
        score -= 5;
    }

    // Tests.
    let has_tests = files.iter().any(|f| {
        let l = f.to_lowercase();
        l.contains("test") || l.contains("spec")
    });
    if has_tests {
        score += 10;
    } else if file_count > 3 {
        score -= 10;
    }

    // All-creates penalty.
    let creates = events.iter().filter(|e| e.kind == "file_create").count();
    let modifies = events.iter().filter(|e| e.kind == "file_modify").count();
    if creates > 5 && modifies == 0 {
        score -= 10;
    }

    // Diff size.
    let total_diff: usize = events.iter().filter_map(|e| e.diff.as_ref()).map(|d| d.len()).sum();
    if total_diff > 50_000 {
        score -= 10;
    } else if total_diff > 0 && total_diff < 5_000 {
        score += 5;
    }

    // Collisions.
    let collision_count = files.iter().filter(|f| collision_files.contains(&f.to_string())).count();
    if collision_count > 0 {
        score -= (collision_count as i32 * 10).min(30);
    }

    // Git commits.
    if events.iter().any(|e| e.kind == "git_commit") {
        score += 5;
    }

    ConfidenceScore {
        agent: agent.to_string(),
        score: score.clamp(0, 100) as u32,
        file_count,
        has_tests,
        collision_count,
    }
}
