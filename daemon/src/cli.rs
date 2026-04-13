use std::path::PathBuf;
use std::time::Duration;

use clap::{Parser, Subcommand};

use crate::store::{QueryFilters, Store};

#[derive(Parser)]
#[command(name = "vigil", about = "The control plane for coding agents")]
pub struct Cli {
    /// Path to the Vigil database file.
    #[arg(long, global = true, default_value_os_t = Store::default_path())]
    pub db: PathBuf,

    #[command(subcommand)]
    pub command: Command,
}

#[derive(Subcommand)]
pub enum Command {
    /// Start the daemon and watch the given directories for agent activity.
    Watch {
        /// Directories to monitor.
        #[arg(required = true)]
        dirs: Vec<PathBuf>,
    },

    /// Show active agents and file collision warnings.
    Status,

    /// Show the event log, optionally filtered.
    Log {
        /// Filter by agent name (e.g. claude-code, cursor).
        #[arg(long)]
        agent: Option<String>,

        /// Filter by file path substring.
        #[arg(long)]
        file: Option<String>,

        /// Maximum number of events to show.
        #[arg(long, default_value_t = 50)]
        limit: usize,
    },
}

/// Run the `vigil status` subcommand.
pub fn run_status(store: &Store) -> anyhow::Result<()> {
    let agents = store.active_agents(Duration::from_secs(300))?;
    let collisions = store.file_collisions(Duration::from_secs(300))?;

    if agents.is_empty() {
        println!("No active agents in the last 5 minutes.");
    } else {
        println!("Active agents (last 5 min):");
        for agent in &agents {
            println!("  {agent}");
        }
    }

    if collisions.is_empty() {
        println!("\nNo file collisions.");
    } else {
        println!("\nFile collisions (last 5 min):");
        println!(
            "  {:<40} {:<30} {}",
            "FILE", "AGENTS", "LAST SEEN"
        );
        for c in &collisions {
            let agents_str = c.agents.join(", ");
            println!("  {:<40} {:<30} {}", c.path, agents_str, c.last_seen);
        }
    }

    Ok(())
}

/// Run the `vigil log` subcommand.
pub fn run_log(store: &Store, agent: Option<String>, file: Option<String>, limit: usize) -> anyhow::Result<()> {
    let filters = QueryFilters {
        agent,
        file,
        limit: Some(limit),
    };
    let events = store.query(&filters)?;

    if events.is_empty() {
        println!("No events found.");
        return Ok(());
    }

    println!(
        "{:<24} {:<16} {:<10} {}",
        "TIMESTAMP", "AGENT", "KIND", "FILE"
    );
    for e in &events {
        println!(
            "{:<24} {:<16} {:<10} {}",
            e.timestamp, e.agent, e.kind, e.path
        );
    }

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use clap::Parser;

    #[test]
    fn parse_watch() {
        let cli = Cli::parse_from(["vigil", "watch", "/tmp/project"]);
        match cli.command {
            Command::Watch { dirs } => {
                assert_eq!(dirs.len(), 1);
                assert_eq!(dirs[0], PathBuf::from("/tmp/project"));
            }
            _ => panic!("expected Watch"),
        }
    }

    #[test]
    fn parse_watch_multiple_dirs() {
        let cli = Cli::parse_from(["vigil", "watch", "/a", "/b", "/c"]);
        match cli.command {
            Command::Watch { dirs } => assert_eq!(dirs.len(), 3),
            _ => panic!("expected Watch"),
        }
    }

    #[test]
    fn parse_status() {
        let cli = Cli::parse_from(["vigil", "status"]);
        assert!(matches!(cli.command, Command::Status));
    }

    #[test]
    fn parse_log_defaults() {
        let cli = Cli::parse_from(["vigil", "log"]);
        match cli.command {
            Command::Log { agent, file, limit } => {
                assert!(agent.is_none());
                assert!(file.is_none());
                assert_eq!(limit, 50);
            }
            _ => panic!("expected Log"),
        }
    }

    #[test]
    fn parse_log_with_filters() {
        let cli = Cli::parse_from([
            "vigil", "log", "--agent", "claude-code", "--file", "main.rs", "--limit", "10",
        ]);
        match cli.command {
            Command::Log { agent, file, limit } => {
                assert_eq!(agent.as_deref(), Some("claude-code"));
                assert_eq!(file.as_deref(), Some("main.rs"));
                assert_eq!(limit, 10);
            }
            _ => panic!("expected Log"),
        }
    }

    #[test]
    fn parse_custom_db_path() {
        let cli = Cli::parse_from(["vigil", "--db", "/tmp/test.db", "status"]);
        assert_eq!(cli.db, PathBuf::from("/tmp/test.db"));
    }
}
