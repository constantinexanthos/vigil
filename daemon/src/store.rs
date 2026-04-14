use chrono::{DateTime, Utc};
use rusqlite::{params, Connection, Result};
use std::path::{Path, PathBuf};

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

    fn from_str(s: &str) -> Option<Self> {
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

/// Query filters for retrieving events.
#[derive(Debug, Default)]
pub struct EventQuery {
    pub agent: Option<String>,
    pub session_id: Option<String>,
    pub file_path: Option<String>,
    pub kind: Option<EventKind>,
    pub since: Option<DateTime<Utc>>,
    pub limit: Option<u32>,
}

pub struct Store {
    conn: Connection,
}

impl Store {
    /// Open (or create) the SQLite database at the given path.
    pub fn open(db_path: &Path) -> Result<Self> {
        let conn = Connection::open(db_path)?;
        let store = Self { conn };
        store.init_schema()?;
        Ok(store)
    }

    /// Open an in-memory database (useful for tests).
    pub fn open_in_memory() -> Result<Self> {
        let conn = Connection::open_in_memory()?;
        let store = Self { conn };
        store.init_schema()?;
        Ok(store)
    }

    fn init_schema(&self) -> Result<()> {
        self.conn.execute_batch(
            "
            CREATE TABLE IF NOT EXISTS events (
                id          INTEGER PRIMARY KEY AUTOINCREMENT,
                timestamp   TEXT NOT NULL,
                kind        TEXT NOT NULL,
                file_path   TEXT,
                agent       TEXT NOT NULL,
                session_id  TEXT,
                repo_path   TEXT,
                branch      TEXT,
                diff        TEXT,
                metadata    TEXT
            );

            CREATE INDEX IF NOT EXISTS idx_events_timestamp ON events(timestamp);
            CREATE INDEX IF NOT EXISTS idx_events_agent ON events(agent);
            CREATE INDEX IF NOT EXISTS idx_events_file_path ON events(file_path);
            CREATE INDEX IF NOT EXISTS idx_events_session_id ON events(session_id);
            ",
        )?;
        crate::cost::init_cost_schema(&self.conn)
    }

    /// Insert a new event. Returns the row id.
    /// If the event has metadata with cost info, also inserts into cost_events.
    pub fn insert(&self, event: &AgentEvent) -> Result<i64> {
        self.conn.execute(
            "INSERT INTO events (timestamp, kind, file_path, agent, session_id, repo_path, branch, diff, metadata)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)",
            params![
                event.timestamp.to_rfc3339(),
                event.kind.as_str(),
                event.file_path,
                event.agent,
                event.session_id,
                event.repo_path,
                event.branch,
                event.diff,
                event.metadata,
            ],
        )?;
        let event_id = self.conn.last_insert_rowid();

        // Extract cost data if metadata contains token usage or cost info.
        if let Some(ref metadata) = event.metadata {
            let _ = crate::cost::extract_and_store_cost(
                &self.conn,
                event_id,
                &event.timestamp,
                &event.agent,
                event.session_id.as_deref(),
                metadata,
            );
        }

        Ok(event_id)
    }

    /// Get a reference to the underlying connection (for cost queries).
    pub fn conn(&self) -> &Connection {
        &self.conn
    }

    /// Query events with optional filters, ordered by timestamp descending.
    pub fn query(&self, q: &EventQuery) -> Result<Vec<AgentEvent>> {
        let mut sql = String::from("SELECT id, timestamp, kind, file_path, agent, session_id, repo_path, branch, diff, metadata FROM events WHERE 1=1");
        let mut param_values: Vec<Box<dyn rusqlite::types::ToSql>> = Vec::new();

        if let Some(ref agent) = q.agent {
            sql.push_str(" AND agent = ?");
            param_values.push(Box::new(agent.clone()));
        }
        if let Some(ref session_id) = q.session_id {
            sql.push_str(" AND session_id = ?");
            param_values.push(Box::new(session_id.clone()));
        }
        if let Some(ref file_path) = q.file_path {
            sql.push_str(" AND file_path = ?");
            param_values.push(Box::new(file_path.clone()));
        }
        if let Some(ref kind) = q.kind {
            sql.push_str(" AND kind = ?");
            param_values.push(Box::new(kind.as_str().to_string()));
        }
        if let Some(ref since) = q.since {
            sql.push_str(" AND timestamp >= ?");
            param_values.push(Box::new(since.to_rfc3339()));
        }

        sql.push_str(" ORDER BY timestamp DESC");

        if let Some(limit) = q.limit {
            sql.push_str(" LIMIT ?");
            param_values.push(Box::new(limit as i64));
        }

        let params_ref: Vec<&dyn rusqlite::types::ToSql> =
            param_values.iter().map(|p| p.as_ref()).collect();

        let mut stmt = self.conn.prepare(&sql)?;
        let rows = stmt.query_map(params_ref.as_slice(), |row| {
            let kind_str: String = row.get(2)?;
            let ts_str: String = row.get(1)?;
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

    /// Return all distinct agent names that have recorded events.
    pub fn active_agents(&self) -> Result<Vec<String>> {
        let mut stmt = self
            .conn
            .prepare("SELECT DISTINCT agent FROM events ORDER BY agent")?;
        let rows = stmt.query_map([], |row| row.get(0))?;
        rows.collect()
    }

    /// Return files modified by more than one distinct agent within a time window.
    /// Used for collision detection.
    pub fn file_collisions(&self, since: &DateTime<Utc>) -> Result<Vec<(String, Vec<String>)>> {
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

    /// Get the database file path (None for in-memory databases).
    pub fn db_path(&self) -> Option<PathBuf> {
        self.conn
            .path()
            .map(|p| PathBuf::from(p))
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use chrono::Duration;

    fn sample_event(agent: &str, kind: EventKind, file_path: Option<&str>) -> AgentEvent {
        AgentEvent {
            id: None,
            timestamp: Utc::now(),
            kind,
            file_path: file_path.map(|s| s.to_string()),
            agent: agent.to_string(),
            session_id: Some("session-1".to_string()),
            repo_path: Some("/tmp/test-repo".to_string()),
            branch: Some("main".to_string()),
            diff: None,
            metadata: None,
        }
    }

    #[test]
    fn insert_and_query_round_trip() {
        let store = Store::open_in_memory().unwrap();
        let event = sample_event("claude-code", EventKind::FileModify, Some("src/main.rs"));
        let id = store.insert(&event).unwrap();
        assert!(id > 0);

        let results = store.query(&EventQuery::default()).unwrap();
        assert_eq!(results.len(), 1);
        assert_eq!(results[0].agent, "claude-code");
        assert_eq!(results[0].kind, EventKind::FileModify);
        assert_eq!(results[0].file_path.as_deref(), Some("src/main.rs"));
    }

    #[test]
    fn query_filters_by_agent() {
        let store = Store::open_in_memory().unwrap();
        store
            .insert(&sample_event("claude-code", EventKind::FileModify, Some("a.rs")))
            .unwrap();
        store
            .insert(&sample_event("cursor", EventKind::FileCreate, Some("b.rs")))
            .unwrap();

        let q = EventQuery {
            agent: Some("cursor".to_string()),
            ..Default::default()
        };
        let results = store.query(&q).unwrap();
        assert_eq!(results.len(), 1);
        assert_eq!(results[0].agent, "cursor");
    }

    #[test]
    fn active_agents_returns_distinct() {
        let store = Store::open_in_memory().unwrap();
        store
            .insert(&sample_event("claude-code", EventKind::FileModify, Some("a.rs")))
            .unwrap();
        store
            .insert(&sample_event("claude-code", EventKind::FileModify, Some("b.rs")))
            .unwrap();
        store
            .insert(&sample_event("cursor", EventKind::FileCreate, Some("c.rs")))
            .unwrap();

        let agents = store.active_agents().unwrap();
        assert_eq!(agents, vec!["claude-code", "cursor"]);
    }

    #[test]
    fn file_collisions_detected() {
        let store = Store::open_in_memory().unwrap();
        store
            .insert(&sample_event("claude-code", EventKind::FileModify, Some("shared.rs")))
            .unwrap();
        store
            .insert(&sample_event("cursor", EventKind::FileModify, Some("shared.rs")))
            .unwrap();
        store
            .insert(&sample_event("claude-code", EventKind::FileModify, Some("only-claude.rs")))
            .unwrap();

        let since = Utc::now() - Duration::hours(1);
        let collisions = store.file_collisions(&since).unwrap();
        assert_eq!(collisions.len(), 1);
        assert_eq!(collisions[0].0, "shared.rs");
        assert_eq!(collisions[0].1.len(), 2);
    }

    #[test]
    fn query_with_limit() {
        let store = Store::open_in_memory().unwrap();
        for i in 0..10 {
            store
                .insert(&sample_event("agent", EventKind::FileModify, Some(&format!("f{i}.rs"))))
                .unwrap();
        }

        let q = EventQuery {
            limit: Some(3),
            ..Default::default()
        };
        let results = store.query(&q).unwrap();
        assert_eq!(results.len(), 3);
    }
}
