use std::path::PathBuf;
use std::sync::{Arc, Mutex};

use chrono::{Duration, Utc};
use clap::{Parser, Subcommand};

use crate::git::GitEventKind;
use crate::hooks::claude;
use crate::process::ProcessScanner;
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

    // Handle new worktrees — log them. The git monitor already detects
    // worktree creation; this channel lets us add additional monitoring.
    tokio::spawn(async move {
        while let Some(wt_path) = worktree_rx.recv().await {
            eprintln!("vigil: new worktree detected at {}", wt_path.display());
        }
    });

    // Git event consumer.
    let git_db = Arc::clone(&db);
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
                        Some(format!("{hash} {message}")),
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

            let agent_event = AgentEvent {
                id: None,
                timestamp: git_event.timestamp,
                kind,
                file_path,
                agent: "unknown-agent".to_string(),
                session_id: None,
                repo_path: Some(git_event.repo_path.to_string_lossy().to_string()),
                branch,
                diff,
                metadata: None,
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
            s.identify_agent(0)
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
