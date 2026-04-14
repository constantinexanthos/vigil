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

    pub fn query_commit_groups(&self, hours: i64) -> Result<Vec<CommitGroup>> {
        let since = format!("-{hours} hours");

        // Get all git_commit events
        let mut commit_stmt = self.conn.prepare(
            "SELECT id, timestamp, agent, diff, session_id FROM events
             WHERE kind = 'git_commit' AND timestamp >= datetime('now', ?1)
             ORDER BY timestamp DESC",
        )?;

        let commits: Vec<(i64, String, String, Option<String>, Option<String>)> = commit_stmt
            .query_map(params![since], |row| {
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

        let mut groups = Vec::new();

        for (_commit_id, ts, agent, diff_field, session_id) in &commits {
            // Parse commit hash and message from diff field (format: "hash message")
            let (hash, message) = match diff_field {
                Some(d) => {
                    let parts: Vec<&str> = d.splitn(2, ' ').collect();
                    (
                        parts.first().unwrap_or(&"").to_string(),
                        parts.get(1).unwrap_or(&"").to_string(),
                    )
                }
                None => ("unknown".to_string(), String::new()),
            };

            // Find file events within 60 seconds before this commit by the same agent
            let mut file_stmt = self.conn.prepare(
                "SELECT file_path, kind, diff FROM events
                 WHERE agent = ?1
                   AND kind IN ('file_create', 'file_modify', 'file_delete')
                   AND file_path IS NOT NULL
                   AND julianday(?2) - julianday(timestamp) BETWEEN 0 AND (60.0/86400.0)
                 GROUP BY file_path
                 ORDER BY timestamp DESC",
            )?;

            let files: Vec<FileChange> = file_stmt
                .query_map(params![agent, ts], |row| {
                    let path: String = row.get(0)?;
                    let kind: String = row.get(1)?;
                    let diff: Option<String> = row.get(2)?;
                    let (added, removed) =
                        diff.as_ref().map(|d| count_diff_lines(d)).unwrap_or((0, 0));
                    Ok(FileChange {
                        path,
                        kind,
                        added,
                        removed,
                    })
                })?
                .filter_map(|r| r.ok())
                .collect();

            // Get cost for this session/time window
            let cost: f64 = if let Some(sid) = session_id {
                self.conn
                    .query_row(
                        "SELECT COALESCE(SUM(cost_usd), 0.0) FROM cost_events WHERE session_id = ?1",
                        params![sid],
                        |row| row.get(0),
                    )
                    .unwrap_or(0.0)
            } else {
                0.0
            };

            // Simple confidence heuristic
            let file_count = files.len() as u32;
            let confidence = if file_count == 0 {
                50
            } else if file_count <= 5 {
                85
            } else if file_count <= 15 {
                70
            } else {
                50
            };

            groups.push(CommitGroup {
                commit_hash: hash,
                commit_message: message,
                agent: agent.clone(),
                timestamp: ts.clone(),
                files,
                confidence_score: confidence,
                cost_usd: cost,
            });
        }

        Ok(groups)
    }

    pub fn query_workspace_summary(&self) -> Result<WorkspaceSummaryRow> {
        let commits_today: i64 = self.conn.query_row(
            "SELECT COUNT(*) FROM events WHERE kind = 'git_commit' AND timestamp >= date('now')",
            [],
            |row| row.get(0),
        )?;

        let files_changed_today: i64 = self.conn.query_row(
            "SELECT COUNT(DISTINCT file_path) FROM events WHERE file_path IS NOT NULL AND kind IN ('file_create', 'file_modify', 'file_delete') AND timestamp >= date('now')",
            [],
            |row| row.get(0),
        )?;

        // Cost (gracefully handle missing table)
        let total_cost_today: f64 = self
            .conn
            .query_row(
                "SELECT COALESCE(SUM(cost_usd), 0.0) FROM cost_events WHERE timestamp >= date('now')",
                [],
                |row| row.get(0),
            )
            .unwrap_or(0.0);

        // Agent commit counts
        let mut agent_stmt = self.conn.prepare(
            "SELECT agent, COUNT(*) FROM events WHERE kind = 'git_commit' AND timestamp >= date('now') GROUP BY agent ORDER BY COUNT(*) DESC",
        )?;
        let agent_commits: Vec<AgentCommitCount> = agent_stmt
            .query_map([], |row| {
                Ok(AgentCommitCount {
                    agent: row.get(0)?,
                    commit_count: row.get(1)?,
                })
            })?
            .filter_map(|r| r.ok())
            .collect();

        let active_collisions = self.query_collisions()?;

        Ok(WorkspaceSummaryRow {
            commits_today,
            files_changed_today,
            total_cost_today,
            agent_commits,
            active_collisions,
        })
    }

    /// Cost summary by agent for the last N hours.
    pub fn query_cost_summary(&self, hours: i64) -> Result<CostTotalRow> {
        // Check if cost_events table exists (daemon may not have created it yet).
        let table_exists: bool = self.conn.query_row(
            "SELECT COUNT(*) > 0 FROM sqlite_master WHERE type='table' AND name='cost_events'",
            [],
            |row| row.get(0),
        )?;

        if !table_exists {
            return Ok(CostTotalRow {
                total_cost_usd: 0.0,
                agents: vec![],
            });
        }

        let since = format!("-{hours} hours");
        let total: f64 = self.conn.query_row(
            "SELECT COALESCE(SUM(cost_usd), 0.0) FROM cost_events WHERE timestamp >= datetime('now', ?1)",
            params![since],
            |row| row.get(0),
        )?;

        let mut stmt = self.conn.prepare(
            "SELECT agent,
                    SUM(cost_usd), SUM(input_tokens), SUM(output_tokens),
                    SUM(cache_read_tokens), SUM(cache_write_tokens), COUNT(*)
             FROM cost_events
             WHERE timestamp >= datetime('now', ?1)
             GROUP BY agent
             ORDER BY SUM(cost_usd) DESC",
        )?;

        let rows = stmt.query_map(params![since], |row| {
            Ok(CostSummaryRow {
                agent: row.get(0)?,
                total_cost_usd: row.get(1)?,
                input_tokens: row.get(2)?,
                output_tokens: row.get(3)?,
                cache_read_tokens: row.get(4)?,
                cache_write_tokens: row.get(5)?,
                event_count: row.get(6)?,
            })
        })?;

        let agents: Vec<CostSummaryRow> = rows.filter_map(|r| r.ok()).collect();

        Ok(CostTotalRow {
            total_cost_usd: total,
            agents,
        })
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

#[derive(Debug, Clone, serde::Serialize)]
pub struct CostSummaryRow {
    pub agent: String,
    pub total_cost_usd: f64,
    pub input_tokens: i64,
    pub output_tokens: i64,
    pub cache_read_tokens: i64,
    pub cache_write_tokens: i64,
    pub event_count: i64,
}

#[derive(Debug, Clone, serde::Serialize)]
pub struct CostTotalRow {
    pub total_cost_usd: f64,
    pub agents: Vec<CostSummaryRow>,
}

#[derive(Debug, Clone, serde::Serialize)]
pub struct FileChange {
    pub path: String,
    pub kind: String,
    pub added: i64,
    pub removed: i64,
}

#[derive(Debug, Clone, serde::Serialize)]
pub struct CommitGroup {
    pub commit_hash: String,
    pub commit_message: String,
    pub agent: String,
    pub timestamp: String,
    pub files: Vec<FileChange>,
    pub confidence_score: u32,
    pub cost_usd: f64,
}

#[derive(Debug, Clone, serde::Serialize)]
pub struct WorkspaceSummaryRow {
    pub commits_today: i64,
    pub files_changed_today: i64,
    pub total_cost_today: f64,
    pub agent_commits: Vec<AgentCommitCount>,
    pub active_collisions: Vec<CollisionRow>,
}

#[derive(Debug, Clone, serde::Serialize)]
pub struct AgentCommitCount {
    pub agent: String,
    pub commit_count: i64,
}

fn count_diff_lines(diff: &str) -> (i64, i64) {
    let mut added = 0i64;
    let mut removed = 0i64;
    for line in diff.lines() {
        if line.starts_with('+') && !line.starts_with("+++") {
            added += 1;
        }
        if line.starts_with('-') && !line.starts_with("---") {
            removed += 1;
        }
    }
    (added, removed)
}
