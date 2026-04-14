mod cli;
mod cost;
mod git;
mod hooks;
mod process;
mod store;
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
        Command::Cost { agent, since, sessions } => cli::run_cost(agent, since, sessions),
    }
}
