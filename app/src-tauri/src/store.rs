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
                file_path: row.get::<_, Option<String>>(3)?.unwrap_or_default(),
                agent: row.get(4)?,
                diff: row.get(5)?,
            })
        })?;
        rows.collect()
    }

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

    pub fn query_agent_stats(&self) -> Result<Vec<AgentStatRow>> {
        let mut stmt = self.conn.prepare(
            "SELECT agent, COUNT(*) as count
             FROM events
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

    pub fn query_event_count(&self) -> Result<i64> {
        self.conn.query_row(
            "SELECT COUNT(*) FROM events
             WHERE timestamp >= datetime('now', '-1 day')",
            [],
            |row| row.get(0),
        )
    }
}

#[derive(Debug, Clone, serde::Serialize)]
pub struct EventRow {
    pub id: i64,
    pub timestamp: String,
    pub kind: String,
    pub file_path: String,
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
