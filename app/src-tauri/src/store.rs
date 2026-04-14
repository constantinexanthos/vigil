use chrono::{DateTime, Utc};
use rusqlite::{params, Connection};
use std::path::Path;

/// Types of events the daemon captures.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum EventKind {
    FileCreate,
    FileModify,
    FileDelete,
    GitCommit,
    GitBranchCreate,
    GitWorktreeCreate,
}

impl EventKind {
    pub fn as_str(&self) -> &'static str {
        match self {
            Self::FileCreate => "file_create",
            Self::FileModify => "file_modify",
            Self::FileDelete => "file_delete",
            Self::GitCommit => "git_commit",
            Self::GitBranchCreate => "git_branch_create",
            Self::GitWorktreeCreate => "git_worktree_create",
        }
    }

    pub fn from_str(s: &str) -> Option<Self> {
        match s {
            "file_create" => Some(Self::FileCreate),
            "file_modify" => Some(Self::FileModify),
            "file_delete" => Some(Self::FileDelete),
            "git_commit" => Some(Self::GitCommit),
            "git_branch_create" => Some(Self::GitBranchCreate),
            "git_worktree_create" => Some(Self::GitWorktreeCreate),
            _ => None,
        }
    }
}

/// A single agent event recorded by the daemon.
#[derive(Debug, Clone)]
pub struct AgentEvent {
    pub id: Option<i64>,
    pub timestamp: DateTime<Utc>,
    pub kind: EventKind,
    pub file_path: Option<String>,
    pub agent: String,
    pub session_id: Option<String>,
    pub repo_path: Option<String>,
    pub branch: Option<String>,
    pub diff: Option<String>,
    pub metadata: Option<String>,
}

/// Read-only handle to the Vigil event store (SQLite).
pub struct Store {
    conn: Connection,
}

impl Store {
    /// Open an existing database read-only.
    pub fn open_readonly(db_path: &Path) -> rusqlite::Result<Self> {
        let conn = Connection::open_with_flags(
            db_path,
            rusqlite::OpenFlags::SQLITE_OPEN_READ_ONLY | rusqlite::OpenFlags::SQLITE_OPEN_NO_MUTEX,
        )?;
        Ok(Self { conn })
    }

    /// Return distinct agent names with events in the given time window.
    pub fn active_agents_since(&self, since: &DateTime<Utc>) -> rusqlite::Result<Vec<String>> {
        let mut stmt = self.conn.prepare(
            "SELECT DISTINCT agent FROM events WHERE timestamp >= ?1 ORDER BY agent",
        )?;
        let rows = stmt.query_map(params![since.to_rfc3339()], |row| row.get(0))?;
        rows.collect()
    }

    /// Return the most recent events up to `limit`.
    pub fn recent_events(&self, limit: u32) -> rusqlite::Result<Vec<AgentEvent>> {
        let mut stmt = self.conn.prepare(
            "SELECT id, timestamp, kind, file_path, agent, session_id, repo_path, branch, diff, metadata
             FROM events ORDER BY timestamp DESC LIMIT ?1",
        )?;
        let rows = stmt.query_map(params![limit as i64], |row| {
            let ts_str: String = row.get(1)?;
            let kind_str: String = row.get(2)?;
            Ok(AgentEvent {
                id: Some(row.get(0)?),
                timestamp: DateTime::parse_from_rfc3339(&ts_str)
                    .map(|dt| dt.with_timezone(&Utc))
                    .unwrap_or_else(|_| Utc::now()),
                kind: EventKind::from_str(&kind_str).unwrap_or(EventKind::FileModify),
                file_path: row.get(3)?,
                agent: row.get(4)?,
                session_id: row.get(5)?,
                repo_path: row.get(6)?,
                branch: row.get(7)?,
                diff: row.get(8)?,
                metadata: row.get(9)?,
            })
        })?;
        rows.collect()
    }

    /// Return files modified by more than one distinct agent within a time window.
    pub fn file_collisions(&self, since: &DateTime<Utc>) -> rusqlite::Result<Vec<(String, Vec<String>)>> {
        let mut stmt = self.conn.prepare(
            "SELECT file_path, GROUP_CONCAT(DISTINCT agent) as agents
             FROM events
             WHERE file_path IS NOT NULL
               AND timestamp >= ?1
               AND kind IN ('file_create', 'file_modify')
             GROUP BY file_path
             HAVING COUNT(DISTINCT agent) > 1
             ORDER BY file_path",
        )?;
        let rows = stmt.query_map(params![since.to_rfc3339()], |row| {
            let path: String = row.get(0)?;
            let agents_str: String = row.get(1)?;
            let agents: Vec<String> = agents_str.split(',').map(|s| s.to_string()).collect();
            Ok((path, agents))
        })?;
        rows.collect()
    }

    /// Count total events since a given time.
    pub fn event_count_since(&self, since: &DateTime<Utc>) -> rusqlite::Result<u64> {
        self.conn.query_row(
            "SELECT COUNT(*) FROM events WHERE timestamp >= ?1",
            params![since.to_rfc3339()],
            |row| row.get::<_, i64>(0).map(|n| n as u64),
        )
    }

    /// Return all events since a given time, ordered by timestamp ascending.
    pub fn events_since(&self, since: &DateTime<Utc>) -> rusqlite::Result<Vec<AgentEvent>> {
        let mut stmt = self.conn.prepare(
            "SELECT id, timestamp, kind, file_path, agent, session_id, repo_path, branch, diff, metadata
             FROM events WHERE timestamp >= ?1 ORDER BY timestamp ASC",
        )?;
        let rows = stmt.query_map(params![since.to_rfc3339()], |row| {
            let ts_str: String = row.get(1)?;
            let kind_str: String = row.get(2)?;
            Ok(AgentEvent {
                id: Some(row.get(0)?),
                timestamp: DateTime::parse_from_rfc3339(&ts_str)
                    .map(|dt| dt.with_timezone(&Utc))
                    .unwrap_or_else(|_| Utc::now()),
                kind: EventKind::from_str(&kind_str).unwrap_or(EventKind::FileModify),
                file_path: row.get(3)?,
                agent: row.get(4)?,
                session_id: row.get(5)?,
                repo_path: row.get(6)?,
                branch: row.get(7)?,
                diff: row.get(8)?,
                metadata: row.get(9)?,
            })
        })?;
        rows.collect()
    }

    /// Per-agent event counts since a given time.
    pub fn agent_stats_since(&self, since: &DateTime<Utc>) -> rusqlite::Result<Vec<(String, u64)>> {
        let mut stmt = self.conn.prepare(
            "SELECT agent, COUNT(*) as cnt FROM events WHERE timestamp >= ?1 GROUP BY agent ORDER BY cnt DESC",
        )?;
        let rows = stmt.query_map(params![since.to_rfc3339()], |row| {
            Ok((row.get::<_, String>(0)?, row.get::<_, i64>(1)? as u64))
        })?;
        rows.collect()
    }
}
