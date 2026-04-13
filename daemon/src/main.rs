mod cli;
mod process;
mod store;
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
    }
}
