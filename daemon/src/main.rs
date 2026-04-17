mod cli;
mod digest;
mod cost;
mod git;
mod github;
mod hallucination;
mod hooks;
mod host;
mod process;
mod rollback;
mod sessionlog;
mod store;
mod summarizer;
pub mod trust;
mod watcher;

use clap::Parser;
use cli::{Cli, Command};

#[tokio::main]
async fn main() {
    let cli = Cli::parse();

    match cli.command {
        Command::Watch { dirs } => cli::run_watch(dirs).await,
        Command::Status => cli::run_status(),
        Command::Log { agent, file, limit } => cli::run_log(agent, file, limit),
        Command::Hook { provider } => cli::run_hook(&provider),
        Command::Init => cli::run_init(),
        Command::Reattribute { dry_run } => cli::run_reattribute(dry_run),
        Command::Cost { agent, since, sessions } => cli::run_cost(agent, since, sessions),
        Command::Sessions { agent, since } => cli::run_sessions(agent, since),
        Command::Rollback { session_id, reject_all, dry_run } => cli::run_rollback(&session_id, reject_all, dry_run),
        Command::Hallucinations { agent, since } => cli::run_hallucinations(agent, since),
        Command::Prs { repo } => cli::run_prs(repo),
        Command::Dashboard { once } => cli::run_dashboard(once),
    }
}
