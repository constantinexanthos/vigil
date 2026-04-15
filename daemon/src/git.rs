use std::collections::HashSet;
use std::path::{Path, PathBuf};
use std::process::Command;

use chrono::{DateTime, Utc};
use notify::{RecommendedWatcher, RecursiveMode, Watcher};
use serde::{Deserialize, Serialize};
use tokio::sync::mpsc;

/// A git-level event detected by watching .git directories.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GitEvent {
    pub timestamp: DateTime<Utc>,
    pub repo_path: PathBuf,
    pub kind: GitEventKind,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum GitEventKind {
    Commit {
        branch: String,
        hash: String,
        message: String,
        author: String,
    },
    BranchCreate {
        branch: String,
    },
    WorktreeCreate {
        worktree_path: PathBuf,
    },
}

/// Resolve the repo root from a `.git` directory path.
fn repo_root(git_dir: &Path) -> PathBuf {
    git_dir.parent().unwrap_or(git_dir).to_path_buf()
}

/// Read the current HEAD branch name (e.g. "main").
fn current_branch(repo: &Path) -> Option<String> {
    let output = Command::new("git")
        .args(["rev-parse", "--abbrev-ref", "HEAD"])
        .current_dir(repo)
        .output()
        .ok()?;
    if !output.status.success() {
        return None;
    }
    let branch = String::from_utf8_lossy(&output.stdout).trim().to_string();
    if branch.is_empty() || branch == "HEAD" {
        None
    } else {
        Some(branch)
    }
}

/// Get the latest commit info on the current branch.
fn latest_commit(repo: &Path) -> Option<(String, String, String)> {
    let output = Command::new("git")
        .args(["log", "-1", "--format=%H%n%s%n%an"])
        .current_dir(repo)
        .output()
        .ok()?;
    if !output.status.success() {
        return None;
    }
    let text = String::from_utf8_lossy(&output.stdout);
    let mut lines = text.lines();
    let hash = lines.next()?.to_string();
    let message = lines.next()?.to_string();
    let author = lines.next()?.to_string();
    Some((hash, message, author))
}

/// List all local branch names.
fn list_branches(repo: &Path) -> HashSet<String> {
    let output = Command::new("git")
        .args(["for-each-ref", "--format=%(refname:short)", "refs/heads/"])
        .current_dir(repo)
        .output();
    match output {
        Ok(o) if o.status.success() => String::from_utf8_lossy(&o.stdout)
            .lines()
            .map(|s| s.to_string())
            .collect(),
        _ => HashSet::new(),
    }
}

/// List all worktree paths.
fn list_worktrees(repo: &Path) -> HashSet<PathBuf> {
    let output = Command::new("git")
        .args(["worktree", "list", "--porcelain"])
        .current_dir(repo)
        .output();
    match output {
        Ok(o) if o.status.success() => String::from_utf8_lossy(&o.stdout)
            .lines()
            .filter_map(|line| line.strip_prefix("worktree "))
            .map(PathBuf::from)
            .collect(),
        _ => HashSet::new(),
    }
}

/// State tracker for a single git repository.
struct RepoState {
    repo_path: PathBuf,
    last_commit_hash: Option<String>,
    known_branches: HashSet<String>,
    known_worktrees: HashSet<PathBuf>,
}

impl RepoState {
    fn new(repo_path: PathBuf) -> Self {
        let last_commit_hash = latest_commit(&repo_path).map(|(h, _, _)| h);
        let known_branches = list_branches(&repo_path);
        let known_worktrees = list_worktrees(&repo_path);
        Self {
            repo_path,
            last_commit_hash,
            known_branches,
            known_worktrees,
        }
    }

    /// Check for new commits, branches, and worktrees. Returns any new events.
    fn poll(&mut self) -> Vec<GitEvent> {
        let mut events = Vec::new();
        let now = Utc::now();

        // Check for new commits.
        if let Some((hash, message, author)) = latest_commit(&self.repo_path) {
            if self.last_commit_hash.as_deref() != Some(&hash) {
                self.last_commit_hash = Some(hash.clone());
                let branch = current_branch(&self.repo_path).unwrap_or_else(|| "HEAD".into());
                events.push(GitEvent {
                    timestamp: now,
                    repo_path: self.repo_path.clone(),
                    kind: GitEventKind::Commit {
                        branch,
                        hash,
                        message,
                        author,
                    },
                });
            }
        }

        // Check for new branches.
        let current_branches = list_branches(&self.repo_path);
        for branch in current_branches.difference(&self.known_branches) {
            events.push(GitEvent {
                timestamp: now,
                repo_path: self.repo_path.clone(),
                kind: GitEventKind::BranchCreate {
                    branch: branch.clone(),
                },
            });
        }
        self.known_branches = current_branches;

        // Check for new worktrees.
        let current_worktrees = list_worktrees(&self.repo_path);
        for wt in current_worktrees.difference(&self.known_worktrees) {
            events.push(GitEvent {
                timestamp: now,
                repo_path: self.repo_path.clone(),
                kind: GitEventKind::WorktreeCreate {
                    worktree_path: wt.clone(),
                },
            });
        }
        self.known_worktrees = current_worktrees;

        events
    }
}

/// Start monitoring git activity for repos at the given directories.
///
/// Uses notify to watch `.git/` dirs for changes, then polls for new
/// commits/branches/worktrees when a change is detected. Also runs a
/// periodic poll as a fallback.
///
/// Returns new worktree paths via the second channel so the caller can
/// start watching them for file events too.
pub fn start(
    dirs: &[PathBuf],
) -> notify::Result<(
    RecommendedWatcher,
    mpsc::UnboundedReceiver<GitEvent>,
    mpsc::UnboundedReceiver<PathBuf>,
)> {
    let (event_tx, event_rx) = mpsc::unbounded_channel::<GitEvent>();
    let (worktree_tx, worktree_rx) = mpsc::unbounded_channel::<PathBuf>();

    // Find all .git dirs in the provided directories.
    let mut git_dirs: Vec<PathBuf> = Vec::new();
    for dir in dirs {
        let git_dir = dir.join(".git");
        if git_dir.is_dir() {
            git_dirs.push(git_dir);
        }
    }

    // Trigger channel — notify fires here, poll loop reads from it.
    let (trigger_tx, mut trigger_rx) = mpsc::unbounded_channel::<()>();

    let mut watcher = RecommendedWatcher::new(
        move |res: Result<notify::Event, notify::Error>| {
            if res.is_ok() {
                let _ = trigger_tx.send(());
            }
        },
        notify::Config::default(),
    )?;

    for git_dir in &git_dirs {
        watcher.watch(git_dir, RecursiveMode::Recursive)?;
    }

    // Build initial repo states.
    let repo_paths: Vec<PathBuf> = git_dirs.iter().map(|g| repo_root(g)).collect();

    // Spawn the poll loop.
    tokio::spawn(async move {
        let mut states: Vec<RepoState> = repo_paths
            .iter()
            .map(|p| RepoState::new(p.clone()))
            .collect();

        let mut interval = tokio::time::interval(std::time::Duration::from_secs(5));

        loop {
            tokio::select! {
                _ = trigger_rx.recv() => {
                    // Debounce — drain any queued triggers.
                    while trigger_rx.try_recv().is_ok() {}
                }
                _ = interval.tick() => {}
            }

            for state in &mut states {
                let events = state.poll();
                for event in events {
                    // If a new worktree was created, notify the caller.
                    if let GitEventKind::WorktreeCreate { ref worktree_path } = event.kind {
                        let _ = worktree_tx.send(worktree_path.clone());
                    }
                    let _ = event_tx.send(event);
                }
            }
        }
    });

    Ok((watcher, event_rx, worktree_rx))
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::TempDir;

    fn init_git_repo(dir: &Path) {
        Command::new("git")
            .args(["init"])
            .current_dir(dir)
            .output()
            .expect("git init failed");
        Command::new("git")
            .args(["config", "user.email", "test@test.com"])
            .current_dir(dir)
            .output()
            .unwrap();
        Command::new("git")
            .args(["config", "user.name", "Test"])
            .current_dir(dir)
            .output()
            .unwrap();
        // Initial commit so HEAD exists.
        std::fs::write(dir.join("README.md"), "# test").unwrap();
        Command::new("git")
            .args(["add", "."])
            .current_dir(dir)
            .output()
            .unwrap();
        Command::new("git")
            .args(["commit", "-m", "init"])
            .current_dir(dir)
            .output()
            .unwrap();
    }

    #[test]
    fn repo_state_detects_new_commit() {
        let tmp = TempDir::new().unwrap();
        let dir = tmp.path().to_path_buf();
        init_git_repo(&dir);

        let mut state = RepoState::new(dir.clone());
        assert!(state.poll().is_empty(), "no changes yet");

        // Make a new commit.
        std::fs::write(dir.join("new.txt"), "hello").unwrap();
        Command::new("git")
            .args(["add", "new.txt"])
            .current_dir(&dir)
            .output()
            .unwrap();
        Command::new("git")
            .args(["commit", "-m", "add new file"])
            .current_dir(&dir)
            .output()
            .unwrap();

        let events = state.poll();
        assert_eq!(events.len(), 1);
        match &events[0].kind {
            GitEventKind::Commit { message, .. } => {
                assert_eq!(message, "add new file");
            }
            other => panic!("expected Commit, got {:?}", other),
        }
    }

    #[test]
    fn repo_state_detects_new_branch() {
        let tmp = TempDir::new().unwrap();
        let dir = tmp.path().to_path_buf();
        init_git_repo(&dir);

        let mut state = RepoState::new(dir.clone());
        assert!(state.poll().is_empty());

        Command::new("git")
            .args(["branch", "feature-xyz"])
            .current_dir(&dir)
            .output()
            .unwrap();

        let events = state.poll();
        assert!(events.iter().any(|e| matches!(
            &e.kind,
            GitEventKind::BranchCreate { branch } if branch == "feature-xyz"
        )));
    }

    #[test]
    fn list_branches_works() {
        let tmp = TempDir::new().unwrap();
        let dir = tmp.path().to_path_buf();
        init_git_repo(&dir);

        let branches = list_branches(&dir);
        assert!(!branches.is_empty());
    }
}
