use std::path::PathBuf;
use std::sync::{Arc, Mutex};

use chrono::{Duration, Utc};
use clap::{Parser, Subcommand};

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

    let (_watcher, mut rx) =
        crate::watcher::start(&dirs).expect("failed to start file watcher");

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

    // Main event loop.
    while let Some(fs_event) = rx.recv().await {
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
