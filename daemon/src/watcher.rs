use std::path::{Path, PathBuf};
use std::process::Command;

use chrono::{DateTime, Utc};
use notify::{Event, EventKind, RecommendedWatcher, RecursiveMode, Watcher};
use serde::{Deserialize, Serialize};
use tokio::sync::mpsc;

/// Directories and path fragments to ignore — build outputs, caches, dependencies.
const IGNORE_PATTERNS: &[&str] = &[
    "/target/",
    "/node_modules/",
    "/dist/",
    "/.next/",
    "/build/",
    "/__pycache__/",
    "/.venv/",
    "/venv/",
    "/.turbo/",
    "/.vercel/",
    "/.superpowers/",
    "/coverage/",
    "/.playwright-mcp/",
    ".tmp.",
    ".swp",
    "~",
];

/// A structured file-system event emitted by the watcher.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FsEvent {
    pub timestamp: DateTime<Utc>,
    pub path: PathBuf,
    pub kind: FsEventKind,
    /// Short unified-diff snippet (if available and the file is in a git repo).
    pub diff: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum FsEventKind {
    Create,
    Modify,
    Delete,
    Rename,
    Other,
}

impl From<&EventKind> for FsEventKind {
    fn from(kind: &EventKind) -> Self {
        match kind {
            EventKind::Create(_) => Self::Create,
            EventKind::Modify(_) => Self::Modify,
            EventKind::Remove(_) => Self::Delete,
            _ => Self::Other,
        }
    }
}

/// Try to produce a short `git diff` snippet for the given path.
/// Returns `None` if the file is not inside a git repo or diff is empty.
fn git_diff_snippet(path: &Path) -> Option<String> {
    let parent = path.parent()?;
    let output = Command::new("git")
        .args(["diff", "--no-color", "-U3", "--"])
        .arg(path)
        .current_dir(parent)
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

    // Cap at ~8 KB to capture more complete diffs.
    const MAX_DIFF_BYTES: usize = 8192;
    if trimmed.len() > MAX_DIFF_BYTES {
        Some(format!("{}…", &trimmed[..MAX_DIFF_BYTES]))
    } else {
        Some(trimmed.to_string())
    }
}

/// Classify a notify rename event — notify 8.x emits Modify(Name(..)) for renames.
fn classify_event(kind: &EventKind) -> FsEventKind {
    use notify::event::ModifyKind;
    if let EventKind::Modify(ModifyKind::Name(_)) = kind {
        return FsEventKind::Rename;
    }
    FsEventKind::from(kind)
}

/// Start watching the given directories and send [`FsEvent`]s through the returned channel.
///
/// The watcher runs until the returned [`RecommendedWatcher`] is dropped.
pub fn start(
    dirs: &[PathBuf],
) -> notify::Result<(RecommendedWatcher, mpsc::UnboundedReceiver<FsEvent>)> {
    let (tx, rx) = mpsc::unbounded_channel::<FsEvent>();

    let watched: Vec<PathBuf> = dirs.to_vec();
    let sender = tx.clone();
    let mut watcher = RecommendedWatcher::new(
        move |res: Result<Event, notify::Error>| {
            let Ok(event) = res else { return };

            let kind = classify_event(&event.kind);

            for path in &event.paths {
                // Skip hidden dirs/files (e.g. .git) and build/cache directories.
                let path_str = path.to_string_lossy();
                let ignored = IGNORE_PATTERNS.iter().any(|p| path_str.contains(p));
                if ignored {
                    continue;
                }

                let dominated = watched.iter().any(|root| {
                    path.strip_prefix(root).is_ok_and(|rel| {
                        rel.components()
                            .any(|c| c.as_os_str().to_string_lossy().starts_with('.'))
                    })
                });
                if dominated {
                    continue;
                }

                let diff = if matches!(kind, FsEventKind::Modify) {
                    git_diff_snippet(path)
                } else {
                    None
                };

                let fs_event = FsEvent {
                    timestamp: Utc::now(),
                    path: path.clone(),
                    kind: kind.clone(),
                    diff,
                };

                // Best-effort send — if the receiver is gone, stop emitting.
                let _ = sender.send(fs_event);
            }
        },
        notify::Config::default(),
    )?;

    for dir in dirs {
        watcher.watch(dir, RecursiveMode::Recursive)?;
    }

    Ok((watcher, rx))
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use tempfile::TempDir;
    use tokio::time::{timeout, Duration};

    #[tokio::test]
    async fn emits_create_and_modify_events() {
        let tmp = TempDir::new().unwrap();
        let dir = tmp.path().to_path_buf();

        let (_watcher, mut rx) = start(&[dir.clone()]).unwrap();

        // Give the watcher a moment to register.
        tokio::time::sleep(Duration::from_millis(100)).await;

        let file = dir.join("hello.txt");
        fs::write(&file, "hello").unwrap();

        // Drain events until we see one for our file (other temp noise may arrive first).
        let deadline = tokio::time::Instant::now() + Duration::from_secs(5);
        loop {
            let event = timeout(deadline.saturating_duration_since(tokio::time::Instant::now()), rx.recv())
                .await
                .expect("timed out waiting for hello.txt event")
                .expect("channel closed");

            if event.path.file_name().map(|f| f == "hello.txt").unwrap_or(false) {
                assert!(
                    matches!(event.kind, FsEventKind::Create | FsEventKind::Modify),
                    "expected Create or Modify, got {:?}",
                    event.kind
                );
                return;
            }
        }
    }
}
