use std::path::PathBuf;
use std::sync::{Arc, Mutex};

use chrono::{DateTime, Duration, Utc};
use clap::{Parser, Subcommand};

use crate::git::GitEventKind;
use crate::hooks::claude;
use crate::process::{Agent, ProcessScanner};
use crate::store::{AgentEvent, EventKind, EventQuery, Store};
use crate::watcher::FsEventKind;

#[derive(Parser)]
#[command(name = "vigil", about = "The control plane for coding agents")]
pub struct Cli {
    #[command(subcommand)]
    pub command: Command,
}

#[derive(Subcommand)]
pub enum Command {
    /// Start the daemon, watching the given directories
    Watch {
        /// Directories to monitor
        #[arg(required = true)]
        dirs: Vec<PathBuf>,
    },
    /// Show active agents and recent collisions
    Status,
    /// Query the event log
    Log {
        /// Filter by agent name
        #[arg(long)]
        agent: Option<String>,
        /// Filter by file path
        #[arg(long)]
        file: Option<String>,
        /// Max number of events to show
        #[arg(long, default_value = "50")]
        limit: u32,
    },
    /// Receive a hook event from a coding agent (called by the agent, not the user)
    Hook {
        /// Provider name (e.g. "claude")
        provider: String,
    },
    /// Register vigil hooks with coding agents and initialize config
    Init,
    /// List detected agent sessions
    Sessions {
        /// Filter by agent name
        #[arg(long)]
        agent: Option<String>,
        /// Time window (e.g. "1h", "24h", "7d"). Default: 24h
        #[arg(long, default_value = "24h")]
        since: String,
    },
    /// Interactively accept/reject file changes from an agent session
    Rollback {
        /// Session ID to rollback (from `vigil sessions`)
        session_id: String,
        /// Reject all files without prompting
        #[arg(long)]
        reject_all: bool,
        /// Show what would be rolled back without doing it
        #[arg(long)]
        dry_run: bool,
    },
    /// List unresolved phantom imports detected by hallucination scanner
    Hallucinations {
        /// Filter by agent name
        #[arg(long)]
        agent: Option<String>,
        /// Time window (e.g. "1h", "24h", "7d"). Default: 24h
        #[arg(long, default_value = "24h")]
        since: String,
    },
    /// Re-attribute "unknown-agent" events using neighboring event context
    Reattribute {
        /// Show what would change without modifying the database
        #[arg(long)]
        dry_run: bool,
    },
    /// Live dashboard showing all agents, alerts, and hotspots
    Dashboard {
        /// Print once and exit (for scripting)
        #[arg(long)]
        once: bool,
    },
    /// Show pull requests for watched repos
    Prs {
        /// Filter by repo path
        #[arg(long)]
        repo: Option<String>,
    },
    /// Show cost and token usage by agent and session
    Cost {
        /// Filter by agent name
        #[arg(long)]
        agent: Option<String>,
        /// Time window (e.g. "1h", "24h", "7d"). Default: 24h
        #[arg(long, default_value = "24h")]
        since: String,
        /// Show per-session breakdown
        #[arg(long)]
        sessions: bool,
    },
}

fn vigil_db_path() -> PathBuf {
    home::home_dir()
        .expect("cannot determine home directory")
        .join(".vigil")
        .join("vigil.db")
}

fn ensure_vigil_dir() {
    let dir = home::home_dir()
        .expect("cannot determine home directory")
        .join(".vigil");
    std::fs::create_dir_all(&dir).expect("failed to create ~/.vigil");
}

/// Fetch the full diff for a commit via `git show`.
/// Returns the stat + patch output, capped at 8KB.
fn git_show_diff(repo_path: &std::path::Path, hash: &str) -> Option<String> {
    let output = std::process::Command::new("git")
        .args(["show", "--stat", "--patch", "--no-color", "-U3", hash])
        .current_dir(repo_path)
        .output()
        .ok()?;

    if !output.status.success() {
        return None;
    }

    let diff = String::from_utf8_lossy(&output.stdout);
    let trimmed = diff.trim();
    if trimmed.is_empty() {
        return None;
    }

    const MAX_DIFF_BYTES: usize = 8192;
    if trimmed.len() > MAX_DIFF_BYTES {
        Some(format!("{}…", &trimmed[..MAX_DIFF_BYTES]))
    } else {
        Some(trimmed.to_string())
    }
}

fn fs_event_kind_to_store(kind: &FsEventKind) -> EventKind {
    match kind {
        FsEventKind::Create => EventKind::FileCreate,
        FsEventKind::Modify => EventKind::FileModify,
        FsEventKind::Delete => EventKind::FileDelete,
        FsEventKind::Rename | FsEventKind::Other => EventKind::FileModify,
    }
}

pub async fn run_watch(dirs: Vec<PathBuf>) {
    ensure_vigil_dir();
    let db_path = vigil_db_path();

    let db = Store::open(&db_path).expect("failed to open store");
    let db = Arc::new(Mutex::new(db));

    eprintln!("vigil: store at {}", db_path.display());
    eprintln!("vigil: watching {} directories", dirs.len());
    for d in &dirs {
        eprintln!("  {}", d.display());
    }

    // Start file watcher.
    let (_fs_watcher, mut fs_rx) =
        crate::watcher::start(&dirs).expect("failed to start file watcher");

    // Start git monitor.
    let (_git_watcher, mut git_rx, mut worktree_rx) =
        crate::git::start(&dirs).expect("failed to start git monitor");

    eprintln!("vigil: git monitor active");

    let scanner = Arc::new(Mutex::new(ProcessScanner::new()));

    // Background collision checker -- every 5 seconds.
    let collision_db = Arc::clone(&db);
    tokio::spawn(async move {
        let mut interval = tokio::time::interval(std::time::Duration::from_secs(5));
        loop {
            interval.tick().await;
            let since = Utc::now() - Duration::minutes(5);
            let collisions = {
                let store = collision_db.lock().unwrap();
                store.file_collisions(&since)
            };
            if let Ok(collisions) = collisions {
                for (path, agents) in &collisions {
                    eprintln!(
                        "vigil: COLLISION -- {} modified by [{}]",
                        path,
                        agents.join(", ")
                    );
                }
            }
        }
    });

    // Refresh process list every 10 seconds.
    let refresh_scanner = Arc::clone(&scanner);
    tokio::spawn(async move {
        let mut interval = tokio::time::interval(std::time::Duration::from_secs(10));
        loop {
            interval.tick().await;
            let mut s = refresh_scanner.lock().unwrap();
            s.refresh();
        }
    });

    // Background GitHub PR sync — every 60 seconds.
    let gh_db = Arc::clone(&db);
    let gh_dirs = dirs.clone();
    tokio::spawn(async move {
        // Initial delay to let the daemon settle.
        tokio::time::sleep(std::time::Duration::from_secs(5)).await;
        let mut interval = tokio::time::interval(std::time::Duration::from_secs(60));
        loop {
            interval.tick().await;
            for dir in &gh_dirs {
                if !crate::github::is_github_repo(dir) {
                    continue;
                }
                let store = gh_db.lock().unwrap();
                if let Some(pr) = crate::github::sync_pr_data(store.conn(), dir) {
                    eprintln!(
                        "vigil: PR #{} ({}) — {} +{}/-{}",
                        pr.number, pr.state, pr.title, pr.additions, pr.deletions
                    );
                }
            }
        }
    });

    // Handle new worktrees — log them. The git monitor already detects
    // worktree creation; this channel lets us add additional monitoring.
    tokio::spawn(async move {
        while let Some(wt_path) = worktree_rx.recv().await {
            eprintln!("vigil: new worktree detected at {}", wt_path.display());
        }
    });

    // Git event consumer.
    let git_db = Arc::clone(&db);
    let git_scanner = Arc::clone(&scanner);
    tokio::spawn(async move {
        while let Some(git_event) = git_rx.recv().await {
            let (kind, file_path, branch, diff) = match &git_event.kind {
                GitEventKind::Commit {
                    branch,
                    hash,
                    message,
                    author,
                } => {
                    eprintln!(
                        "vigil: commit on {} by {} — {} ({})",
                        branch,
                        author,
                        message,
                        &hash[..8]
                    );
                    (
                        EventKind::GitCommit,
                        None,
                        Some(branch.clone()),
                        Some(format!("{} {}", &hash[..8.min(hash.len())], message)),
                    )
                }
                GitEventKind::BranchCreate { branch } => {
                    eprintln!("vigil: new branch — {}", branch);
                    (EventKind::GitBranchCreate, None, Some(branch.clone()), None)
                }
                GitEventKind::WorktreeCreate { worktree_path } => {
                    eprintln!(
                        "vigil: new worktree — {}",
                        worktree_path.display()
                    );
                    (
                        EventKind::GitWorktreeCreate,
                        Some(worktree_path.to_string_lossy().to_string()),
                        None,
                        None,
                    )
                }
            };

            let agent = {
                let s = git_scanner.lock().unwrap();
                let active = s.active_agents();
                if active.len() == 1 {
                    active[0].1
                } else if active.is_empty() {
                    Agent::Unknown
                } else {
                    active[0].1
                }
            };

            let agent_event = AgentEvent {
                id: None,
                timestamp: git_event.timestamp,
                kind,
                file_path,
                agent: agent.as_str().to_string(),
                session_id: None,
                repo_path: Some(git_event.repo_path.to_string_lossy().to_string()),
                branch,
                diff,
                metadata: None,
                host_kind: None,
                model: None,
                is_live: false,
            };

            let store = git_db.lock().unwrap();
            if let Err(e) = store.insert(&agent_event) {
                eprintln!("vigil: store error (git): {e}");
            }
        }
    });

    // Main file event loop.
    while let Some(fs_event) = fs_rx.recv().await {
        let agent = {
            let s = scanner.lock().unwrap();
            let active = s.active_agents();
            if active.len() == 1 {
                active[0].1
            } else if active.is_empty() {
                Agent::Unknown
            } else {
                // Multiple agents running -- pick the first known one.
                // TODO: improve heuristic by matching agent working directory to file path.
                active[0].1
            }
        };

        let agent_event = AgentEvent {
            id: None,
            timestamp: fs_event.timestamp,
            kind: fs_event_kind_to_store(&fs_event.kind),
            file_path: Some(fs_event.path.to_string_lossy().to_string()),
            agent: agent.as_str().to_string(),
            session_id: None,
            repo_path: None,
            branch: None,
            diff: fs_event.diff,
            metadata: None,
            host_kind: None,
            model: None,
            is_live: false,
        };

        {
            let store = db.lock().unwrap();
            if let Err(e) = store.insert(&agent_event) {
                eprintln!("vigil: store error: {e}");
            }
        }
    }
}

/// Handle a hook event from a coding agent.
pub fn run_hook(provider: &str) {
    ensure_vigil_dir();
    let db_path = vigil_db_path();

    match provider {
        "claude" => {
            if let Err(e) = claude::process_hook_stdin(&db_path) {
                eprintln!("vigil: hook error: {e}");
                std::process::exit(1);
            }
        }
        other => {
            eprintln!("vigil: unknown hook provider: {other}");
            std::process::exit(1);
        }
    }
}

/// Register vigil hooks with coding agents.
pub fn run_init() {
    ensure_vigil_dir();

    // Find our own binary path.
    let vigil_bin = std::env::current_exe().unwrap_or_else(|_| PathBuf::from("vigil"));

    // Register Claude Code hooks.
    match claude::register_hooks(&vigil_bin) {
        Ok(()) => println!("Registered Claude Code hooks"),
        Err(e) => eprintln!("Failed to register Claude Code hooks: {e}"),
    }

    println!("vigil init complete");
}

pub fn run_reattribute(dry_run: bool) {
    let db_path = vigil_db_path();
    if !db_path.exists() {
        println!("No vigil database found at {}", db_path.display());
        println!("Run `vigil watch <dir>` first.");
        return;
    }

    let store = Store::open(&db_path).expect("failed to open store");

    if dry_run {
        println!("DRY RUN — no changes will be made");
        println!();
    }

    let results = store.reattribute_unknown(dry_run).unwrap_or_default();

    if results.is_empty() {
        println!("No unknown-agent events could be re-attributed.");
        return;
    }

    // Count per agent.
    let mut counts: std::collections::HashMap<String, usize> = std::collections::HashMap::new();
    for (_, agent) in &results {
        *counts.entry(agent.clone()).or_default() += 1;
    }

    let verb = if dry_run { "Would re-attribute" } else { "Re-attributed" };
    let breakdown: Vec<String> = counts
        .iter()
        .map(|(agent, count)| format!("{count} to {agent}"))
        .collect();

    println!("{} {} events ({})", verb, results.len(), breakdown.join(", "));

    // Count remaining unknowns.
    let remaining: i64 = store
        .conn()
        .query_row(
            "SELECT COUNT(*) FROM events WHERE agent = 'unknown-agent'",
            [],
            |row| row.get(0),
        )
        .unwrap_or(0);

    if remaining > 0 {
        println!("{remaining} events remain as unknown-agent.");
    }
}

pub fn run_status() {
    let db_path = vigil_db_path();
    if !db_path.exists() {
        println!("No vigil database found at {}", db_path.display());
        println!("Run `vigil watch <dir>` first.");
        return;
    }

    let store = Store::open(&db_path).expect("failed to open store");

    // Active agents.
    let agents = store.active_agents().unwrap_or_default();
    println!("AGENTS");
    println!("{}", "-".repeat(40));
    if agents.is_empty() {
        println!("  (none recorded)");
    } else {
        for agent in &agents {
            println!("  {agent}");
        }
    }
    println!();

    // Collisions in last 5 minutes.
    let since = Utc::now() - Duration::minutes(5);
    let collisions = store.file_collisions(&since).unwrap_or_default();
    println!("COLLISIONS (last 5 min)");
    println!("{}", "-".repeat(40));
    if collisions.is_empty() {
        println!("  (none)");
    } else {
        for (path, agents) in &collisions {
            println!("  {} -- [{}]", path, agents.join(", "));
        }
    }
}

pub fn run_hallucinations(agent: Option<String>, since: String) {
    let db_path = vigil_db_path();
    if !db_path.exists() {
        println!("No vigil database found at {}", db_path.display());
        println!("Run `vigil watch <dir>` first.");
        return;
    }

    let store = Store::open(&db_path).expect("failed to open store");
    let since_dt = parse_duration_ago(&since);

    let results = crate::hallucination::query_hallucinations(
        store.conn(),
        agent.as_deref(),
        Some(&since_dt),
    )
    .unwrap_or_default();

    if results.is_empty() {
        println!("No phantom imports detected (last {since}).");
        return;
    }

    println!("PHANTOM IMPORTS (last {})", since);
    println!("{}", "-".repeat(70));

    const TS_W: usize = 19;
    const AGENT_W: usize = 15;

    println!(
        "{:<TS_W$}  {:<AGENT_W$}  LOCATION",
        "TIMESTAMP", "AGENT",
    );
    println!("{}", "-".repeat(70));

    for h in &results {
        let ts = h.timestamp.format("%Y-%m-%d %H:%M:%S").to_string();
        println!(
            "{:<TS_W$}  {:<AGENT_W$}  {}:{}  {}",
            ts, h.agent, h.file_path, h.line_number, h.import_path,
        );
    }

    println!();
    println!("{} unresolved phantom import(s)", results.len());
}

pub fn run_prs(repo: Option<String>) {
    let db_path = vigil_db_path();
    if !db_path.exists() {
        println!("No vigil database found at {}", db_path.display());
        println!("Run `vigil watch <dir>` first.");
        return;
    }

    let store = Store::open(&db_path).expect("failed to open store");

    // If a specific repo is given, try to sync fresh data first.
    if let Some(ref repo_path) = repo {
        let path = std::path::Path::new(repo_path);
        if path.is_dir() && crate::github::is_github_repo(path) {
            crate::github::sync_pr_data(store.conn(), path);
        }
    }

    let prs = crate::github::query_prs(store.conn(), repo.as_deref()).unwrap_or_default();

    if prs.is_empty() {
        println!("No pull requests found.");
        println!("Run `vigil watch <dir>` on a GitHub repo to sync PR data.");
        return;
    }

    println!("PULL REQUESTS");
    println!("{}", "-".repeat(70));

    for pr in &prs {
        let state = pr.state.as_deref().unwrap_or("?");
        let title = pr.title.as_deref().unwrap_or("(untitled)");
        let branch = pr.branch.as_deref().unwrap_or("-");
        let author = pr.author.as_deref().unwrap_or("?");
        let review = pr.review_decision.as_deref().unwrap_or("-");

        println!(
            "  #{:<5}  {:<8}  {:<30}  {}",
            pr.pr_number,
            state,
            truncate_str(title, 30),
            branch,
        );
        println!(
            "          +{:<5} -{:<5}  review: {:<15}  by {}",
            pr.additions, pr.deletions, review, author,
        );
        if let Some(ref url) = pr.url {
            println!("          {url}");
        }
        println!();
    }
}

fn truncate_str(s: &str, max: usize) -> String {
    if s.len() <= max {
        s.to_string()
    } else {
        format!("{}...", &s[..max - 3])
    }
}

pub fn run_cost(agent: Option<String>, since: String, sessions: bool) {
    let db_path = vigil_db_path();
    if !db_path.exists() {
        println!("No vigil database found at {}", db_path.display());
        println!("Run `vigil watch <dir>` first.");
        return;
    }

    let store = Store::open(&db_path).expect("failed to open store");

    // Backfill cost data from existing events that predate the cost table.
    let backfilled = crate::cost::backfill_from_events(store.conn()).unwrap_or(0);
    if backfilled > 0 {
        eprintln!("vigil: backfilled {} cost records from existing events", backfilled);
    }

    let since_dt = parse_duration_ago(&since);

    // Total cost.
    let total = crate::cost::total_cost(store.conn(), &since_dt).unwrap_or(0.0);

    println!("COST SUMMARY (last {})", since);
    println!("{}", "-".repeat(50));
    println!("  Total: ${:.4}", total);
    println!();

    // Per-agent breakdown.
    let summaries = crate::cost::cost_by_agent(store.conn(), &since_dt).unwrap_or_default();
    if summaries.is_empty() {
        println!("  No cost data recorded. Ensure hooks are active:");
        println!("    vigil init");
        return;
    }

    const AGENT_W: usize = 15;
    const TOKENS_W: usize = 12;
    const COST_W: usize = 10;

    println!(
        "  {:<AGENT_W$}  {:>TOKENS_W$}  {:>TOKENS_W$}  {:>COST_W$}  EVENTS",
        "AGENT", "INPUT", "OUTPUT", "COST",
    );
    println!("  {}", "-".repeat(AGENT_W + TOKENS_W * 2 + COST_W + 16));

    for s in &summaries {
        if agent.as_ref().is_some_and(|a| a != &s.agent) {
            continue;
        }
        println!(
            "  {:<AGENT_W$}  {:>TOKENS_W$}  {:>TOKENS_W$}  {:>COST_W$}  {}",
            s.agent,
            format_tokens(s.total_input_tokens),
            format_tokens(s.total_output_tokens),
            format!("${:.4}", s.total_cost_usd),
            s.event_count,
        );
        if s.total_cache_read_tokens > 0 || s.total_cache_write_tokens > 0 {
            println!(
                "  {:<AGENT_W$}  cache: {} read, {} write",
                "",
                format_tokens(s.total_cache_read_tokens),
                format_tokens(s.total_cache_write_tokens),
            );
        }
    }

    // Per-session breakdown.
    if sessions {
        println!();
        println!("SESSIONS");
        println!("{}", "-".repeat(50));

        let session_costs = crate::cost::cost_by_session(
            store.conn(),
            &since_dt,
            agent.as_deref(),
        )
        .unwrap_or_default();

        if session_costs.is_empty() {
            println!("  No session data.");
        } else {
            for sc in &session_costs {
                let model = sc.model.as_deref().unwrap_or("unknown");
                let duration = session_duration(&sc.first_seen, &sc.last_seen);
                println!(
                    "  {} ({})  {}  ${:.4}  {} events  {}",
                    &sc.session_id[..8.min(sc.session_id.len())],
                    sc.agent,
                    model,
                    sc.cost_usd,
                    sc.event_count,
                    duration,
                );
            }
        }
    }
}

fn parse_duration_ago(s: &str) -> DateTime<Utc> {
    let s = s.trim();
    let (num_str, unit) = s.split_at(s.len().saturating_sub(1));
    let num: i64 = num_str.parse().unwrap_or(24);
    let duration = match unit {
        "m" => Duration::minutes(num),
        "h" => Duration::hours(num),
        "d" => Duration::days(num),
        _ => Duration::hours(24),
    };
    Utc::now() - duration
}

fn format_tokens(n: u64) -> String {
    if n >= 1_000_000 {
        format!("{:.1}M", n as f64 / 1_000_000.0)
    } else if n >= 1_000 {
        format!("{:.1}K", n as f64 / 1_000.0)
    } else {
        n.to_string()
    }
}

fn session_duration(first: &str, last: &str) -> String {
    let first_dt = DateTime::parse_from_rfc3339(first).ok().map(|d| d.with_timezone(&Utc));
    let last_dt = DateTime::parse_from_rfc3339(last).ok().map(|d| d.with_timezone(&Utc));
    match (first_dt, last_dt) {
        (Some(f), Some(l)) => {
            let secs = (l - f).num_seconds();
            if secs < 60 {
                format!("{secs}s")
            } else if secs < 3600 {
                format!("{}m", secs / 60)
            } else {
                format!("{}h {}m", secs / 3600, (secs % 3600) / 60)
            }
        }
        _ => "-".to_string(),
    }
}

pub fn run_sessions(agent: Option<String>, since: String) {
    let db_path = vigil_db_path();
    if !db_path.exists() {
        println!("No vigil database found at {}", db_path.display());
        println!("Run `vigil watch <dir>` first.");
        return;
    }

    let store = Store::open(&db_path).expect("failed to open store");
    let since_dt = parse_duration_ago(&since);

    let sessions = crate::rollback::get_sessions(store.conn(), &since_dt, agent.as_deref())
        .unwrap_or_default();

    if sessions.is_empty() {
        println!("No sessions found in the last {since}.");
        return;
    }

    const ID_W: usize = 8;
    const AGENT_W: usize = 15;
    const TIME_W: usize = 19;
    const FILES_W: usize = 6;

    println!(
        "{:<ID_W$}  {:<AGENT_W$}  {:<TIME_W$}  {:<TIME_W$}  {:>FILES_W$}  EVENTS",
        "ID", "AGENT", "START", "END", "FILES",
    );
    println!("{}", "-".repeat(ID_W + AGENT_W + TIME_W * 2 + FILES_W + 20));

    for s in &sessions {
        println!(
            "{:<ID_W$}  {:<AGENT_W$}  {:<TIME_W$}  {:<TIME_W$}  {:>FILES_W$}  {}",
            s.id,
            s.agent,
            s.start_time.format("%Y-%m-%d %H:%M:%S"),
            s.end_time.format("%Y-%m-%d %H:%M:%S"),
            s.file_count,
            s.event_count,
        );
    }
}

pub fn run_rollback(session_id: &str, reject_all: bool, dry_run: bool) {
    let db_path = vigil_db_path();
    if !db_path.exists() {
        println!("No vigil database found at {}", db_path.display());
        println!("Run `vigil watch <dir>` first.");
        return;
    }

    let store = Store::open(&db_path).expect("failed to open store");
    let since = Utc::now() - Duration::days(7); // Look back 7 days for sessions.

    let sessions = crate::rollback::get_sessions(store.conn(), &since, None)
        .unwrap_or_default();

    let session = match sessions.iter().find(|s| s.id == session_id) {
        Some(s) => s,
        None => {
            println!("Session '{session_id}' not found. Run `vigil sessions` to list.");
            return;
        }
    };

    println!(
        "Session: {} ({})  {} files  {} events",
        session.id, session.agent, session.file_count, session.event_count,
    );
    println!(
        "  {} to {}",
        session.start_time.format("%Y-%m-%d %H:%M:%S"),
        session.end_time.format("%Y-%m-%d %H:%M:%S"),
    );
    if dry_run {
        println!("  (dry run — no changes will be made)");
    }
    println!();

    let result = crate::rollback::interactive_rollback(session, dry_run, reject_all);

    println!();
    println!("SUMMARY");
    println!("{}", "-".repeat(40));
    println!(
        "  Accepted {} files, rejected {} files, skipped {} files",
        result.accepted, result.rejected, result.skipped,
    );
    if !result.errors.is_empty() {
        println!("  Errors:");
        for e in &result.errors {
            println!("    {e}");
        }
    }
}

pub fn run_log(agent: Option<String>, file: Option<String>, limit: u32) {
    let db_path = vigil_db_path();
    if !db_path.exists() {
        println!("No vigil database found at {}", db_path.display());
        println!("Run `vigil watch <dir>` first.");
        return;
    }

    let store = Store::open(&db_path).expect("failed to open store");

    let query = EventQuery {
        agent,
        file_path: file,
        limit: Some(limit),
        ..Default::default()
    };

    let events = store.query(&query).unwrap_or_default();

    if events.is_empty() {
        println!("No events found.");
        return;
    }

    // Column widths.
    const TS_W: usize = 19;
    const AGENT_W: usize = 15;
    const KIND_W: usize = 12;

    println!(
        "{:<TS_W$}  {:<AGENT_W$}  {:<KIND_W$}  FILE",
        "TIMESTAMP", "AGENT", "KIND",
    );
    println!("{}", "-".repeat(TS_W + AGENT_W + KIND_W + 30));

    for event in &events {
        let ts = event.timestamp.format("%Y-%m-%d %H:%M:%S").to_string();
        let kind = event.kind.as_str();
        let file = event.file_path.as_deref().unwrap_or("-");

        println!(
            "{:<TS_W$}  {:<AGENT_W$}  {:<KIND_W$}  {file}",
            ts, event.agent, kind,
        );
    }
}

pub fn run_dashboard(once: bool) {
    let db_path = vigil_db_path();
    if !db_path.exists() {
        eprintln!("No vigil database found at {}", db_path.display());
        eprintln!("Run `vigil watch <dir>` first.");
        std::process::exit(1);
    }

    loop {
        let store = Store::open(&db_path).expect("failed to open store");
        let summary = crate::digest::generate_live_summary(&store);

        if !once { print!("\x1b[2J\x1b[H"); }

        // Header
        if let Some(brpm) = summary.burn_rate_per_min {
            let partial = if summary.burn_rate_partial { " (partial)" } else { "" };
            println!("VIGIL DASHBOARD                                    ${:.2}/hr{}", brpm * 60.0, partial);
        } else {
            println!("VIGIL DASHBOARD");
        }
        println!("{}", "-".repeat(61));

        // Agents
        println!("AGENTS");
        if summary.agents.is_empty() {
            println!("  (none detected)");
        } else {
            for agent in &summary.agents {
                let dot = if agent.status == "active" { "\u{25cf}" } else { "\u{25cb}" };
                let cost_str = agent.cost_1h.map(|c| format!("${:.2}", c)).unwrap_or_else(|| "\u{2014}".to_string());
                let conf_str = agent.confidence.map(|c| format!("{:.0}", c)).unwrap_or_else(|| "-".to_string());
                if agent.status == "active" {
                    let file = agent.current_file.as_deref().map(|f| {
                        let p: Vec<&str> = f.split('/').collect();
                        if p.len() <= 2 { f.to_string() } else { p[p.len()-2..].join("/") }
                    }).unwrap_or_default();
                    println!("  {:<15} {} active   {:<25} {:<7} {}", agent.agent, dot, file, cost_str, conf_str);
                } else {
                    println!("  {:<15} {} idle     (no recent activity)", agent.agent, dot);
                }
            }
        }
        println!();

        if !summary.alerts.is_empty() {
            println!("ALERTS");
            for alert in &summary.alerts {
                let pfx = match alert.severity.as_str() { "critical" => "!! ", "warning" => "!  ", _ => "   " };
                println!("  {}{}", pfx, alert.message);
            }
            println!();
        }

        if !summary.hotspots.is_empty() {
            println!("HOTSPOTS");
            for (file, agents) in &summary.hotspots {
                let short = { let p: Vec<&str> = file.split('/').collect(); if p.len() <= 2 { file.clone() } else { p[p.len()-2..].join("/") } };
                println!("  {:<30} {}", short, agents.join(", "));
            }
            println!();
        }

        if once { break; }
        std::thread::sleep(std::time::Duration::from_secs(2));
    }
}
