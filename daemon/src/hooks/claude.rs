//! Claude Code hooks integration.
//!
//! Claude Code exposes a hooks system in ~/.claude/settings.json where you can
//! register scripts to run on PreToolUse, PostToolUse, Notification, and Stop
//! events. Each hook receives structured JSON on stdin.
//!
//! This module:
//! 1. Registers vigil as a hook consumer in Claude Code's settings.
//! 2. Parses incoming hook events.
//! 3. Converts them to AgentEvents for the store.

use std::io::Read;
use std::path::{Path, PathBuf};

use chrono::Utc;
use serde::{Deserialize, Serialize};

use crate::store::{AgentEvent, EventKind};

/// The hook event received from Claude Code on stdin.
#[derive(Debug, Clone, Deserialize)]
pub struct ClaudeHookEvent {
    /// The hook type: PreToolUse, PostToolUse, Notification, Stop
    pub hook_type: Option<String>,
    /// Session identifier
    pub session_id: Option<String>,
    /// The tool being used (e.g. "Write", "Edit", "Bash")
    pub tool_name: Option<String>,
    /// Tool input parameters
    pub tool_input: Option<serde_json::Value>,
    /// Tool output/result (PostToolUse only)
    pub tool_output: Option<serde_json::Value>,
    /// Working directory
    pub cwd: Option<String>,
    /// Token usage stats
    pub token_usage: Option<TokenUsage>,
    /// Model identifier
    pub model: Option<String>,
    /// Cost in USD
    pub cost_usd: Option<f64>,
    /// Notification message (Notification events)
    pub message: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TokenUsage {
    pub input_tokens: Option<u64>,
    pub output_tokens: Option<u64>,
    pub cache_read_tokens: Option<u64>,
    pub cache_write_tokens: Option<u64>,
}

/// Metadata we attach to the AgentEvent for Claude Code hook events.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ClaudeMetadata {
    pub hook_type: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tool_name: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub model: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub cost_usd: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub token_usage: Option<TokenUsage>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub message: Option<String>,
}

/// Read a hook event from stdin (called by the vigil-hook script).
pub fn read_hook_event_from_stdin() -> Option<ClaudeHookEvent> {
    let mut input = String::new();
    std::io::stdin().read_to_string(&mut input).ok()?;
    if input.trim().is_empty() {
        return None;
    }
    serde_json::from_str(&input).ok()
}

/// Convert a Claude hook event into an AgentEvent for the store.
pub fn hook_event_to_agent_event(event: &ClaudeHookEvent) -> AgentEvent {
    let hook_type = event.hook_type.as_deref().unwrap_or("unknown");

    // Extract file path from tool input if it's a file operation.
    let file_path = event
        .tool_input
        .as_ref()
        .and_then(|v| {
            v.get("file_path")
                .or_else(|| v.get("path"))
                .or_else(|| v.get("command")) // Bash commands
                .and_then(|p| p.as_str())
                .map(|s| s.to_string())
        });

    // Map tool operations to event kinds.
    let kind = match event.tool_name.as_deref() {
        Some("Write") => EventKind::FileCreate,
        Some("Edit") => EventKind::FileModify,
        Some("Read" | "Glob" | "Grep" | "Bash") => EventKind::FileModify,
        _ => EventKind::FileModify,
    };

    let metadata = ClaudeMetadata {
        hook_type: hook_type.to_string(),
        tool_name: event.tool_name.clone(),
        model: event.model.clone(),
        cost_usd: event.cost_usd,
        token_usage: event.token_usage.clone(),
        message: event.message.clone(),
    };

    AgentEvent {
        id: None,
        timestamp: Utc::now(),
        kind,
        file_path,
        agent: "claude-code".to_string(),
        session_id: event.session_id.clone(),
        repo_path: event.cwd.clone(),
        branch: None,
        diff: None,
        metadata: serde_json::to_string(&metadata).ok(),
    }
}

/// The hook command that Claude Code will execute.
/// This is the path to the vigil binary with the `hook` subcommand.
fn hook_command(vigil_bin: &Path) -> String {
    format!("{} hook claude", vigil_bin.display())
}

/// Claude Code settings file path.
fn claude_settings_path() -> PathBuf {
    home::home_dir()
        .expect("cannot determine home directory")
        .join(".claude")
        .join("settings.json")
}

/// Register vigil as a hook consumer in Claude Code's settings.json.
///
/// Adds hooks for PostToolUse and Notification events.
pub fn register_hooks(vigil_bin: &Path) -> Result<(), String> {
    let settings_path = claude_settings_path();
    let command = hook_command(vigil_bin);

    // Read existing settings or start fresh.
    let mut settings: serde_json::Value = if settings_path.exists() {
        let content = std::fs::read_to_string(&settings_path)
            .map_err(|e| format!("Failed to read {}: {e}", settings_path.display()))?;
        serde_json::from_str(&content)
            .map_err(|e| format!("Failed to parse {}: {e}", settings_path.display()))?
    } else {
        serde_json::json!({})
    };

    let hooks = settings
        .as_object_mut()
        .ok_or("settings.json is not an object")?
        .entry("hooks")
        .or_insert_with(|| serde_json::json!({}));

    let hooks_obj = hooks
        .as_object_mut()
        .ok_or("hooks is not an object")?;

    // Add PostToolUse hook.
    let post_tool_hooks = hooks_obj
        .entry("PostToolUse")
        .or_insert_with(|| serde_json::json!([]));
    add_hook_entry(post_tool_hooks, &command)?;

    // Add Notification hook.
    let notification_hooks = hooks_obj
        .entry("Notification")
        .or_insert_with(|| serde_json::json!([]));
    add_hook_entry(notification_hooks, &command)?;

    // Ensure the directory exists.
    if let Some(parent) = settings_path.parent() {
        std::fs::create_dir_all(parent)
            .map_err(|e| format!("Failed to create {}: {e}", parent.display()))?;
    }

    let output = serde_json::to_string_pretty(&settings)
        .map_err(|e| format!("Failed to serialize settings: {e}"))?;
    std::fs::write(&settings_path, output)
        .map_err(|e| format!("Failed to write {}: {e}", settings_path.display()))?;

    Ok(())
}

/// Remove vigil hooks from Claude Code's settings.json.
pub fn unregister_hooks(vigil_bin: &Path) -> Result<(), String> {
    let settings_path = claude_settings_path();
    if !settings_path.exists() {
        return Ok(());
    }

    let content = std::fs::read_to_string(&settings_path)
        .map_err(|e| format!("Failed to read {}: {e}", settings_path.display()))?;
    let mut settings: serde_json::Value = serde_json::from_str(&content)
        .map_err(|e| format!("Failed to parse {}: {e}", settings_path.display()))?;

    let command = hook_command(vigil_bin);

    if let Some(hooks) = settings.get_mut("hooks").and_then(|h| h.as_object_mut()) {
        for (_key, entries) in hooks.iter_mut() {
            remove_hook_entry(entries, &command);
        }
    }

    let output = serde_json::to_string_pretty(&settings)
        .map_err(|e| format!("Failed to serialize settings: {e}"))?;
    std::fs::write(&settings_path, output)
        .map_err(|e| format!("Failed to write {}: {e}", settings_path.display()))?;

    Ok(())
}

/// Add a hook entry to an array if it doesn't already exist.
fn add_hook_entry(entries: &mut serde_json::Value, command: &str) -> Result<(), String> {
    let arr = entries
        .as_array_mut()
        .ok_or("hook entries is not an array")?;

    // Check if we already have this command registered.
    let already_registered = arr.iter().any(|entry| {
        entry
            .get("command")
            .and_then(|c| c.as_str())
            .is_some_and(|c| c == command)
    });

    if !already_registered {
        arr.push(serde_json::json!({
            "command": command
        }));
    }

    Ok(())
}

/// Remove hook entries matching our command.
fn remove_hook_entry(entries: &mut serde_json::Value, command: &str) {
    if let Some(arr) = entries.as_array_mut() {
        arr.retain(|entry| {
            entry
                .get("command")
                .and_then(|c| c.as_str())
                .map(|c| c != command)
                .unwrap_or(true)
        });
    }
}

/// Process a hook event from stdin and write it to the store.
/// Called when `vigil hook claude` is invoked by Claude Code.
pub fn process_hook_stdin(store_path: &Path) -> Result<(), String> {
    let event = read_hook_event_from_stdin()
        .ok_or("No valid hook event on stdin")?;

    let agent_event = hook_event_to_agent_event(&event);

    let store = crate::store::Store::open(store_path)
        .map_err(|e| format!("Failed to open store: {e}"))?;

    store
        .insert(&agent_event)
        .map_err(|e| format!("Failed to insert event: {e}"))?;

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parse_post_tool_use_event() {
        let json = r#"{
            "hook_type": "PostToolUse",
            "session_id": "abc-123",
            "tool_name": "Edit",
            "tool_input": {"file_path": "/tmp/foo.rs", "old_string": "a", "new_string": "b"},
            "cwd": "/tmp/project",
            "model": "claude-sonnet-4-20250514",
            "cost_usd": 0.003,
            "token_usage": {
                "input_tokens": 1500,
                "output_tokens": 200,
                "cache_read_tokens": 500,
                "cache_write_tokens": null
            }
        }"#;

        let event: ClaudeHookEvent = serde_json::from_str(json).unwrap();
        assert_eq!(event.hook_type.as_deref(), Some("PostToolUse"));
        assert_eq!(event.tool_name.as_deref(), Some("Edit"));
        assert_eq!(event.session_id.as_deref(), Some("abc-123"));
        assert!(event.cost_usd.unwrap() > 0.0);

        let agent_event = hook_event_to_agent_event(&event);
        assert_eq!(agent_event.agent, "claude-code");
        assert_eq!(agent_event.kind, EventKind::FileModify);
        assert_eq!(agent_event.file_path.as_deref(), Some("/tmp/foo.rs"));
        assert_eq!(agent_event.session_id.as_deref(), Some("abc-123"));
        assert!(agent_event.metadata.is_some());

        let meta: ClaudeMetadata =
            serde_json::from_str(agent_event.metadata.as_ref().unwrap()).unwrap();
        assert_eq!(meta.hook_type, "PostToolUse");
        assert_eq!(meta.tool_name.as_deref(), Some("Edit"));
        assert_eq!(meta.model.as_deref(), Some("claude-sonnet-4-20250514"));
    }

    #[test]
    fn parse_notification_event() {
        let json = r#"{
            "hook_type": "Notification",
            "session_id": "abc-123",
            "message": "Task completed successfully"
        }"#;

        let event: ClaudeHookEvent = serde_json::from_str(json).unwrap();
        let agent_event = hook_event_to_agent_event(&event);
        assert_eq!(agent_event.agent, "claude-code");

        let meta: ClaudeMetadata =
            serde_json::from_str(agent_event.metadata.as_ref().unwrap()).unwrap();
        assert_eq!(meta.message.as_deref(), Some("Task completed successfully"));
    }

    #[test]
    fn hook_command_format() {
        let bin = PathBuf::from("/usr/local/bin/vigil");
        assert_eq!(hook_command(&bin), "/usr/local/bin/vigil hook claude");
    }
}
