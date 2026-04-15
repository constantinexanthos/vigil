//! GitHub CLI integration.
//!
//! Wraps `gh` CLI commands to enrich commit data with PR context.
//! Assumes `gh` is installed and authenticated. All calls gracefully
//! handle gh not being available.

use chrono::Utc;
use rusqlite::{params, Connection, Result};
use serde::{Deserialize, Serialize};
use std::path::Path;
use std::process::Command;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PullRequest {
    pub number: u32,
    pub title: String,
    pub state: String,
    pub url: String,
    #[serde(default)]
    pub additions: u32,
    #[serde(default)]
    pub deletions: u32,
    #[serde(deserialize_with = "deserialize_author", default)]
    pub author: String,
    #[serde(alias = "headRefName")]
    pub branch: String,
    #[serde(default)]
    pub labels: Vec<Label>,
    #[serde(alias = "reviewDecision", default)]
    pub review_decision: Option<String>,
    #[serde(alias = "updatedAt", default)]
    pub updated_at: Option<String>,
}

/// gh returns author as either a string or {"login": "..."}.
fn deserialize_author<'de, D>(deserializer: D) -> std::result::Result<String, D::Error>
where
    D: serde::Deserializer<'de>,
{
    let value: serde_json::Value = serde::Deserialize::deserialize(deserializer)?;
    match &value {
        serde_json::Value::String(s) => Ok(s.clone()),
        serde_json::Value::Object(map) => {
            Ok(map
                .get("login")
                .and_then(|v| v.as_str())
                .unwrap_or("unknown")
                .to_string())
        }
        _ => Ok("unknown".to_string()),
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Label {
    pub name: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Check {
    pub name: String,
    pub state: String,
    pub conclusion: Option<String>,
}

// ---------------------------------------------------------------------------
// gh CLI wrappers
// ---------------------------------------------------------------------------

/// Check if `gh` is available.
fn gh_available() -> bool {
    Command::new("gh")
        .arg("--version")
        .output()
        .map(|o| o.status.success())
        .unwrap_or(false)
}

/// Run a `gh` command and return stdout as a String, or None on failure.
fn run_gh(repo_path: &Path, args: &[&str]) -> Option<String> {
    let output = Command::new("gh")
        .args(args)
        .current_dir(repo_path)
        .output()
        .ok()?;

    if !output.status.success() {
        return None;
    }

    let text = String::from_utf8_lossy(&output.stdout).trim().to_string();
    if text.is_empty() {
        None
    } else {
        Some(text)
    }
}

/// Get the PR for the current or specified branch.
pub fn get_pr_for_branch(repo_path: &Path, branch: &str) -> Option<PullRequest> {
    let json = run_gh(
        repo_path,
        &[
            "pr", "view", branch,
            "--json", "number,title,state,url,additions,deletions,reviewDecision,author,labels,headRefName,updatedAt",
        ],
    )?;

    let mut pr: PullRequest = serde_json::from_str(&json).ok()?;
    pr.state = pr.state.to_uppercase();
    Some(pr)
}

/// Get recent PRs for the repo.
pub fn get_recent_prs(repo_path: &Path, limit: usize) -> Vec<PullRequest> {
    let json = run_gh(
        repo_path,
        &[
            "pr", "list",
            "--json", "number,title,state,url,additions,deletions,author,headRefName,updatedAt",
            "--limit", &limit.to_string(),
        ],
    );

    let Some(json) = json else { return vec![] };
    serde_json::from_str(&json).unwrap_or_default()
}

/// Get CI checks for a PR.
pub fn get_pr_checks(repo_path: &Path, pr_number: u32) -> Vec<Check> {
    let json = run_gh(
        repo_path,
        &[
            "pr", "checks", &pr_number.to_string(),
            "--json", "name,state,conclusion",
        ],
    );

    let Some(json) = json else { return vec![] };
    serde_json::from_str(&json).unwrap_or_default()
}

/// Get diff stat summary for a PR.
pub fn get_pr_diff_summary(repo_path: &Path, pr_number: u32) -> String {
    run_gh(
        repo_path,
        &["pr", "diff", &pr_number.to_string(), "--stat"],
    )
    .unwrap_or_default()
}

// ---------------------------------------------------------------------------
// Database
// ---------------------------------------------------------------------------

pub fn init_github_schema(conn: &Connection) -> Result<()> {
    conn.execute_batch(
        "
        CREATE TABLE IF NOT EXISTS pull_requests (
            id              INTEGER PRIMARY KEY AUTOINCREMENT,
            repo_path       TEXT NOT NULL,
            pr_number       INTEGER NOT NULL,
            branch          TEXT,
            title           TEXT,
            state           TEXT,
            url             TEXT,
            additions       INTEGER DEFAULT 0,
            deletions       INTEGER DEFAULT 0,
            author          TEXT,
            review_decision TEXT,
            last_synced     TEXT,
            UNIQUE(repo_path, pr_number)
        );

        CREATE INDEX IF NOT EXISTS idx_pr_repo ON pull_requests(repo_path);
        CREATE INDEX IF NOT EXISTS idx_pr_branch ON pull_requests(branch);
        ",
    )?;
    Ok(())
}

/// Upsert a PR into the database.
pub fn upsert_pr(conn: &Connection, repo_path: &str, pr: &PullRequest) -> Result<()> {
    let now = Utc::now().to_rfc3339();
    conn.execute(
        "INSERT INTO pull_requests (repo_path, pr_number, branch, title, state, url, additions, deletions, author, review_decision, last_synced)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)
         ON CONFLICT(repo_path, pr_number) DO UPDATE SET
           branch = excluded.branch,
           title = excluded.title,
           state = excluded.state,
           url = excluded.url,
           additions = excluded.additions,
           deletions = excluded.deletions,
           author = excluded.author,
           review_decision = excluded.review_decision,
           last_synced = excluded.last_synced",
        params![
            repo_path,
            pr.number,
            pr.branch,
            pr.title,
            pr.state,
            pr.url,
            pr.additions,
            pr.deletions,
            pr.author,
            pr.review_decision,
            now,
        ],
    )?;
    Ok(())
}

/// Query PRs from the database.
pub fn query_prs(conn: &Connection, repo_path: Option<&str>) -> Result<Vec<PrRow>> {
    let (sql, param_values): (String, Vec<Box<dyn rusqlite::types::ToSql>>) = if let Some(rp) = repo_path {
        (
            "SELECT pr_number, branch, title, state, url, additions, deletions, author, review_decision, repo_path
             FROM pull_requests WHERE repo_path = ? ORDER BY pr_number DESC".to_string(),
            vec![Box::new(rp.to_string()) as Box<dyn rusqlite::types::ToSql>],
        )
    } else {
        (
            "SELECT pr_number, branch, title, state, url, additions, deletions, author, review_decision, repo_path
             FROM pull_requests ORDER BY pr_number DESC".to_string(),
            vec![],
        )
    };

    let params_ref: Vec<&dyn rusqlite::types::ToSql> =
        param_values.iter().map(|p| p.as_ref()).collect();

    let mut stmt = conn.prepare(&sql)?;
    let rows = stmt.query_map(params_ref.as_slice(), |row| {
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
    })?;
    rows.collect()
}

#[derive(Debug, Clone, Serialize)]
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

/// Sync PR data for a branch. Fetches from gh, upserts into DB, returns the PR.
pub fn sync_pr_data(conn: &Connection, repo_path: &Path) -> Option<PullRequest> {
    let branch = current_branch(repo_path)?;
    let pr = get_pr_for_branch(repo_path, &branch)?;
    let rp_str = repo_path.to_string_lossy().to_string();
    upsert_pr(conn, &rp_str, &pr).ok()?;
    Some(pr)
}

/// Get the current branch for a repo.
pub fn current_branch(repo_path: &Path) -> Option<String> {
    let output = Command::new("git")
        .args(["rev-parse", "--abbrev-ref", "HEAD"])
        .current_dir(repo_path)
        .output()
        .ok()?;
    if !output.status.success() {
        return None;
    }
    let branch = String::from_utf8_lossy(&output.stdout).trim().to_string();
    if branch.is_empty() || branch == "HEAD" {
        None
    } else {
        Some(branch)
    }
}

/// Check if a repo is a GitHub repo (has a remote pointing to github.com).
pub fn is_github_repo(repo_path: &Path) -> bool {
    let output = Command::new("git")
        .args(["remote", "-v"])
        .current_dir(repo_path)
        .output();
    match output {
        Ok(o) if o.status.success() => {
            let text = String::from_utf8_lossy(&o.stdout);
            text.contains("github.com")
        }
        _ => false,
    }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;
    use rusqlite::Connection;

    fn setup_db() -> Connection {
        let conn = Connection::open_in_memory().unwrap();
        init_github_schema(&conn).unwrap();
        conn
    }

    #[test]
    fn parse_pr_json() {
        let json = r#"{
            "number": 42,
            "title": "feat: add auth",
            "state": "OPEN",
            "url": "https://github.com/user/repo/pull/42",
            "additions": 150,
            "deletions": 30,
            "author": {"login": "costa"},
            "headRefName": "feat/auth",
            "labels": [{"name": "enhancement"}],
            "reviewDecision": "APPROVED",
            "updatedAt": "2026-04-14T10:00:00Z"
        }"#;

        let pr: PullRequest = serde_json::from_str(json).unwrap();

        assert_eq!(pr.number, 42);
        assert_eq!(pr.title, "feat: add auth");
        assert_eq!(pr.state, "OPEN");
        assert_eq!(pr.additions, 150);
        assert_eq!(pr.deletions, 30);
        assert_eq!(pr.author, "costa");
        assert_eq!(pr.branch, "feat/auth");
        assert_eq!(pr.review_decision, Some("APPROVED".into()));
        assert_eq!(pr.labels.len(), 1);
        assert_eq!(pr.labels[0].name, "enhancement");
    }

    #[test]
    fn parse_checks_json() {
        let json = r#"[
            {"name": "build", "state": "SUCCESS", "conclusion": "SUCCESS"},
            {"name": "lint", "state": "FAILURE", "conclusion": "FAILURE"}
        ]"#;
        let checks: Vec<Check> = serde_json::from_str(json).unwrap();
        assert_eq!(checks.len(), 2);
        assert_eq!(checks[0].name, "build");
        assert_eq!(checks[1].conclusion, Some("FAILURE".into()));
    }

    #[test]
    fn parse_pr_list_json() {
        let json = r#"[
            {
                "number": 1,
                "title": "first",
                "state": "OPEN",
                "url": "https://github.com/user/repo/pull/1",
                "additions": 10,
                "deletions": 5,
                "author": {"login": "alice"},
                "headRefName": "feat-a",
                "updatedAt": "2026-04-14T10:00:00Z"
            },
            {
                "number": 2,
                "title": "second",
                "state": "MERGED",
                "url": "https://github.com/user/repo/pull/2",
                "additions": 20,
                "deletions": 0,
                "author": {"login": "bob"},
                "headRefName": "feat-b",
                "updatedAt": "2026-04-13T10:00:00Z"
            }
        ]"#;
        let prs: Vec<PullRequest> = serde_json::from_str(json).unwrap();
        assert_eq!(prs.len(), 2);
        assert_eq!(prs[0].author, "alice");
        assert_eq!(prs[1].state, "MERGED");
    }

    #[test]
    fn upsert_and_query_pr() {
        let conn = setup_db();
        let pr = PullRequest {
            number: 10,
            title: "test pr".into(),
            state: "OPEN".into(),
            url: "https://github.com/test/repo/pull/10".into(),
            additions: 50,
            deletions: 10,
            author: "costa".into(),
            branch: "feat/test".into(),
            labels: vec![],
            review_decision: Some("APPROVED".into()),
            updated_at: None,
        };

        upsert_pr(&conn, "/tmp/repo", &pr).unwrap();

        let rows = query_prs(&conn, Some("/tmp/repo")).unwrap();
        assert_eq!(rows.len(), 1);
        assert_eq!(rows[0].pr_number, 10);
        assert_eq!(rows[0].title.as_deref(), Some("test pr"));
        assert_eq!(rows[0].author.as_deref(), Some("costa"));
    }

    #[test]
    fn upsert_updates_existing() {
        let conn = setup_db();
        let pr1 = PullRequest {
            number: 5,
            title: "draft".into(),
            state: "OPEN".into(),
            url: "https://github.com/test/repo/pull/5".into(),
            additions: 10,
            deletions: 0,
            author: "alice".into(),
            branch: "feat/draft".into(),
            labels: vec![],
            review_decision: None,
            updated_at: None,
        };
        upsert_pr(&conn, "/tmp/repo", &pr1).unwrap();

        // Update same PR.
        let pr2 = PullRequest {
            number: 5,
            title: "ready for review".into(),
            state: "OPEN".into(),
            url: "https://github.com/test/repo/pull/5".into(),
            additions: 50,
            deletions: 5,
            author: "alice".into(),
            branch: "feat/draft".into(),
            labels: vec![],
            review_decision: Some("CHANGES_REQUESTED".into()),
            updated_at: None,
        };
        upsert_pr(&conn, "/tmp/repo", &pr2).unwrap();

        let rows = query_prs(&conn, Some("/tmp/repo")).unwrap();
        assert_eq!(rows.len(), 1);
        assert_eq!(rows[0].title.as_deref(), Some("ready for review"));
        assert_eq!(rows[0].additions, 50);
        assert_eq!(
            rows[0].review_decision.as_deref(),
            Some("CHANGES_REQUESTED")
        );
    }

    #[test]
    fn query_all_repos() {
        let conn = setup_db();
        let pr1 = PullRequest {
            number: 1,
            title: "a".into(),
            state: "OPEN".into(),
            url: "".into(),
            additions: 0,
            deletions: 0,
            author: "x".into(),
            branch: "b1".into(),
            labels: vec![],
            review_decision: None,
            updated_at: None,
        };
        let pr2 = PullRequest {
            number: 2,
            title: "b".into(),
            state: "MERGED".into(),
            url: "".into(),
            additions: 0,
            deletions: 0,
            author: "y".into(),
            branch: "b2".into(),
            labels: vec![],
            review_decision: None,
            updated_at: None,
        };
        upsert_pr(&conn, "/tmp/repo1", &pr1).unwrap();
        upsert_pr(&conn, "/tmp/repo2", &pr2).unwrap();

        let all = query_prs(&conn, None).unwrap();
        assert_eq!(all.len(), 2);

        let repo1 = query_prs(&conn, Some("/tmp/repo1")).unwrap();
        assert_eq!(repo1.len(), 1);
    }

    #[test]
    fn gh_not_installed_returns_empty() {
        // This tests graceful handling when gh is not available.
        // If gh IS installed, this still works — it just returns real data.
        let prs = get_recent_prs(Path::new("/nonexistent/path"), 5);
        // Either empty (no gh or bad path) or some results — no panic.
        let _ = prs;
    }

    #[test]
    fn schema_creation_idempotent() {
        let conn = Connection::open_in_memory().unwrap();
        init_github_schema(&conn).unwrap();
        init_github_schema(&conn).unwrap(); // Should not fail.
    }
}
