// Proxy tab Tauri commands: read-only access to ~/.vigil/proxy.db plus a
// fixture fallback so the React tab is usable before Agent 1 lands real audit
// data. Never writes — the proxy daemon owns that file.
//
// The fixture is generated deterministically from a fixed seed so tests and
// screenshots are reproducible. UI-side code does not know whether it is
// looking at fixture or real data; the only fixture-aware surface is the
// banner driven by proxy_status().fixture_mode.

use rusqlite::{params, Connection, OpenFlags, OptionalExtension};
use serde::{Deserialize, Serialize};
use std::path::PathBuf;

// ---- Wire types — must mirror app/src/types.ts exactly. ----

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
pub struct ProxyIdentity {
    pub id: String,
    pub agent_name: String,
    pub principal: String,
    pub scopes: Vec<String>,
    pub public_key: String,
    pub issued_at: String,
    pub expires_at: String,
}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
pub struct AuditRow {
    pub id: i64,
    pub ts: String,
    pub agent_id: Option<String>,
    pub agent_name: Option<String>,
    pub conn_id: String,
    pub direction: String,
    pub msg_type: String,
    pub query_text: Option<String>,
    pub bytes: i64,
    pub sig: String,
}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
pub struct ProxyCounter {
    pub agent_id: Option<String>,
    pub agent_name: Option<String>,
    pub queries_today: i64,
    pub queries_deduped: i64,
    pub queries_rate_limited: i64,
}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
pub struct ProxyStatus {
    pub db_present: bool,
    pub fixture_mode: bool,
    pub identity_count: i64,
    pub audit_count: i64,
}

#[derive(Serialize, Deserialize, Clone, Debug, Default)]
pub struct AuditFilter {
    pub agent_id: Option<String>,
    pub since_ts: Option<String>,
    pub msg_type: Option<String>,
}

// ---- Path resolution ----

pub fn default_proxy_db_path() -> PathBuf {
    home::home_dir()
        .map(|h| h.join(".vigil").join("proxy.db"))
        .unwrap_or_else(|| PathBuf::from(".vigil/proxy.db"))
}

// ---- Source: real DB or fixture ----

enum Source {
    Real(Connection),
    Fixture,
}

fn open_source(path: &PathBuf) -> Result<Source, String> {
    if !path.exists() {
        return Ok(Source::Fixture);
    }
    let flags = OpenFlags::SQLITE_OPEN_READ_ONLY | OpenFlags::SQLITE_OPEN_NO_MUTEX;
    let conn = Connection::open_with_flags(path, flags)
        .map_err(|e| format!("open proxy.db: {e}"))?;

    // Force SQLite to actually parse the file header. Connection::open is
    // lazy — without a query the file's magic isn't validated, and a garbage
    // file would silently fall through to fixture and hide corruption from
    // the user.
    conn.query_row("SELECT count(*) FROM sqlite_master", [], |r| r.get::<_, i64>(0))
        .map_err(|e| format!("validate proxy.db: {e}"))?;

    let identity_count = table_count(&conn, "identities")?;
    let audit_count = table_count(&conn, "audit")?;
    if identity_count == 0 && audit_count == 0 {
        return Ok(Source::Fixture);
    }
    Ok(Source::Real(conn))
}

// table_count returns 0 if the table doesn't exist (fresh schema), or the
// row count otherwise. A corrupt-DB error during count surfaces as Err.
fn table_count(conn: &Connection, table: &str) -> Result<i64, String> {
    let exists: i64 = conn
        .query_row(
            "SELECT count(*) FROM sqlite_master WHERE type='table' AND name=?",
            [table],
            |r| r.get(0),
        )
        .map_err(|e| format!("check {table}: {e}"))?;
    if exists == 0 {
        return Ok(0);
    }
    let sql = format!("SELECT count(*) FROM {table}");
    conn.query_row(&sql, [], |r| r.get::<_, i64>(0))
        .map_err(|e| format!("count {table}: {e}"))
}

// ---- Query implementation ----

fn read_identities(conn: &Connection) -> Result<Vec<ProxyIdentity>, String> {
    let mut stmt = conn
        .prepare(
            "SELECT id, agent_name, principal, scopes, public_key, issued_at, expires_at \
             FROM identities ORDER BY issued_at DESC",
        )
        .map_err(|e| format!("prepare identities: {e}"))?;
    let rows = stmt
        .query_map([], |row| {
            let scopes_json: String = row.get(3)?;
            let scopes: Vec<String> = serde_json::from_str(&scopes_json).unwrap_or_default();
            Ok(ProxyIdentity {
                id: row.get(0)?,
                agent_name: row.get(1)?,
                principal: row.get(2)?,
                scopes,
                public_key: row.get(4)?,
                issued_at: row.get(5)?,
                expires_at: row.get(6)?,
            })
        })
        .map_err(|e| format!("query identities: {e}"))?;
    rows.collect::<Result<Vec<_>, _>>()
        .map_err(|e| format!("collect identities: {e}"))
}

fn read_audit(
    conn: &Connection,
    filter: &AuditFilter,
    cursor: Option<i64>,
    limit: u32,
) -> Result<Vec<AuditRow>, String> {
    // Build a parameterized query. We constrain by id < cursor for stable
    // descending pagination — even if new rows arrive between calls, the
    // older page boundaries stay deterministic.
    let mut sql = String::from(
        "SELECT id, ts, agent_id, agent_name, conn_id, direction, msg_type, \
         query_text, bytes, sig FROM audit WHERE 1=1",
    );
    let mut bindings: Vec<Box<dyn rusqlite::ToSql>> = Vec::new();
    if let Some(aid) = &filter.agent_id {
        sql.push_str(" AND agent_id = ?");
        bindings.push(Box::new(aid.clone()));
    }
    if let Some(ts) = &filter.since_ts {
        sql.push_str(" AND ts >= ?");
        bindings.push(Box::new(ts.clone()));
    }
    if let Some(mt) = &filter.msg_type {
        sql.push_str(" AND msg_type = ?");
        bindings.push(Box::new(mt.clone()));
    }
    if let Some(c) = cursor {
        sql.push_str(" AND id < ?");
        bindings.push(Box::new(c));
    }
    sql.push_str(" ORDER BY id DESC LIMIT ?");
    bindings.push(Box::new(limit.min(10_000) as i64));

    let mut stmt = conn.prepare(&sql).map_err(|e| format!("prepare audit: {e}"))?;
    let bind_refs: Vec<&dyn rusqlite::ToSql> = bindings.iter().map(|b| b.as_ref()).collect();
    let rows = stmt
        .query_map(rusqlite::params_from_iter(bind_refs), |row| {
            Ok(AuditRow {
                id: row.get(0)?,
                ts: row.get(1)?,
                agent_id: row.get(2)?,
                agent_name: row.get(3)?,
                conn_id: row.get(4)?,
                direction: row.get(5)?,
                msg_type: row.get(6)?,
                query_text: row.get(7)?,
                bytes: row.get(8)?,
                sig: row.get(9)?,
            })
        })
        .map_err(|e| format!("query audit: {e}"))?;
    rows.collect::<Result<Vec<_>, _>>()
        .map_err(|e| format!("collect audit: {e}"))
}

fn read_counters(conn: &Connection, since: Option<&str>) -> Result<Vec<ProxyCounter>, String> {
    // queries_today = count of Query/Parse rows since `since` (or today-utc),
    // grouped by agent. The deduped/rate-limited columns are placeholder
    // zeros until v0.1.0d/c respectively, per the brief.
    let cutoff = since
        .map(|s| s.to_string())
        .unwrap_or_else(default_today_cutoff);

    let mut stmt = conn
        .prepare(
            "SELECT agent_id, MAX(agent_name), COUNT(*) FROM audit \
             WHERE ts >= ? AND msg_type IN ('Query','Parse') \
             GROUP BY agent_id",
        )
        .map_err(|e| format!("prepare counters: {e}"))?;
    let rows = stmt
        .query_map(params![cutoff], |row| {
            Ok(ProxyCounter {
                agent_id: row.get(0)?,
                agent_name: row.get(1)?,
                queries_today: row.get(2)?,
                queries_deduped: 0,
                queries_rate_limited: 0,
            })
        })
        .map_err(|e| format!("query counters: {e}"))?;
    rows.collect::<Result<Vec<_>, _>>()
        .map_err(|e| format!("collect counters: {e}"))
}

fn default_today_cutoff() -> String {
    use chrono::Utc;
    Utc::now()
        .date_naive()
        .and_hms_opt(0, 0, 0)
        .unwrap()
        .and_utc()
        .to_rfc3339()
}

// ---- Fixture data — deterministic, no time dep beyond "now" ----

fn fixture_identities() -> Vec<ProxyIdentity> {
    let issued = chrono::Utc::now() - chrono::Duration::days(7);
    let expires = chrono::Utc::now() + chrono::Duration::days(30);
    let issued_s = issued.to_rfc3339();
    let expires_s = expires.to_rfc3339();
    let pk = "fixture-pubkey-deadbeef".to_string();
    vec![
        ProxyIdentity {
            id: "fix-claude-code".into(),
            agent_name: "claude-code".into(),
            principal: "costa@example.com".into(),
            scopes: vec!["read".into(), "write".into()],
            public_key: pk.clone(),
            issued_at: issued_s.clone(),
            expires_at: expires_s.clone(),
        },
        ProxyIdentity {
            id: "fix-cursor".into(),
            agent_name: "cursor".into(),
            principal: "costa@example.com".into(),
            scopes: vec!["read".into(), "analytics".into()],
            public_key: pk.clone(),
            issued_at: issued_s.clone(),
            expires_at: expires_s.clone(),
        },
        ProxyIdentity {
            id: "fix-codex".into(),
            agent_name: "codex".into(),
            principal: "costa@example.com".into(),
            scopes: vec!["read".into()],
            public_key: pk.clone(),
            issued_at: issued_s.clone(),
            expires_at: expires_s.clone(),
        },
        ProxyIdentity {
            id: "fix-custom-agent".into(),
            agent_name: "custom-agent".into(),
            principal: "ops@example.com".into(),
            scopes: vec!["read".into(), "write".into(), "admin".into()],
            public_key: pk.clone(),
            issued_at: issued_s.clone(),
            expires_at: expires_s.clone(),
        },
        // The "no-id" identity is a sentinel: when audit rows have agent_id =
        // NULL (unknown / no application_name), we still want a UI bucket for
        // them. The fixture audit rows reference no-id with agent_id = None.
        ProxyIdentity {
            id: "fix-no-id".into(),
            agent_name: "no-id".into(),
            principal: "(unauthenticated)".into(),
            scopes: vec![],
            public_key: pk,
            issued_at: issued_s,
            expires_at: expires_s,
        },
    ]
}

fn fixture_audit_rows() -> Vec<AuditRow> {
    // Deterministic distribution over the last hour. The mix is shaped to
    // look like real agent traffic so the UI gets exercised: claude-code
    // fires the same SELECT 200x (the rediscovery pattern), cursor mixes
    // analytics, codex does a small batch, custom-agent does writes, and a
    // sliver of rows have no identity.
    let now = chrono::Utc::now();
    let mut rows: Vec<AuditRow> = Vec::with_capacity(1000);

    let push = |rows: &mut Vec<AuditRow>,
                    i: usize,
                    agent: Option<(&str, &str)>,
                    conn: &str,
                    msg_type: &str,
                    query: Option<&str>,
                    bytes: i64| {
        // Distribute across the last hour evenly. Index 0 is oldest.
        let secs_back = 3600 - (i as i64 * 3600 / 1000);
        let ts = now - chrono::Duration::seconds(secs_back);
        rows.push(AuditRow {
            id: i as i64 + 1,
            ts: ts.to_rfc3339(),
            agent_id: agent.map(|(id, _)| id.to_string()),
            agent_name: agent.map(|(_, n)| n.to_string()),
            conn_id: conn.to_string(),
            direction: "client".into(),
            msg_type: msg_type.into(),
            query_text: query.map(String::from),
            bytes,
            sig: format!("fix-sig-{i:04}"),
        });
    };

    // claude-code: 600 rows, 80% are duplicate SELECT users by email
    for i in 0..600 {
        let dup = i % 5 != 0;
        let q = if dup {
            "SELECT * FROM users WHERE email = $1"
        } else {
            "SELECT id, name FROM accounts WHERE created_at > NOW() - INTERVAL '7 day'"
        };
        push(
            &mut rows,
            i,
            Some(("fix-claude-code", "claude-code")),
            "conn-cc-1",
            "Query",
            Some(q),
            (q.len() + 5) as i64,
        );
    }
    // cursor: 200 rows, mixed analytics
    for i in 600..800 {
        let q = match i % 4 {
            0 => "SELECT COUNT(*) FROM events WHERE ts > $1",
            1 => "SELECT agent, SUM(cost_usd) FROM costs GROUP BY agent",
            2 => "SELECT * FROM sessions WHERE is_live = true",
            _ => "SELECT MAX(ts) FROM heartbeats",
        };
        push(
            &mut rows,
            i,
            Some(("fix-cursor", "cursor")),
            "conn-cu-1",
            "Query",
            Some(q),
            (q.len() + 5) as i64,
        );
    }
    // codex: 100 rows, bursty Parse + Bind + Execute
    for i in 800..900 {
        let (mt, q) = match i % 3 {
            0 => ("Parse", Some("SELECT title FROM tickets WHERE id = $1")),
            1 => ("Bind", None),
            _ => ("Execute", None),
        };
        push(
            &mut rows,
            i,
            Some(("fix-codex", "codex")),
            "conn-cx-1",
            mt,
            q,
            32,
        );
    }
    // custom-agent: 70 rows, INSERT/UPDATE traffic
    for i in 900..970 {
        let q = if i % 2 == 0 {
            "INSERT INTO audit_dev (id, body) VALUES ($1, $2)"
        } else {
            "UPDATE settings SET value = $1 WHERE key = $2"
        };
        push(
            &mut rows,
            i,
            Some(("fix-custom-agent", "custom-agent")),
            "conn-ca-1",
            "Query",
            Some(q),
            (q.len() + 12) as i64,
        );
    }
    // no-id (unauthenticated): 30 rows
    for i in 970..1000 {
        push(
            &mut rows,
            i,
            None,
            "conn-anon-1",
            "Query",
            Some("SELECT 1"),
            16,
        );
    }
    // Rows are oldest→newest; UI expects newest first (descending id).
    rows.reverse();
    rows
}

fn fixture_filter_audit(filter: &AuditFilter, cursor: Option<i64>, limit: u32) -> Vec<AuditRow> {
    let all = fixture_audit_rows();
    all.into_iter()
        .filter(|r| match &filter.agent_id {
            Some(a) => r.agent_id.as_deref() == Some(a.as_str()),
            None => true,
        })
        .filter(|r| match &filter.since_ts {
            Some(ts) => r.ts.as_str() >= ts.as_str(),
            None => true,
        })
        .filter(|r| match &filter.msg_type {
            Some(m) => r.msg_type == *m,
            None => true,
        })
        .filter(|r| match cursor {
            Some(c) => r.id < c,
            None => true,
        })
        .take(limit.min(10_000) as usize)
        .collect()
}

fn fixture_counters(filter_agent: Option<&str>) -> Vec<ProxyCounter> {
    let mut counts: std::collections::BTreeMap<Option<String>, (Option<String>, i64)> =
        Default::default();
    for r in fixture_audit_rows() {
        if let Some(a) = filter_agent {
            if r.agent_id.as_deref() != Some(a) {
                continue;
            }
        }
        let entry = counts
            .entry(r.agent_id.clone())
            .or_insert((r.agent_name.clone(), 0));
        if matches!(r.msg_type.as_str(), "Query" | "Parse") {
            entry.1 += 1;
        }
    }
    counts
        .into_iter()
        .map(|(agent_id, (agent_name, queries_today))| ProxyCounter {
            agent_id,
            agent_name,
            queries_today,
            queries_deduped: 0,
            queries_rate_limited: 0,
        })
        .collect()
}

// ---- Public dispatch entrypoints (used by Tauri commands and tests) ----

pub fn list_identities_at(path: &PathBuf) -> Result<Vec<ProxyIdentity>, String> {
    match open_source(path)? {
        Source::Real(conn) => read_identities(&conn),
        Source::Fixture => Ok(fixture_identities()),
    }
}

pub fn read_proxy_db_at(
    path: &PathBuf,
    filter: AuditFilter,
    cursor: Option<i64>,
    limit: u32,
) -> Result<Vec<AuditRow>, String> {
    match open_source(path)? {
        Source::Real(conn) => read_audit(&conn, &filter, cursor, limit),
        Source::Fixture => Ok(fixture_filter_audit(&filter, cursor, limit)),
    }
}

pub fn proxy_counters_at(
    path: &PathBuf,
    agent_id: Option<String>,
    since: Option<String>,
) -> Result<Vec<ProxyCounter>, String> {
    match open_source(path)? {
        Source::Real(conn) => {
            let mut all = read_counters(&conn, since.as_deref())?;
            if let Some(a) = agent_id {
                all.retain(|c| c.agent_id.as_deref() == Some(a.as_str()));
            }
            Ok(all)
        }
        Source::Fixture => Ok(fixture_counters(agent_id.as_deref())),
    }
}

pub fn proxy_status_at(path: &PathBuf) -> Result<ProxyStatus, String> {
    let db_present = path.exists();
    if !db_present {
        return Ok(ProxyStatus {
            db_present: false,
            fixture_mode: true,
            identity_count: 0,
            audit_count: 0,
        });
    }
    let flags = OpenFlags::SQLITE_OPEN_READ_ONLY | OpenFlags::SQLITE_OPEN_NO_MUTEX;
    let conn = Connection::open_with_flags(path, flags)
        .map_err(|e| format!("open proxy.db: {e}"))?;
    conn.query_row("SELECT count(*) FROM sqlite_master", [], |r| r.get::<_, i64>(0))
        .map_err(|e| format!("validate proxy.db: {e}"))?;
    let identity_count = table_count(&conn, "identities")?;
    let audit_count = table_count(&conn, "audit")?;
    let fixture_mode = identity_count == 0 && audit_count == 0;
    Ok(ProxyStatus {
        db_present: true,
        fixture_mode,
        identity_count,
        audit_count,
    })
}

// Helper for malformed-DB detection used by tests. Returns Err iff the file
// exists but neither table is queryable.
#[allow(dead_code)]
fn validate_schema(path: &PathBuf) -> Result<(), String> {
    if !path.exists() {
        return Ok(()); // missing DB → fixture, not an error
    }
    let flags = OpenFlags::SQLITE_OPEN_READ_ONLY | OpenFlags::SQLITE_OPEN_NO_MUTEX;
    let conn = Connection::open_with_flags(path, flags)
        .map_err(|e| format!("open proxy.db: {e}"))?;
    let _: Option<i64> = conn
        .query_row("SELECT COUNT(*) FROM identities", [], |r| r.get(0))
        .optional()
        .map_err(|e| format!("validate identities: {e}"))?;
    let _: Option<i64> = conn
        .query_row("SELECT COUNT(*) FROM audit", [], |r| r.get(0))
        .optional()
        .map_err(|e| format!("validate audit: {e}"))?;
    Ok(())
}

// ---- Tauri command shims ----

#[tauri::command(rename_all = "snake_case")]
pub fn list_identities() -> Result<Vec<ProxyIdentity>, String> {
    list_identities_at(&default_proxy_db_path())
}

#[tauri::command(rename_all = "snake_case")]
pub fn read_proxy_db(
    filter: Option<AuditFilter>,
    cursor: Option<i64>,
    limit: Option<u32>,
) -> Result<Vec<AuditRow>, String> {
    read_proxy_db_at(
        &default_proxy_db_path(),
        filter.unwrap_or_default(),
        cursor,
        limit.unwrap_or(200),
    )
}

#[tauri::command(rename_all = "snake_case")]
pub fn proxy_counters(
    agent_id: Option<String>,
    since: Option<String>,
) -> Result<Vec<ProxyCounter>, String> {
    proxy_counters_at(&default_proxy_db_path(), agent_id, since)
}

#[tauri::command(rename_all = "snake_case")]
pub fn proxy_status() -> Result<ProxyStatus, String> {
    proxy_status_at(&default_proxy_db_path())
}

// ---- Tests ----

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use std::sync::atomic::{AtomicU64, Ordering};

    // Each test gets a unique temp path so parallel cargo test runs don't
    // collide on a shared file.
    static COUNTER: AtomicU64 = AtomicU64::new(0);

    fn temp_db_path() -> PathBuf {
        let n = COUNTER.fetch_add(1, Ordering::SeqCst);
        let pid = std::process::id();
        std::env::temp_dir().join(format!("vigil-proxy-test-{pid}-{n}.db"))
    }

    fn create_schema(conn: &Connection) {
        conn.execute_batch(
            "CREATE TABLE identities (
                id TEXT PRIMARY KEY,
                agent_name TEXT NOT NULL,
                principal TEXT NOT NULL,
                scopes TEXT NOT NULL,
                public_key TEXT NOT NULL,
                issued_at TEXT NOT NULL,
                expires_at TEXT NOT NULL
             );
             CREATE TABLE audit (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                ts TEXT NOT NULL,
                agent_id TEXT,
                agent_name TEXT,
                conn_id TEXT NOT NULL,
                direction TEXT NOT NULL,
                msg_type TEXT NOT NULL,
                query_text TEXT,
                bytes INTEGER NOT NULL,
                sig TEXT NOT NULL
             );",
        )
        .unwrap();
    }

    #[test]
    fn missing_db_returns_fixture_data() {
        let path = temp_db_path();
        // Sanity: ensure path doesn't exist.
        let _ = fs::remove_file(&path);

        let status = proxy_status_at(&path).unwrap();
        assert!(!status.db_present);
        assert!(status.fixture_mode);

        let idents = list_identities_at(&path).unwrap();
        assert_eq!(idents.len(), 5);
        let names: Vec<_> = idents.iter().map(|i| i.agent_name.as_str()).collect();
        assert!(names.contains(&"claude-code"));
        assert!(names.contains(&"no-id"));

        let audit =
            read_proxy_db_at(&path, AuditFilter::default(), None, 1000).unwrap();
        assert_eq!(audit.len(), 1000);
        // newest-first ordering.
        assert!(audit[0].id > audit[audit.len() - 1].id);

        let counters = proxy_counters_at(&path, None, None).unwrap();
        assert!(counters.len() >= 4); // claude-code, cursor, codex, custom-agent, plus None
        let cc = counters
            .iter()
            .find(|c| c.agent_name.as_deref() == Some("claude-code"))
            .unwrap();
        assert_eq!(cc.queries_today, 600);
        assert_eq!(cc.queries_deduped, 0);
        assert_eq!(cc.queries_rate_limited, 0);
    }

    #[test]
    fn empty_db_falls_back_to_fixture() {
        let path = temp_db_path();
        let _ = fs::remove_file(&path);
        let conn = Connection::open(&path).unwrap();
        create_schema(&conn);
        drop(conn);

        let status = proxy_status_at(&path).unwrap();
        assert!(status.db_present);
        assert!(status.fixture_mode); // empty tables → fixture mode

        let audit =
            read_proxy_db_at(&path, AuditFilter::default(), None, 1000).unwrap();
        assert_eq!(audit.len(), 1000); // fixture rows

        let _ = fs::remove_file(&path);
    }

    #[test]
    fn malformed_db_returns_err_not_panic() {
        let path = temp_db_path();
        let _ = fs::remove_file(&path);
        // Write garbage that isn't a valid SQLite file.
        fs::write(&path, b"this is not a database").unwrap();

        let status = proxy_status_at(&path);
        assert!(status.is_err(), "malformed DB should Err, got {status:?}");

        let audit = read_proxy_db_at(&path, AuditFilter::default(), None, 100);
        assert!(audit.is_err(), "malformed DB should Err on read");

        let idents = list_identities_at(&path);
        assert!(idents.is_err(), "malformed DB should Err on identities");

        let _ = fs::remove_file(&path);
    }

    #[test]
    fn populated_db_returns_real_data() {
        let path = temp_db_path();
        let _ = fs::remove_file(&path);
        let conn = Connection::open(&path).unwrap();
        create_schema(&conn);
        conn.execute(
            "INSERT INTO identities VALUES ('id-x','x-agent','dev@x','[\"read\"]','pk','2026-01-01T00:00:00Z','2027-01-01T00:00:00Z')",
            [],
        )
        .unwrap();
        for i in 0..5 {
            conn.execute(
                "INSERT INTO audit (ts,agent_id,agent_name,conn_id,direction,msg_type,query_text,bytes,sig) \
                 VALUES (?,?,?,?,?,?,?,?,?)",
                params![
                    format!("2026-05-07T12:00:0{i}Z"),
                    "id-x",
                    "x-agent",
                    "c1",
                    "client",
                    "Query",
                    format!("SELECT {i}"),
                    16i64,
                    format!("sig-{i}")
                ],
            )
            .unwrap();
        }
        drop(conn);

        let status = proxy_status_at(&path).unwrap();
        assert!(status.db_present);
        assert!(!status.fixture_mode);
        assert_eq!(status.identity_count, 1);
        assert_eq!(status.audit_count, 5);

        let idents = list_identities_at(&path).unwrap();
        assert_eq!(idents.len(), 1);
        assert_eq!(idents[0].agent_name, "x-agent");
        assert_eq!(idents[0].scopes, vec!["read".to_string()]);

        let audit =
            read_proxy_db_at(&path, AuditFilter::default(), None, 100).unwrap();
        assert_eq!(audit.len(), 5);
        // Newest first.
        assert!(audit[0].ts > audit[audit.len() - 1].ts);

        let counters = proxy_counters_at(&path, None, Some("2025-01-01".into())).unwrap();
        assert_eq!(counters.len(), 1);
        assert_eq!(counters[0].queries_today, 5);

        let _ = fs::remove_file(&path);
    }

    #[test]
    fn large_db_10k_rows_paginates_cleanly() {
        let path = temp_db_path();
        let _ = fs::remove_file(&path);
        let conn = Connection::open(&path).unwrap();
        create_schema(&conn);
        // Populate 10_000 audit rows.
        let tx = conn.unchecked_transaction().unwrap();
        for i in 0..10_000 {
            tx.execute(
                "INSERT INTO audit (ts,agent_id,agent_name,conn_id,direction,msg_type,query_text,bytes,sig) \
                 VALUES (?,?,?,?,?,?,?,?,?)",
                params![
                    format!("2026-05-07T00:00:00.{:03}Z", i % 1000),
                    "id-stress",
                    "stress",
                    "c-stress",
                    "client",
                    "Query",
                    "SELECT 1",
                    8i64,
                    "sig"
                ],
            )
            .unwrap();
        }
        tx.commit().unwrap();
        drop(conn);

        let status = proxy_status_at(&path).unwrap();
        assert_eq!(status.audit_count, 10_000);
        assert!(!status.fixture_mode);

        // First page.
        let page1 =
            read_proxy_db_at(&path, AuditFilter::default(), None, 1000).unwrap();
        assert_eq!(page1.len(), 1000);
        let last_id = page1.last().unwrap().id;

        // Second page via cursor.
        let page2 =
            read_proxy_db_at(&path, AuditFilter::default(), Some(last_id), 1000).unwrap();
        assert_eq!(page2.len(), 1000);
        // No overlap.
        assert!(page2[0].id < last_id);

        // Filter by msg_type Query (every row matches in this fixture).
        let filtered = read_proxy_db_at(
            &path,
            AuditFilter {
                agent_id: None,
                since_ts: None,
                msg_type: Some("Query".into()),
            },
            None,
            500,
        )
        .unwrap();
        assert_eq!(filtered.len(), 500);

        let _ = fs::remove_file(&path);
    }

    #[test]
    fn fixture_audit_row_count_is_exactly_one_thousand() {
        // The brief specifies 1000 audit rows in fixture mode. This is the
        // perf bar used by the React virtualization test, so lock it in.
        let rows = fixture_audit_rows();
        assert_eq!(rows.len(), 1000);
    }

    #[test]
    fn fixture_includes_no_id_rows_with_null_agent() {
        let rows = fixture_audit_rows();
        let null_count = rows.iter().filter(|r| r.agent_id.is_none()).count();
        assert!(null_count > 0, "fixture must include unauthenticated rows");
    }

    #[test]
    fn cursor_pagination_terminates() {
        let path = temp_db_path();
        let _ = fs::remove_file(&path);
        // Use fixture so we don't need a real DB to test cursor flow.
        let mut all = Vec::new();
        let mut cursor: Option<i64> = None;
        for _ in 0..20 {
            let page = read_proxy_db_at(&path, AuditFilter::default(), cursor, 100).unwrap();
            if page.is_empty() {
                break;
            }
            cursor = Some(page.last().unwrap().id);
            all.extend(page);
        }
        assert_eq!(all.len(), 1000);
        // Second walk should not duplicate rows.
        let unique: std::collections::HashSet<i64> = all.iter().map(|r| r.id).collect();
        assert_eq!(unique.len(), 1000);
    }
}
