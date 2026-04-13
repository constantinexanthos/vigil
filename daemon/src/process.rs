use sysinfo::{Pid, Process, System};

/// Known coding agent identifiers, matched against process name and command-line args.
const AGENT_SIGNATURES: &[AgentSignature] = &[
    AgentSignature {
        agent: Agent::ClaudeCode,
        name_contains: &["claude"],
        arg_contains: &["claude"],
    },
    AgentSignature {
        agent: Agent::Cursor,
        name_contains: &["cursor-helper", "Cursor Helper"],
        arg_contains: &["cursor-helper"],
    },
    AgentSignature {
        agent: Agent::Conductor,
        name_contains: &["conductor"],
        arg_contains: &["conductor"],
    },
    AgentSignature {
        agent: Agent::Aider,
        name_contains: &["aider"],
        arg_contains: &["aider"],
    },
    AgentSignature {
        agent: Agent::Codex,
        name_contains: &["codex"],
        arg_contains: &["codex"],
    },
    AgentSignature {
        agent: Agent::Cline,
        name_contains: &["cline", "roo"],
        arg_contains: &["cline", "roo"],
    },
];

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum Agent {
    ClaudeCode,
    Cursor,
    Conductor,
    Aider,
    Codex,
    Cline,
    Unknown,
}

impl Agent {
    pub fn as_str(&self) -> &'static str {
        match self {
            Agent::ClaudeCode => "claude-code",
            Agent::Cursor => "cursor",
            Agent::Conductor => "conductor",
            Agent::Aider => "aider",
            Agent::Codex => "codex",
            Agent::Cline => "cline",
            Agent::Unknown => "unknown-agent",
        }
    }
}

impl std::fmt::Display for Agent {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str(self.as_str())
    }
}

struct AgentSignature {
    agent: Agent,
    /// Substrings to match against the process name (case-insensitive).
    name_contains: &'static [&'static str],
    /// Substrings to match against the full command-line args (case-insensitive).
    arg_contains: &'static [&'static str],
}

/// Scans running processes and identifies coding agents.
pub struct ProcessScanner {
    system: System,
}

impl ProcessScanner {
    pub fn new() -> Self {
        let mut system = System::new();
        system.refresh_processes(sysinfo::ProcessesToUpdate::All, true);
        Self { system }
    }

    /// Refresh the process list from the OS.
    pub fn refresh(&mut self) {
        self.system
            .refresh_processes(sysinfo::ProcessesToUpdate::All, true);
    }

    /// Identify the coding agent for a given PID.
    /// Walks up the process tree to find a known agent among ancestors.
    pub fn identify_agent(&self, pid: u32) -> Agent {
        let sysinfo_pid = Pid::from_u32(pid);

        // Check the process itself, then walk up ancestors.
        let mut current = sysinfo_pid;
        let mut depth = 0;
        const MAX_DEPTH: u32 = 10;

        while depth < MAX_DEPTH {
            if let Some(process) = self.system.process(current) {
                if let Some(agent) = match_process(process) {
                    return agent;
                }
                match process.parent() {
                    Some(parent_pid) if parent_pid != current => {
                        current = parent_pid;
                        depth += 1;
                    }
                    _ => break,
                }
            } else {
                break;
            }
        }

        Agent::Unknown
    }

    /// Return all currently running coding agents with their PIDs.
    pub fn active_agents(&self) -> Vec<(u32, Agent)> {
        let mut agents = Vec::new();
        for (pid, process) in self.system.processes() {
            if let Some(agent) = match_process(process) {
                agents.push((pid.as_u32(), agent));
            }
        }
        agents
    }
}

/// Check if a single process matches any known agent signature.
fn match_process(process: &Process) -> Option<Agent> {
    let name = process.name().to_string_lossy().to_lowercase();
    let cmd_args: String = process
        .cmd()
        .iter()
        .map(|s| s.to_string_lossy().to_lowercase())
        .collect::<Vec<_>>()
        .join(" ");

    for sig in AGENT_SIGNATURES {
        let name_match = sig.name_contains.iter().any(|s| name.contains(&s.to_lowercase()));
        let arg_match = sig.arg_contains.iter().any(|s| cmd_args.contains(&s.to_lowercase()));

        if name_match || arg_match {
            return Some(sig.agent);
        }
    }

    None
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn scanner_creates_and_refreshes() {
        let mut scanner = ProcessScanner::new();
        scanner.refresh();
        // Should not panic; process list may be empty in CI but the call succeeds.
    }

    #[test]
    fn unknown_pid_returns_unknown() {
        let scanner = ProcessScanner::new();
        // PID 0 or a very high PID won't match any agent.
        assert_eq!(scanner.identify_agent(u32::MAX), Agent::Unknown);
    }

    #[test]
    fn agent_display() {
        assert_eq!(Agent::ClaudeCode.as_str(), "claude-code");
        assert_eq!(Agent::Cursor.as_str(), "cursor");
        assert_eq!(Agent::Conductor.as_str(), "conductor");
        assert_eq!(Agent::Aider.as_str(), "aider");
        assert_eq!(Agent::Codex.as_str(), "codex");
        assert_eq!(Agent::Cline.as_str(), "cline");
        assert_eq!(Agent::Unknown.as_str(), "unknown-agent");
        assert_eq!(format!("{}", Agent::ClaudeCode), "claude-code");
    }

    #[test]
    fn active_agents_returns_list() {
        let scanner = ProcessScanner::new();
        let agents = scanner.active_agents();
        // Just verify it returns without error; contents depend on running processes.
        for (pid, agent) in &agents {
            assert!(*pid > 0);
            assert_ne!(agent.as_str(), "");
        }
    }
}
