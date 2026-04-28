use serde::{Deserialize, Serialize};
use sysinfo::{Pid, System};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum HostKind {
    Ghostty,
    Iterm2,
    Terminal,
    Warp,
    Kitty,
    Alacritty,
    Conductor,
    Cursor,
    Vscode,
    Zed,
    Windsurf,
    Unknown,
}

impl HostKind {
    pub fn as_str(self) -> &'static str {
        match self {
            HostKind::Ghostty => "ghostty",
            HostKind::Iterm2 => "iterm2",
            HostKind::Terminal => "terminal",
            HostKind::Warp => "warp",
            HostKind::Kitty => "kitty",
            HostKind::Alacritty => "alacritty",
            HostKind::Conductor => "conductor",
            HostKind::Cursor => "cursor",
            HostKind::Vscode => "vscode",
            HostKind::Zed => "zed",
            HostKind::Windsurf => "windsurf",
            HostKind::Unknown => "unknown",
        }
    }
}

const MAX_WALK_DEPTH: usize = 12;

fn classify(process_name: &str) -> Option<HostKind> {
    let n = process_name.to_ascii_lowercase();
    if n.contains("ghostty") { return Some(HostKind::Ghostty); }
    if n.contains("iterm") { return Some(HostKind::Iterm2); }
    if n == "terminal" || n.contains("terminal.app") { return Some(HostKind::Terminal); }
    if n.contains("warp") { return Some(HostKind::Warp); }
    if n.contains("kitty") { return Some(HostKind::Kitty); }
    if n.contains("alacritty") { return Some(HostKind::Alacritty); }
    if n.contains("conductor") { return Some(HostKind::Conductor); }
    if n.contains("windsurf") { return Some(HostKind::Windsurf); }
    if n.contains("cursor") { return Some(HostKind::Cursor); }
    if n == "code" || n.contains("code - insiders") || n.contains("visual studio code") {
        return Some(HostKind::Vscode);
    }
    if n == "zed" || n.contains("zed-editor") { return Some(HostKind::Zed); }
    None
}

pub fn detect_host(sys: &System, start_pid: u32) -> HostKind {
    let mut cursor: Pid = Pid::from_u32(start_pid);
    for _ in 0..MAX_WALK_DEPTH {
        let Some(proc_) = sys.process(cursor) else { return HostKind::Unknown };
        if let Some(kind) = classify(proc_.name().to_string_lossy().as_ref()) {
            return kind;
        }
        match proc_.parent() {
            Some(parent) if parent.as_u32() != 0 && parent.as_u32() != cursor.as_u32() => {
                cursor = parent;
            }
            _ => return HostKind::Unknown,
        }
    }
    HostKind::Unknown
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn classify_known_names() {
        assert_eq!(classify("ghostty"), Some(HostKind::Ghostty));
        assert_eq!(classify("iTerm2"), Some(HostKind::Iterm2));
        assert_eq!(classify("Terminal"), Some(HostKind::Terminal));
        assert_eq!(classify("Warp"), Some(HostKind::Warp));
        assert_eq!(classify("kitty"), Some(HostKind::Kitty));
        assert_eq!(classify("Alacritty"), Some(HostKind::Alacritty));
        assert_eq!(classify("Conductor"), Some(HostKind::Conductor));
        assert_eq!(classify("Cursor"), Some(HostKind::Cursor));
        assert_eq!(classify("Code"), Some(HostKind::Vscode));
        assert_eq!(classify("zed"), Some(HostKind::Zed));
        assert_eq!(classify("Windsurf"), Some(HostKind::Windsurf));
    }

    #[test]
    fn classify_unknown() {
        assert_eq!(classify("bash"), None);
        assert_eq!(classify("claude"), None);
        assert_eq!(classify(""), None);
    }

    #[test]
    fn detect_host_returns_unknown_for_bogus_pid() {
        let sys = System::new();
        assert_eq!(detect_host(&sys, u32::MAX), HostKind::Unknown);
    }
}
