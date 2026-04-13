mod cli;
mod process;
mod store;

use clap::Parser;

use cli::{Cli, Command};
use store::Store;

fn main() -> anyhow::Result<()> {
    let args = Cli::parse();

    match args.command {
        Command::Watch { dirs } => {
            println!("Watching: {}", dirs.iter().map(|d| d.display().to_string()).collect::<Vec<_>>().join(", "));
            println!("Daemon not yet implemented — exiting.");
        }
        Command::Status => {
            let store = Store::open_readonly(&args.db)?;
            cli::run_status(&store)?;
        }
        Command::Log { agent, file, limit } => {
            let store = Store::open_readonly(&args.db)?;
            cli::run_log(&store, agent, file, limit)?;
        }
    }

    Ok(())
}
