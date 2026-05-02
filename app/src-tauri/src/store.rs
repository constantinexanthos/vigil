use chrono::{DateTime, Utc};
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

    /// Construct a Store wrapping an existing connection. Used by tests so
    /// they can populate an in-memory DB and exercise the query layer.
    #[cfg(test)]
    pub fn from_conn(conn: Connection) -> Self {
        Self { conn }
    }

    /// Agents with events in the last 10 minutes.
    pub fn query_active_agents(&self) -> Result<Vec<String>> {
        let mut stmt = self.conn.prepare(
            "SELECT DISTINCT agent FROM events
             WHERE datetime(timestamp) >= datetime('now', '-10 minutes')
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
               AND datetime(timestamp) >= datetime('now', '-5 minutes')
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
             WHERE kind = 'git_commit' AND datetime(timestamp) >= datetime('now', ?1)
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
            "SELECT COALESCE(SUM(cost_usd), 0.0) FROM cost_events WHERE datetime(timestamp) >= datetime('now', ?1)",
            params![since],
            |row| row.get(0),
        )?;

        let mut stmt = self.conn.prepare(
            "SELECT agent,
                    SUM(cost_usd), SUM(input_tokens), SUM(output_tokens),
                    SUM(cache_read_tokens), SUM(cache_write_tokens), COUNT(*)
             FROM cost_events
             WHERE datetime(timestamp) >= datetime('now', ?1)
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

    /// Distinct host_kind values with active session counts over the last N minutes.
    /// Rows with NULL host_kind are reported as "unknown".
    pub fn query_hosts(&self, since_minutes: i64) -> Result<Vec<HostRow>> {
        let since = format!("-{since_minutes} minutes");
        let mut stmt = self.conn.prepare(
            "SELECT COALESCE(host_kind, 'unknown') AS hk, \
                    COUNT(DISTINCT COALESCE(session_id, '')) AS n \
             FROM events \
             WHERE datetime(timestamp) >= datetime('now', ?1) \
               AND COALESCE(session_id, '') != '' \
             GROUP BY hk \
             ORDER BY n DESC",
        )?;
        let rows = stmt.query_map(params![since], |row| {
            Ok(HostRow {
                kind: row.get::<_, String>(0)?,
                active_sessions: row.get::<_, i64>(1)? as u32,
            })
        })?;
        rows.collect()
    }

    /// Live sessions with activity in the last N minutes. UNIONs the events
    /// table (file watcher + JSONL synthetic session_seen rows) with the
    /// session_turns table (raw JSONL turn captures) so a session shows up if
    /// either source has it within the window. When both exist, fields from
    /// the events row win — it carries the richer host/agent/repo/model
    /// metadata; session_turns rows contribute NULL placeholders.
    pub fn query_live_sessions(&self, since_minutes: i64) -> Result<Vec<LiveSessionRow>> {
        let since = format!("-{since_minutes} minutes");
        let mut stmt = self.conn.prepare(
            "WITH s AS ( \
                SELECT session_id, host_kind, agent, repo_path, timestamp, model, is_live \
                FROM events \
                WHERE datetime(timestamp) >= datetime('now', ?1) AND session_id IS NOT NULL \
                UNION ALL \
                SELECT session_id, \
                       NULL AS host_kind, \
                       CASE source \
                            WHEN 'cursor' THEN 'cursor' \
                            WHEN 'codex'  THEN 'codex' \
                            ELSE 'claude-code' \
                       END AS agent, \
                       NULL AS repo_path, \
                       timestamp, \
                       NULL AS model, \
                       0 AS is_live \
                FROM session_turns \
                WHERE datetime(timestamp) >= datetime('now', ?1) AND session_id IS NOT NULL \
            ) \
            SELECT \
                s.session_id, \
                COALESCE(MAX(s.host_kind), 'unknown') AS host_kind, \
                MAX(s.agent) AS agent, \
                MAX(s.repo_path) AS repo_path, \
                MIN(s.timestamp) AS started_at, \
                MAX(s.timestamp) AS ended_at, \
                MAX(s.model) AS model, \
                MAX(s.is_live) AS is_live, \
                COALESCE(MAX(ss.text), '') AS description \
             FROM s \
             LEFT JOIN session_summaries ss ON ss.session_id = s.session_id \
             GROUP BY s.session_id \
             ORDER BY ended_at DESC",
        )?;
        let rows = stmt.query_map(params![since], |row| {
            let is_live: i64 = row.get::<_, Option<i64>>(7)?.unwrap_or(0);
            Ok(LiveSessionRow {
                session_id: row.get::<_, String>(0)?,
                host_kind: row.get::<_, String>(1)?,
                agent: row.get::<_, String>(2)?,
                repo_path: row.get::<_, Option<String>>(3)?,
                started_at: row.get::<_, String>(4)?,
                ended_at: row.get::<_, String>(5)?,
                model: row.get::<_, Option<String>>(6)?,
                is_live: is_live != 0,
                description: row.get::<_, String>(8)?,
                files_added: 0,
                files_removed: 0,
                cost_usd: 0.0,
                confidence: 0,
            })
        })?;
        rows.collect()
    }

    /// Fetch the cached summary row for a session, if present.
    /// Returns (text, generated_at, backend).
    pub fn query_summary(
        &self,
        session_id: &str,
    ) -> Result<Option<(String, String, String)>> {
        let row: Result<(String, String, String)> = self.conn.query_row(
            "SELECT text, generated_at, backend FROM session_summaries WHERE session_id = ?1",
            params![session_id],
            |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
        );
        match row {
            Ok(tup) => Ok(Some(tup)),
            Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
            Err(e) => Err(e),
        }
    }

    /// Retrieve the most recent `limit` turns for a session, ordered ascending by insertion.
    /// Mirrors the daemon's `store::recent_turns`.
    pub fn recent_turns(&self, session_id: &str, limit: i64) -> Result<Vec<SessionTurnRecord>> {
        let mut stmt = self.conn.prepare(
            "SELECT session_id, timestamp, role, text, tool_names, source \
             FROM session_turns WHERE session_id = ?1 \
             ORDER BY id DESC LIMIT ?2",
        )?;
        let rows = stmt.query_map(params![session_id, limit], |row| {
            let ts_str: String = row.get(1)?;
            let tn_str: String = row.get(4)?;
            let tool_names: Vec<String> = serde_json::from_str(&tn_str).unwrap_or_default();
            Ok(SessionTurnRecord {
                session_id: row.get(0)?,
                timestamp: DateTime::parse_from_rfc3339(&ts_str)
                    .map(|dt| dt.with_timezone(&Utc))
                    .unwrap_or_else(|_| Utc::now()),
                role: row.get(2)?,
                text: row.get(3)?,
                tool_names,
                source: row.get(5)?,
            })
        })?;
        let mut out: Vec<SessionTurnRecord> = rows.filter_map(Result::ok).collect();
        out.reverse(); // ascending by insertion
        Ok(out)
    }

    /// Query pull requests from the pull_requests table.
    pub fn query_pull_requests(&self, repo_path: Option<&str>) -> Result<Vec<PrRow>> {
        let table_exists: bool = self.conn.query_row(
            "SELECT COUNT(*) > 0 FROM sqlite_master WHERE type='table' AND name='pull_requests'",
            [],
            |row| row.get(0),
        )?;

        if !table_exists {
            return Ok(vec![]);
        }

        let sql = if repo_path.is_some() {
            "SELECT pr_number, branch, title, state, url, additions, deletions, author, review_decision, repo_path
             FROM pull_requests WHERE repo_path = ?1 ORDER BY pr_number DESC"
        } else {
            "SELECT pr_number, branch, title, state, url, additions, deletions, author, review_decision, repo_path
             FROM pull_requests ORDER BY pr_number DESC"
        };

        let mut stmt = self.conn.prepare(sql)?;
        let rows = if let Some(rp) = repo_path {
            stmt.query_map(params![rp], |row| {
                Ok(PrRow {
                    pr_number: row.get(0)?,
                    branch: row.get(1)?,
                    title: row.get(2)?,
                    state: row.get(3)?,
                    url: row.get(4)?,
                    additions: row.get(5)?,
                    deletions: row.get(6)?,
                    author: row.get(7)?,
                    review_decision: row.get(8)?,
                    repo_path: row.get(9)?,
                })
            })?.collect::<Result<Vec<_>>>()?
        } else {
            stmt.query_map([], |row| {
                Ok(PrRow {
                    pr_number: row.get(0)?,
                    branch: row.get(1)?,
                    title: row.get(2)?,
                    state: row.get(3)?,
                    url: row.get(4)?,
                    additions: row.get(5)?,
                    deletions: row.get(6)?,
                    author: row.get(7)?,
                    review_decision: row.get(8)?,
                    repo_path: row.get(9)?,
                })
            })?.collect::<Result<Vec<_>>>()?
        };
        Ok(rows)
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

#[derive(Debug, Clone, serde::Serialize)]
pub struct HostRow {
    pub kind: String,
    pub active_sessions: u32,
}

#[derive(Debug, Clone, serde::Serialize)]
pub struct LiveSessionRow {
    pub session_id: String,
    pub host_kind: String,
    pub agent: String,
    pub repo_path: Option<String>,
    pub started_at: String,
    pub ended_at: String,
    pub model: Option<String>,
    pub is_live: bool,
    pub description: String,
    pub files_added: u32,
    pub files_removed: u32,
    pub cost_usd: f64,
    pub confidence: u32,
}

#[derive(Debug, Clone)]
pub struct SessionTurnRecord {
    pub session_id: String,
    pub timestamp: DateTime<Utc>,
    pub role: String,
    pub text: String,
    pub tool_names: Vec<String>,
    pub source: String,
}

#[derive(Debug, Clone, serde::Serialize)]
pub struct PrRow {
    pub pr_number: u32,
    pub branch: Option<String>,
    pub title: Option<String>,
    pub state: Option<String>,
    pub url: Option<String>,
    pub additions: u32,
    pub deletions: u32,
    pub author: Option<String>,
    pub review_decision: Option<String>,
    pub repo_path: String,
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

#[derive(Debug, Clone, serde::Serialize)]
pub struct LiveSummaryRow {
    pub active_session_count: u64,
    pub total_events_1h: u64,
    pub total_cost_1h: Option<f64>,
    pub burn_rate_per_min: Option<f64>,
    pub burn_rate_partial: bool,
    pub cost_tracked_agents: Vec<String>,
    pub agents: Vec<AgentSummaryRow>,
    pub alerts: Vec<AlertRow>,
    pub hotspots: Vec<HotspotRow>,
}

#[derive(Debug, Clone, serde::Serialize)]
pub struct HourBucketRow {
    pub hour_iso: String,
    pub by_agent: Vec<AgentCount>,
}

#[derive(Debug, Clone, serde::Serialize)]
pub struct AgentCount {
    pub agent: String,
    pub count: u32,
}

#[derive(Debug, Clone, serde::Serialize)]
pub struct AgentSummaryRow {
    pub agent: String,
    pub status: String,
    pub current_file: Option<String>,
    pub events_1h: u64,
    pub cost_1h: Option<f64>,
    pub confidence: Option<f64>,
    pub hallucinations: u64,
}

#[derive(Debug, Clone, serde::Serialize)]
pub struct AlertRow {
    pub severity: String,
    pub message: String,
}

#[derive(Debug, Clone, serde::Serialize)]
pub struct HotspotRow {
    pub file_path: String,
    pub agents: Vec<String>,
}

#[derive(Debug, Clone, serde::Serialize)]
pub struct ReviewSignalsRow {
    pub confidence: u32,
    pub confidence_reason: String,
    pub file_count: u32,
    pub has_tests: bool,
    pub collisions: Vec<CollisionRow>,
}

impl Store {
    pub fn query_live_summary(&self) -> Result<LiveSummaryRow> {
        let total_events_1h: u64 = self.conn.query_row(
            "SELECT COUNT(*) FROM events WHERE datetime(timestamp) >= datetime('now', '-1 hour')",
            [], |row| row.get::<_, i64>(0),
        ).unwrap_or(0) as u64;

        let has_cost_table: bool = self.conn.query_row(
            "SELECT COUNT(*) > 0 FROM sqlite_master WHERE type='table' AND name='cost_events'",
            [], |row| row.get(0),
        ).unwrap_or(false);

        let raw_cost_1h: f64 = if has_cost_table {
            self.conn.query_row(
                "SELECT COALESCE(SUM(cost_usd), 0.0) FROM cost_events WHERE datetime(timestamp) >= datetime('now', '-1 hour')",
                [], |row| row.get(0),
            ).unwrap_or(0.0)
        } else { 0.0 };

        let mut agents_stmt = self.conn.prepare(
            "SELECT DISTINCT agent FROM events WHERE datetime(timestamp) >= datetime('now', '-1 hour') ORDER BY agent"
        )?;
        let agent_names: Vec<String> = agents_stmt.query_map([], |row| row.get(0))?
            .filter_map(|r| r.ok()).collect();

        let mut agents = Vec::new();
        for agent in &agent_names {
            let events_1h: u64 = self.conn.query_row(
                "SELECT COUNT(*) FROM events WHERE agent = ?1 AND datetime(timestamp) >= datetime('now', '-1 hour')",
                params![agent], |row| row.get::<_, i64>(0),
            ).unwrap_or(0) as u64;

            let recent: i64 = self.conn.query_row(
                "SELECT COUNT(*) FROM events WHERE agent = ?1 AND datetime(timestamp) >= datetime('now', '-2 minutes')",
                params![agent], |row| row.get(0),
            ).unwrap_or(0);
            let status = if recent > 0 { "active" } else { "idle" };

            let current_file: Option<String> = self.conn.query_row(
                "SELECT file_path FROM events WHERE agent = ?1 AND file_path IS NOT NULL ORDER BY timestamp DESC LIMIT 1",
                params![agent], |row| row.get(0),
            ).ok();

            // Cost: None if agent has no cost data
            let cost_1h: Option<f64> = if has_cost_table {
                let count: i64 = self.conn.query_row(
                    "SELECT COUNT(*) FROM cost_events WHERE agent = ?1 AND datetime(timestamp) >= datetime('now', '-1 hour')",
                    params![agent], |row| row.get(0),
                ).unwrap_or(0);
                if count > 0 {
                    Some(self.conn.query_row(
                        "SELECT COALESCE(SUM(cost_usd), 0.0) FROM cost_events WHERE agent = ?1 AND datetime(timestamp) >= datetime('now', '-1 hour')",
                        params![agent], |row| row.get(0),
                    ).unwrap_or(0.0))
                } else { None }
            } else { None };

            let file_count: i64 = self.conn.query_row(
                "SELECT COUNT(DISTINCT file_path) FROM events WHERE agent = ?1 AND file_path IS NOT NULL AND datetime(timestamp) >= datetime('now', '-1 hour')",
                params![agent], |row| row.get(0),
            ).unwrap_or(0);
            let confidence = if file_count <= 5 { 85.0 } else if file_count <= 15 { 70.0 } else { 50.0 };

            let has_h_table: bool = self.conn.query_row(
                "SELECT COUNT(*) > 0 FROM sqlite_master WHERE type='table' AND name='hallucinations'",
                [], |row| row.get(0),
            ).unwrap_or(false);
            let hallucinations: u64 = if has_h_table {
                self.conn.query_row(
                    "SELECT COUNT(*) FROM hallucinations WHERE agent = ?1 AND resolved = 0",
                    params![agent], |row| row.get::<_, i64>(0),
                ).unwrap_or(0) as u64
            } else { 0 };

            agents.push(AgentSummaryRow {
                agent: agent.clone(), status: status.to_string(), current_file,
                events_1h, cost_1h, confidence: Some(confidence), hallucinations,
            });
        }

        let active_session_count = agents.iter().filter(|a| a.status == "active").count() as u64;
        let collisions = self.query_collisions()?;
        let hotspots: Vec<HotspotRow> = collisions.into_iter().map(|c| HotspotRow {
            file_path: c.file_path, agents: c.agents,
        }).collect();

        let mut alerts = Vec::new();
        for hs in &hotspots {
            alerts.push(AlertRow { severity: "critical".into(), message: format!("COLLISION {} -- {}", hs.file_path, hs.agents.join(", ")) });
        }
        for a in &agents {
            if let Some(c) = a.confidence { if c < 30.0 && a.status == "active" {
                alerts.push(AlertRow { severity: "critical".into(), message: format!("{}: confidence {:.0} (critically low)", a.agent, c) });
            }}
            if a.hallucinations > 0 {
                alerts.push(AlertRow { severity: "warning".into(), message: format!("{}: {} unresolved hallucination(s)", a.agent, a.hallucinations) });
            }
        }
        if raw_cost_1h > 5.0 {
            alerts.push(AlertRow { severity: "warning".into(), message: format!("Burn rate ${:.2}/hr exceeds $5/hr threshold", raw_cost_1h) });
        }

        let cost_tracked: Vec<String> = agents.iter().filter(|a| a.cost_1h.is_some()).map(|a| a.agent.clone()).collect();
        let has_any = !cost_tracked.is_empty();
        let partial = has_any && cost_tracked.len() < agents.len();
        let total_cost_1h = if has_any { Some(raw_cost_1h) } else { None };
        let burn_rate_per_min = total_cost_1h.map(|c| if c > 0.0 { c / 60.0 } else { 0.0 });

        Ok(LiveSummaryRow {
            active_session_count, total_events_1h, total_cost_1h, burn_rate_per_min,
            burn_rate_partial: partial, cost_tracked_agents: cost_tracked,
            agents, alerts, hotspots,
        })
    }

    /// Count events per (hour, agent) over the last N hours.
    /// Returns only hours with >=1 event; frontend densifies to 24 contiguous buckets.
    ///
    /// Known undercount: filter `datetime(timestamp) >= datetime('now', '-N hours')` is not
    /// hour-floored. Frontend densification floors `now-Nh` to start-of-hour, so the
    /// leftmost bucket on screen represents `floor(now-Nh)..floor(now-(N-1)h)` but
    /// only contains events from `now-Nh..floor(now-(N-1)h)`. Cosmetic at the
    /// leftmost edge; up to 60 min undercount.
    pub fn query_hourly_activity(&self, since_hours: i64) -> Result<Vec<HourBucketRow>> {
        let since = format!("-{since_hours} hours");
        let mut stmt = self.conn.prepare(
            "SELECT strftime('%Y-%m-%dT%H:00:00Z', timestamp) AS hour, agent, COUNT(*) AS n
             FROM events
             WHERE datetime(timestamp) >= datetime('now', ?1)
               AND kind IN ('file_create', 'file_modify', 'file_delete', 'git_commit')
             GROUP BY hour, agent
             ORDER BY hour ASC, n DESC",
        )?;

        let rows: Vec<(String, String, u32)> = stmt
            .query_map(params![since], |r| {
                Ok((r.get(0)?, r.get(1)?, r.get::<_, i64>(2)? as u32))
            })?
            .collect::<Result<_>>()?;

        let mut buckets: Vec<HourBucketRow> = Vec::new();
        for (hour, agent, count) in rows {
            if buckets.last().map(|b| b.hour_iso.as_str()) != Some(hour.as_str()) {
                buckets.push(HourBucketRow { hour_iso: hour.clone(), by_agent: Vec::new() });
            }
            buckets.last_mut().unwrap().by_agent.push(AgentCount { agent, count });
        }
        Ok(buckets)
    }

    /// Session-scoped review signals: simple-heuristic confidence + reason +
    /// file_count + has_tests + per-session collisions. Shaped for the
    /// right-rail Review tab.
    pub fn query_session_review(&self, session_id: &str) -> Result<ReviewSignalsRow> {
        let mut file_stmt = self.conn.prepare(
            "SELECT DISTINCT file_path FROM events \
             WHERE session_id = ?1 AND file_path IS NOT NULL \
               AND kind IN ('file_create', 'file_modify')",
        )?;
        let files: Vec<String> = file_stmt
            .query_map(params![session_id], |row| row.get::<_, String>(0))?
            .filter_map(Result::ok)
            .collect();
        let file_count = files.len() as u32;

        let has_tests = files.iter().any(|f| {
            let lower = f.to_lowercase();
            lower.contains("test") || lower.contains("spec")
                || lower.ends_with(".test.ts") || lower.ends_with(".test.tsx")
                || lower.ends_with("_test.rs") || lower.ends_with("_test.go")
                || lower.ends_with("_test.py")
        });

        let (confidence, confidence_reason) = if file_count == 0 {
            (50, "No files changed yet.".to_string())
        } else if file_count <= 5 {
            (85, format!("Small focused change — {file_count} file(s) touched."))
        } else if file_count <= 15 {
            (70, format!("Medium scope — {file_count} files touched."))
        } else {
            (50, format!("Large change — {file_count} files touched. Harder to review."))
        };

        // Per-session collisions: files from this session that appear in the
        // global 5-minute collision window.
        let collisions_all = self.query_collisions()?;
        let this_files: std::collections::HashSet<&str> = files.iter().map(String::as_str).collect();
        let collisions: Vec<CollisionRow> = collisions_all
            .into_iter()
            .filter(|c| this_files.contains(c.file_path.as_str()))
            .collect();

        Ok(ReviewSignalsRow {
            confidence,
            confidence_reason,
            file_count,
            has_tests,
            collisions,
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use rusqlite::Connection;

    /// Build an in-memory database with the minimum schema the store reads.
    /// Mirrors the daemon's CREATE TABLE statements but only for the columns
    /// these tests exercise.
    fn test_db() -> Store {
        let conn = Connection::open_in_memory().unwrap();
        conn.execute_batch(
            "
            CREATE TABLE events (
                id          INTEGER PRIMARY KEY AUTOINCREMENT,
                timestamp   TEXT NOT NULL,
                kind        TEXT NOT NULL,
                file_path   TEXT,
                agent       TEXT NOT NULL,
                session_id  TEXT,
                repo_path   TEXT,
                branch      TEXT,
                diff        TEXT,
                metadata    TEXT,
                host_kind   TEXT,
                model       TEXT,
                is_live     INTEGER NOT NULL DEFAULT 0
            );
            CREATE TABLE session_turns (
                id          INTEGER PRIMARY KEY,
                session_id  TEXT NOT NULL,
                timestamp   TEXT NOT NULL,
                role        TEXT NOT NULL,
                text        TEXT NOT NULL,
                tool_names  TEXT NOT NULL DEFAULT '[]',
                source      TEXT NOT NULL DEFAULT 'claude'
            );
            CREATE TABLE session_summaries (
                session_id   TEXT PRIMARY KEY,
                text         TEXT NOT NULL,
                generated_at TEXT NOT NULL,
                backend      TEXT NOT NULL
            );
            ",
        )
        .unwrap();
        Store::from_conn(conn)
    }

    fn now_iso() -> String {
        chrono::Utc::now().to_rfc3339()
    }

    #[test]
    fn live_sessions_surfaces_session_only_in_session_turns() {
        let store = test_db();
        let now = now_iso();
        // Session present ONLY in session_turns — never written into events.
        // Pre-fix this would never appear in the rail.
        store
            .conn
            .execute(
                "INSERT INTO session_turns (session_id, timestamp, role, text, source) \
                 VALUES (?1, ?2, 'user', 'hello', 'claude')",
                params!["session-only-in-turns", now],
            )
            .unwrap();

        let rows = store.query_live_sessions(60).unwrap();
        assert!(
            rows.iter().any(|r| r.session_id == "session-only-in-turns"),
            "session present only in session_turns must surface; got {:?}",
            rows.iter().map(|r| &r.session_id).collect::<Vec<_>>()
        );
    }

    #[test]
    fn live_sessions_prefers_events_when_both_exist() {
        let store = test_db();
        let now = now_iso();
        let sid = "shared-session";
        // events row carries the rich metadata.
        store
            .conn
            .execute(
                "INSERT INTO events (timestamp, kind, agent, session_id, repo_path, host_kind, model, is_live) \
                 VALUES (?1, 'session_seen', 'claude-code', ?2, '/Users/me/repos/widget', 'iterm2', 'claude-opus-4-7', 1)",
                params![now, sid],
            )
            .unwrap();
        // session_turns row exists too — should NOT override events fields.
        store
            .conn
            .execute(
                "INSERT INTO session_turns (session_id, timestamp, role, text, source) \
                 VALUES (?1, ?2, 'user', 'first prompt', 'claude')",
                params![sid, now],
            )
            .unwrap();

        let rows = store.query_live_sessions(60).unwrap();
        let row = rows.iter().find(|r| r.session_id == sid).expect("must surface");
        assert_eq!(row.host_kind, "iterm2", "events host_kind must win");
        assert_eq!(row.repo_path.as_deref(), Some("/Users/me/repos/widget"));
        assert_eq!(row.model.as_deref(), Some("claude-opus-4-7"));
        assert!(row.is_live);
    }

    #[test]
    fn live_sessions_excludes_old_session_turns() {
        let store = test_db();
        // 2 hours old — outside the 60 minute window.
        let old = (chrono::Utc::now() - chrono::Duration::hours(2)).to_rfc3339();
        store
            .conn
            .execute(
                "INSERT INTO session_turns (session_id, timestamp, role, text, source) \
                 VALUES ('stale', ?1, 'user', 'old', 'claude')",
                params![old],
            )
            .unwrap();

        let rows = store.query_live_sessions(60).unwrap();
        assert!(rows.iter().all(|r| r.session_id != "stale"));
    }

    fn ago_iso(minutes: i64) -> String {
        (chrono::Utc::now() - chrono::Duration::minutes(minutes)).to_rfc3339()
    }

    #[test]
    fn hourly_activity_buckets_by_hour_and_agent() {
        let store = test_db();
        let h1 = ago_iso(30);
        let h2 = ago_iso(90);
        for _ in 0..3 {
            store.conn.execute(
                "INSERT INTO events (timestamp, kind, agent) VALUES (?1, 'file_modify', 'claude-code')",
                params![h1.clone()],
            ).unwrap();
        }
        for _ in 0..2 {
            store.conn.execute(
                "INSERT INTO events (timestamp, kind, agent) VALUES (?1, 'file_create', 'claude-code')",
                params![h2.clone()],
            ).unwrap();
        }
        store.conn.execute(
            "INSERT INTO events (timestamp, kind, agent) VALUES (?1, 'file_modify', 'cursor')",
            params![h2.clone()],
        ).unwrap();

        let buckets = store.query_hourly_activity(24).unwrap();
        assert_eq!(buckets.len(), 2, "two distinct hours");
        let total_h1: u32 = buckets.iter()
            .flat_map(|b| b.by_agent.iter())
            .filter(|a| a.agent == "claude-code")
            .map(|a| a.count).sum();
        assert_eq!(total_h1, 5, "3 + 2 claude-code edits across both hours");
        assert!(buckets.iter().any(|b| b.by_agent.iter().any(|a| a.agent == "cursor" && a.count == 1)));
    }

    #[test]
    fn hourly_activity_window_filter_excludes_old() {
        let store = test_db();
        store.conn.execute(
            "INSERT INTO events (timestamp, kind, agent) VALUES (?1, 'file_modify', 'claude-code')",
            params![ago_iso(30)],
        ).unwrap();
        store.conn.execute(
            "INSERT INTO events (timestamp, kind, agent) VALUES (?1, 'file_modify', 'claude-code')",
            params![ago_iso(90)],
        ).unwrap();

        let buckets = store.query_hourly_activity(1).unwrap();
        let total: u32 = buckets.iter().flat_map(|b| b.by_agent.iter()).map(|a| a.count).sum();
        assert_eq!(total, 1, "only the -30min event should be in the 1-hour window");
    }

    #[test]
    fn hourly_activity_excludes_non_activity_kinds() {
        let store = test_db();
        let now = ago_iso(10);
        for kind in &["file_create", "file_modify", "file_delete", "git_commit", "session_seen"] {
            store.conn.execute(
                "INSERT INTO events (timestamp, kind, agent) VALUES (?1, ?2, 'claude-code')",
                params![now.clone(), *kind],
            ).unwrap();
        }

        let buckets = store.query_hourly_activity(1).unwrap();
        let total: u32 = buckets.iter().flat_map(|b| b.by_agent.iter()).map(|a| a.count).sum();
        assert_eq!(total, 4, "session_seen excluded; the other 4 included");
    }

    #[test]
    fn hourly_activity_returns_empty_for_quiet_window() {
        let store = test_db();
        let buckets = store.query_hourly_activity(24).unwrap();
        assert!(buckets.is_empty());
    }

    /// Pins the literal-interval form of the time-window filter on `events`:
    /// `WHERE datetime(timestamp) >= datetime('now', '-10 minutes')`. RFC3339
    /// timestamps stored with `T` separator + `+00:00` offset must lex-compare
    /// correctly against SQLite's space-separated `datetime()` output, which
    /// requires wrapping the column in `datetime()` too.
    #[test]
    fn active_agents_excludes_old_events() {
        let store = test_db();
        // 5 minutes ago — inside the 10 minute window.
        store.conn.execute(
            "INSERT INTO events (timestamp, kind, agent) VALUES (?1, 'file_modify', 'fresh-agent')",
            params![ago_iso(5)],
        ).unwrap();
        // 30 minutes ago — well outside the 10 minute window.
        store.conn.execute(
            "INSERT INTO events (timestamp, kind, agent) VALUES (?1, 'file_modify', 'stale-agent')",
            params![ago_iso(30)],
        ).unwrap();

        let agents = store.query_active_agents().unwrap();
        assert_eq!(agents, vec!["fresh-agent".to_string()]);
    }

    /// Pins the events-branch of `query_live_sessions` — the WITH-CTE UNION
    /// has separate WHERE clauses for the events table and the session_turns
    /// table. `live_sessions_excludes_old_session_turns` covers the latter;
    /// this covers the former.
    #[test]
    fn live_sessions_excludes_old_events() {
        let store = test_db();
        let old = (chrono::Utc::now() - chrono::Duration::hours(2)).to_rfc3339();
        store
            .conn
            .execute(
                "INSERT INTO events (timestamp, kind, agent, session_id) \
                 VALUES (?1, 'session_seen', 'claude-code', 'old-events-session')",
                params![old],
            )
            .unwrap();

        let rows = store.query_live_sessions(60).unwrap();
        assert!(
            rows.iter().all(|r| r.session_id != "old-events-session"),
            "session with 2-hour-old event must be excluded from 60-minute window; got {:?}",
            rows.iter().map(|r| &r.session_id).collect::<Vec<_>>()
        );
    }
}
