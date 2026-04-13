use std::path::{Path, PathBuf};
use std::time::Duration;

use rusqlite::Connection;

/// A single recorded event from the daemon.
#[derive(Debug, Clone)]
pub struct Event {
    pub timestamp: String,
    pub agent: String,
    pub kind: String,
    pub path: String,
}

/// A file collision: two agents modified the same file within a time window.
#[derive(Debug, Clone)]
pub struct Collision {
    pub path: String,
    pub agents: Vec<String>,
    pub first_seen: String,
    pub last_seen: String,
}

/// Filters for querying the event log.
#[derive(Debug, Default)]
pub struct QueryFilters {
    pub agent: Option<String>,
    pub file: Option<String>,
    pub limit: Option<usize>,
}

/// Read-only handle to the Vigil event store (SQLite).
pub struct Store {
    conn: Connection,
}

impl Store {
    /// Open an existing database read-only.
    pub fn open_readonly(path: &Path) -> rusqlite::Result<Self> {
        let conn = Connection::open_with_flags(
            path,
            rusqlite::OpenFlags::SQLITE_OPEN_READ_ONLY | rusqlite::OpenFlags::SQLITE_OPEN_NO_MUTEX,
        )?;
        Ok(Self { conn })
    }

    /// Open or create a database (read-write).
    pub fn open(path: &Path) -> rusqlite::Result<Self> {
        let conn = Connection::open(path)?;
        conn.execute_batch(
            "CREATE TABLE IF NOT EXISTS events (
                id        INTEGER PRIMARY KEY AUTOINCREMENT,
                timestamp TEXT NOT NULL,
                agent     TEXT NOT NULL,
                kind      TEXT NOT NULL,
                path      TEXT NOT NULL
            );
            CREATE INDEX IF NOT EXISTS idx_events_timestamp ON events(timestamp);
            CREATE INDEX IF NOT EXISTS idx_events_agent ON events(agent);
            CREATE INDEX IF NOT EXISTS idx_events_path ON events(path);",
        )?;
        Ok(Self { conn })
    }

    /// Insert an event.
    pub fn insert(&self, event: &Event) -> rusqlite::Result<()> {
        self.conn.execute(
            "INSERT INTO events (timestamp, agent, kind, path) VALUES (?1, ?2, ?3, ?4)",
            (&event.timestamp, &event.agent, &event.kind, &event.path),
        )?;
        Ok(())
    }

    /// Query events with optional filters.
    pub fn query(&self, filters: &QueryFilters) -> rusqlite::Result<Vec<Event>> {
        let mut sql = String::from("SELECT timestamp, agent, kind, path FROM events WHERE 1=1");
        let mut params: Vec<Box<dyn rusqlite::types::ToSql>> = Vec::new();

        if let Some(ref agent) = filters.agent {
            sql.push_str(" AND agent = ?");
            params.push(Box::new(agent.clone()));
        }
        if let Some(ref file) = filters.file {
            sql.push_str(" AND path LIKE ?");
            params.push(Box::new(format!("%{file}%")));
        }

        sql.push_str(" ORDER BY timestamp DESC");

        if let Some(limit) = filters.limit {
            sql.push_str(&format!(" LIMIT {limit}"));
        }

        let param_refs: Vec<&dyn rusqlite::types::ToSql> = params.iter().map(|p| p.as_ref()).collect();
        let mut stmt = self.conn.prepare(&sql)?;
        let rows = stmt.query_map(param_refs.as_slice(), |row| {
            Ok(Event {
                timestamp: row.get(0)?,
                agent: row.get(1)?,
                kind: row.get(2)?,
                path: row.get(3)?,
            })
        })?;

        let mut events = Vec::new();
        for row in rows {
            events.push(row?);
        }
        Ok(events)
    }

    /// Return distinct agents that have events in the last `since` duration.
    pub fn active_agents(&self, since: Duration) -> rusqlite::Result<Vec<String>> {
        let cutoff = chrono_cutoff(since);
        let mut stmt = self
            .conn
            .prepare("SELECT DISTINCT agent FROM events WHERE timestamp >= ?1 ORDER BY agent")?;
        let rows = stmt.query_map([&cutoff], |row| row.get::<_, String>(0))?;
        let mut agents = Vec::new();
        for row in rows {
            agents.push(row?);
        }
        Ok(agents)
    }

    /// Find files modified by multiple agents within the given time window.
    pub fn file_collisions(&self, since: Duration) -> rusqlite::Result<Vec<Collision>> {
        let cutoff = chrono_cutoff(since);
        let mut stmt = self.conn.prepare(
            "SELECT path, GROUP_CONCAT(DISTINCT agent), MIN(timestamp), MAX(timestamp)
             FROM events
             WHERE timestamp >= ?1
             GROUP BY path
             HAVING COUNT(DISTINCT agent) > 1
             ORDER BY MAX(timestamp) DESC",
        )?;
        let rows = stmt.query_map([&cutoff], |row| {
            let agents_str: String = row.get(1)?;
            Ok(Collision {
                path: row.get(0)?,
                agents: agents_str.split(',').map(String::from).collect(),
                first_seen: row.get(2)?,
                last_seen: row.get(3)?,
            })
        })?;
        let mut collisions = Vec::new();
        for row in rows {
            collisions.push(row?);
        }
        Ok(collisions)
    }

    /// Default database path: ~/.vigil/events.db
    pub fn default_path() -> PathBuf {
        let home = std::env::var("HOME").unwrap_or_else(|_| ".".to_string());
        PathBuf::from(home).join(".vigil").join("vigil.db")
    }
}

fn chrono_cutoff(since: Duration) -> String {
    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default();
    let cutoff_secs = now.as_secs().saturating_sub(since.as_secs());
    // ISO 8601 UTC — matches the timestamp format we store.
    let dt = time_from_epoch_secs(cutoff_secs);
    dt
}

/// Simple epoch-to-ISO8601 without pulling in chrono.
fn time_from_epoch_secs(secs: u64) -> String {
    // We use a basic calculation. For production, consider the `time` crate.
    let days = secs / 86400;
    let time_of_day = secs % 86400;
    let hours = time_of_day / 3600;
    let minutes = (time_of_day % 3600) / 60;
    let seconds = time_of_day % 60;

    // Days since 1970-01-01
    let (year, month, day) = days_to_ymd(days);

    format!("{year:04}-{month:02}-{day:02}T{hours:02}:{minutes:02}:{seconds:02}Z")
}

fn days_to_ymd(mut days: u64) -> (u64, u64, u64) {
    let mut year = 1970u64;
    loop {
        let days_in_year = if is_leap(year) { 366 } else { 365 };
        if days < days_in_year {
            break;
        }
        days -= days_in_year;
        year += 1;
    }
    let leap = is_leap(year);
    let month_days: [u64; 12] = [
        31,
        if leap { 29 } else { 28 },
        31, 30, 31, 30, 31, 31, 30, 31, 30, 31,
    ];
    let mut month = 0u64;
    for (i, &md) in month_days.iter().enumerate() {
        if days < md {
            month = i as u64 + 1;
            break;
        }
        days -= md;
    }
    if month == 0 {
        month = 12;
    }
    (year, month, days + 1)
}

fn is_leap(y: u64) -> bool {
    (y % 4 == 0 && y % 100 != 0) || y % 400 == 0
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::time::Duration;

    fn temp_store() -> Store {
        Store::open(Path::new(":memory:")).unwrap()
    }

    #[test]
    fn insert_and_query() {
        let store = temp_store();
        store
            .insert(&Event {
                timestamp: "2026-04-13T10:00:00Z".into(),
                agent: "claude-code".into(),
                kind: "modify".into(),
                path: "src/main.rs".into(),
            })
            .unwrap();

        let events = store.query(&QueryFilters::default()).unwrap();
        assert_eq!(events.len(), 1);
        assert_eq!(events[0].agent, "claude-code");
    }

    #[test]
    fn query_with_agent_filter() {
        let store = temp_store();
        store
            .insert(&Event {
                timestamp: "2026-04-13T10:00:00Z".into(),
                agent: "claude-code".into(),
                kind: "modify".into(),
                path: "src/main.rs".into(),
            })
            .unwrap();
        store
            .insert(&Event {
                timestamp: "2026-04-13T10:01:00Z".into(),
                agent: "cursor".into(),
                kind: "create".into(),
                path: "src/lib.rs".into(),
            })
            .unwrap();

        let filters = QueryFilters {
            agent: Some("cursor".into()),
            ..Default::default()
        };
        let events = store.query(&filters).unwrap();
        assert_eq!(events.len(), 1);
        assert_eq!(events[0].agent, "cursor");
    }

    #[test]
    fn file_collisions_detected() {
        let store = temp_store();
        let now = "2099-01-01T00:00:00Z";
        store
            .insert(&Event {
                timestamp: now.into(),
                agent: "claude-code".into(),
                kind: "modify".into(),
                path: "src/main.rs".into(),
            })
            .unwrap();
        store
            .insert(&Event {
                timestamp: now.into(),
                agent: "cursor".into(),
                kind: "modify".into(),
                path: "src/main.rs".into(),
            })
            .unwrap();

        let collisions = store.file_collisions(Duration::from_secs(86400 * 365 * 200)).unwrap();
        assert_eq!(collisions.len(), 1);
        assert_eq!(collisions[0].path, "src/main.rs");
        assert_eq!(collisions[0].agents.len(), 2);
    }

    #[test]
    fn epoch_to_iso() {
        assert_eq!(time_from_epoch_secs(0), "1970-01-01T00:00:00Z");
    }
}
