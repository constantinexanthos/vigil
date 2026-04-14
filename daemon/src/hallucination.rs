//! Phantom import detection.
//!
//! After FileCreate/FileModify events, parses modified files for import
//! statements and verifies they resolve to real modules on disk or in
//! package registries (node_modules, Cargo.toml deps, stdlib).

use chrono::{DateTime, Utc};
use regex::Regex;
use rusqlite::{params, Connection, Result};
use std::path::{Path, PathBuf};
use std::sync::LazyLock;

// ---------------------------------------------------------------------------
// Import parsing
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ParsedImport {
    pub line_number: usize,
    pub import_path: String,
}

/// JS/TS: `import ... from '...'` and `require('...')`
static RE_JS_IMPORT: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r#"(?:import\s+.*?\s+from\s+['"]([^'"]+)['"]|require\(\s*['"]([^'"]+)['"]\s*\))"#)
        .unwrap()
});

/// Python: `import foo.bar` and `from foo.bar import ...`
static RE_PY_IMPORT: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r#"(?:^from\s+([\w.]+)\s+import|^import\s+([\w.]+))"#).unwrap()
});

/// Rust: `use foo::bar` and `mod foo;`
static RE_RS_USE: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r#"(?:^use\s+([\w:]+)|^mod\s+(\w+)\s*;)"#).unwrap()
});

pub fn parse_imports(source: &str, ext: &str) -> Vec<ParsedImport> {
    let mut imports = Vec::new();

    match ext {
        "ts" | "tsx" | "js" | "jsx" | "mjs" | "cjs" => {
            for (line_num, line) in source.lines().enumerate() {
                let trimmed = line.trim();
                for cap in RE_JS_IMPORT.captures_iter(trimmed) {
                    let path = cap
                        .get(1)
                        .or_else(|| cap.get(2))
                        .map(|m| m.as_str().to_string());
                    if let Some(path) = path {
                        imports.push(ParsedImport {
                            line_number: line_num + 1,
                            import_path: path,
                        });
                    }
                }
            }
        }
        "py" => {
            for (line_num, line) in source.lines().enumerate() {
                let trimmed = line.trim();
                for cap in RE_PY_IMPORT.captures_iter(trimmed) {
                    let module = cap
                        .get(1)
                        .or_else(|| cap.get(2))
                        .map(|m| m.as_str().to_string());
                    if let Some(module) = module {
                        imports.push(ParsedImport {
                            line_number: line_num + 1,
                            import_path: module,
                        });
                    }
                }
            }
        }
        "rs" => {
            for (line_num, line) in source.lines().enumerate() {
                let trimmed = line.trim();
                for cap in RE_RS_USE.captures_iter(trimmed) {
                    let path = cap
                        .get(1)
                        .or_else(|| cap.get(2))
                        .map(|m| m.as_str().to_string());
                    if let Some(path) = path {
                        // Skip std/core/alloc — standard library.
                        if path.starts_with("std::")
                            || path.starts_with("core::")
                            || path.starts_with("alloc::")
                            || path == "std"
                            || path == "core"
                            || path == "alloc"
                        {
                            continue;
                        }
                        // Skip crate-internal refs.
                        if path.starts_with("crate::") || path.starts_with("super::") || path.starts_with("self::") {
                            continue;
                        }
                        imports.push(ParsedImport {
                            line_number: line_num + 1,
                            import_path: path,
                        });
                    }
                }
            }
        }
        _ => {}
    }

    imports
}

// ---------------------------------------------------------------------------
// Import resolution
// ---------------------------------------------------------------------------

/// Python standard library modules (common subset).
const PYTHON_STDLIB: &[&str] = &[
    "abc", "argparse", "ast", "asyncio", "base64", "bisect", "builtins",
    "calendar", "cmath", "codecs", "collections", "colorsys", "configparser",
    "contextlib", "copy", "csv", "ctypes", "dataclasses", "datetime",
    "decimal", "difflib", "email", "enum", "errno", "faulthandler",
    "fileinput", "fnmatch", "fractions", "functools", "gc", "getpass",
    "glob", "gzip", "hashlib", "heapq", "hmac", "html", "http",
    "importlib", "inspect", "io", "ipaddress", "itertools", "json",
    "keyword", "linecache", "locale", "logging", "lzma", "math",
    "mimetypes", "multiprocessing", "numbers", "operator", "os",
    "pathlib", "pickle", "platform", "pprint", "profile", "pstats",
    "queue", "random", "re", "readline", "reprlib", "secrets",
    "select", "shelve", "shlex", "shutil", "signal", "site", "socket",
    "sqlite3", "ssl", "stat", "statistics", "string", "struct",
    "subprocess", "sys", "sysconfig", "tempfile", "textwrap", "threading",
    "time", "timeit", "token", "tokenize", "tomllib", "traceback",
    "types", "typing", "unicodedata", "unittest", "urllib", "uuid",
    "venv", "warnings", "weakref", "webbrowser", "xml", "xmlrpc",
    "zipfile", "zipimport", "zlib",
];

/// Check if a JS/TS import resolves.
pub fn resolve_js_import(import_path: &str, file_dir: &Path) -> bool {
    // Bare specifiers (packages) — check node_modules.
    if !import_path.starts_with('.') && !import_path.starts_with('/') {
        let pkg_name = if import_path.starts_with('@') {
            // Scoped package: @scope/pkg
            import_path.splitn(3, '/').take(2).collect::<Vec<_>>().join("/")
        } else {
            import_path.split('/').next().unwrap_or(import_path).to_string()
        };
        // Walk up from file_dir looking for node_modules/<pkg>.
        let mut dir = Some(file_dir);
        while let Some(d) = dir {
            if d.join("node_modules").join(&pkg_name).exists() {
                return true;
            }
            dir = d.parent();
        }
        return false;
    }

    // Relative import — try various extensions.
    let resolved = file_dir.join(import_path);
    let extensions = ["", ".ts", ".tsx", ".js", ".jsx", ".json", ".mjs"];
    let index_files = ["index.ts", "index.tsx", "index.js", "index.jsx"];

    for ext in &extensions {
        let candidate = PathBuf::from(format!("{}{}", resolved.display(), ext));
        if candidate.is_file() {
            return true;
        }
    }

    // Try as a directory with index file.
    if resolved.is_dir() {
        for idx in &index_files {
            if resolved.join(idx).is_file() {
                return true;
            }
        }
    }

    false
}

/// Check if a Python import resolves.
pub fn resolve_py_import(import_path: &str, file_dir: &Path) -> bool {
    let top_module = import_path.split('.').next().unwrap_or(import_path);

    // Standard library.
    if PYTHON_STDLIB.contains(&top_module) {
        return true;
    }

    // Relative — check if it's a local file/package.
    let as_file = file_dir.join(format!("{top_module}.py"));
    let as_dir = file_dir.join(top_module);

    if as_file.is_file() {
        return true;
    }
    if as_dir.is_dir() && as_dir.join("__init__.py").is_file() {
        return true;
    }

    // Check site-packages by walking up for a venv.
    let mut dir = Some(file_dir);
    while let Some(d) = dir {
        let venv = d.join(".venv");
        if venv.is_dir() {
            if let Ok(entries) = std::fs::read_dir(venv.join("lib")) {
                for entry in entries.flatten() {
                    let sp = entry.path().join("site-packages").join(top_module);
                    if sp.exists() {
                        return true;
                    }
                    let sp_file = entry
                        .path()
                        .join("site-packages")
                        .join(format!("{top_module}.py"));
                    if sp_file.exists() {
                        return true;
                    }
                }
            }
        }
        dir = d.parent();
    }

    false
}

/// Check if a Rust import resolves (external crate in Cargo.toml).
pub fn resolve_rs_import(import_path: &str, file_dir: &Path) -> bool {
    let crate_name = import_path.split("::").next().unwrap_or(import_path);

    // Walk up to find Cargo.toml.
    let mut dir = Some(file_dir);
    while let Some(d) = dir {
        let cargo_toml = d.join("Cargo.toml");
        if cargo_toml.is_file() {
            if let Ok(content) = std::fs::read_to_string(&cargo_toml) {
                // Simple check: look for the crate name in [dependencies].
                // Handles both `crate_name = "..."` and `crate-name = "..."`.
                let normalized = crate_name.replace('-', "_");
                let alt = crate_name.replace('_', "-");
                if content.contains(&format!("{normalized} "))
                    || content.contains(&format!("{normalized} ="))
                    || content.contains(&format!("{alt} "))
                    || content.contains(&format!("{alt} ="))
                    || content.contains(&format!("\"{normalized}\""))
                    || content.contains(&format!("\"{alt}\""))
                {
                    return true;
                }
            }
            return false;
        }
        dir = d.parent();
    }

    false
}

/// Resolve an import based on file extension.
pub fn resolve_import(import_path: &str, file_path: &Path) -> bool {
    let ext = file_path
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("");
    let file_dir = file_path.parent().unwrap_or(Path::new("."));

    match ext {
        "ts" | "tsx" | "js" | "jsx" | "mjs" | "cjs" => {
            resolve_js_import(import_path, file_dir)
        }
        "py" => resolve_py_import(import_path, file_dir),
        "rs" => resolve_rs_import(import_path, file_dir),
        _ => true, // Unknown extensions — assume resolved.
    }
}

// ---------------------------------------------------------------------------
// Database
// ---------------------------------------------------------------------------

#[derive(Debug, Clone)]
pub struct Hallucination {
    pub id: Option<i64>,
    pub timestamp: DateTime<Utc>,
    pub file_path: String,
    pub line_number: usize,
    pub import_path: String,
    pub agent: String,
    pub session_id: Option<String>,
    pub resolved: bool,
}

pub fn init_hallucination_schema(conn: &Connection) -> Result<()> {
    conn.execute_batch(
        "
        CREATE TABLE IF NOT EXISTS hallucinations (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            timestamp   TEXT NOT NULL,
            file_path   TEXT NOT NULL,
            line_number INTEGER NOT NULL,
            import_path TEXT NOT NULL,
            agent       TEXT NOT NULL,
            session_id  TEXT,
            resolved    INTEGER DEFAULT 0
        );

        CREATE INDEX IF NOT EXISTS idx_hallucinations_agent ON hallucinations(agent);
        CREATE INDEX IF NOT EXISTS idx_hallucinations_file ON hallucinations(file_path);
        ",
    )?;
    Ok(())
}

pub fn insert_hallucination(conn: &Connection, h: &Hallucination) -> Result<i64> {
    conn.execute(
        "INSERT INTO hallucinations (timestamp, file_path, line_number, import_path, agent, session_id, resolved)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
        params![
            h.timestamp.to_rfc3339(),
            h.file_path,
            h.line_number as i64,
            h.import_path,
            h.agent,
            h.session_id,
            h.resolved as i32,
        ],
    )?;
    Ok(conn.last_insert_rowid())
}

pub fn query_hallucinations(
    conn: &Connection,
    agent: Option<&str>,
    since: Option<&DateTime<Utc>>,
) -> Result<Vec<Hallucination>> {
    let mut sql = String::from(
        "SELECT id, timestamp, file_path, line_number, import_path, agent, session_id, resolved
         FROM hallucinations WHERE resolved = 0",
    );
    let mut param_values: Vec<Box<dyn rusqlite::types::ToSql>> = Vec::new();

    if let Some(agent) = agent {
        sql.push_str(" AND agent = ?");
        param_values.push(Box::new(agent.to_string()));
    }
    if let Some(since) = since {
        sql.push_str(" AND timestamp >= ?");
        param_values.push(Box::new(since.to_rfc3339()));
    }

    sql.push_str(" ORDER BY timestamp DESC");

    let params_ref: Vec<&dyn rusqlite::types::ToSql> =
        param_values.iter().map(|p| p.as_ref()).collect();

    let mut stmt = conn.prepare(&sql)?;
    let rows = stmt.query_map(params_ref.as_slice(), |row| {
        let ts_str: String = row.get(1)?;
        Ok(Hallucination {
            id: Some(row.get(0)?),
            timestamp: chrono::DateTime::parse_from_rfc3339(&ts_str)
                .map(|dt| dt.with_timezone(&Utc))
                .unwrap_or_else(|_| Utc::now()),
            file_path: row.get(2)?,
            line_number: row.get::<_, i64>(3)? as usize,
            import_path: row.get(4)?,
            agent: row.get(5)?,
            session_id: row.get(6)?,
            resolved: row.get::<_, i32>(7)? != 0,
        })
    })?;

    rows.collect()
}

/// Count unresolved hallucinations for a specific agent (for trust scoring).
pub fn count_unresolved(conn: &Connection, agent: &str) -> Result<usize> {
    let count: i64 = conn.query_row(
        "SELECT COUNT(*) FROM hallucinations WHERE agent = ?1 AND resolved = 0",
        params![agent],
        |row| row.get(0),
    )?;
    Ok(count as usize)
}

// ---------------------------------------------------------------------------
// High-level: scan a file for phantom imports
// ---------------------------------------------------------------------------

/// Scan a file for phantom imports and record any hallucinations.
/// Returns the number of phantoms found.
pub fn scan_file(
    conn: &Connection,
    file_path: &Path,
    agent: &str,
    session_id: Option<&str>,
) -> Result<usize> {
    let ext = file_path
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("");

    // Only scan supported file types.
    if !matches!(ext, "ts" | "tsx" | "js" | "jsx" | "mjs" | "cjs" | "py" | "rs") {
        return Ok(0);
    }

    let source = match std::fs::read_to_string(file_path) {
        Ok(s) => s,
        Err(_) => return Ok(0),
    };

    let imports = parse_imports(&source, ext);
    let mut phantom_count = 0;

    for imp in &imports {
        if !resolve_import(&imp.import_path, file_path) {
            let h = Hallucination {
                id: None,
                timestamp: Utc::now(),
                file_path: file_path.to_string_lossy().to_string(),
                line_number: imp.line_number,
                import_path: imp.import_path.clone(),
                agent: agent.to_string(),
                session_id: session_id.map(|s| s.to_string()),
                resolved: false,
            };
            insert_hallucination(conn, &h)?;
            phantom_count += 1;
        }
    }

    Ok(phantom_count)
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;
    use rusqlite::Connection;
    use std::fs;
    use tempfile::TempDir;

    fn setup_db() -> Connection {
        let conn = Connection::open_in_memory().unwrap();
        init_hallucination_schema(&conn).unwrap();
        conn
    }

    // --- JS/TS parsing tests ---

    #[test]
    fn parse_js_es_import() {
        let source = r#"
import React from 'react';
import { useState } from "react";
import App from './App';
"#;
        let imports = parse_imports(source, "ts");
        assert_eq!(imports.len(), 3);
        assert_eq!(imports[0].import_path, "react");
        assert_eq!(imports[1].import_path, "react");
        assert_eq!(imports[2].import_path, "./App");
    }

    #[test]
    fn parse_js_require() {
        let source = r#"
const fs = require('fs');
const app = require('./app');
"#;
        let imports = parse_imports(source, "js");
        assert_eq!(imports.len(), 2);
        assert_eq!(imports[0].import_path, "fs");
        assert_eq!(imports[1].import_path, "./app");
    }

    #[test]
    fn parse_js_line_numbers() {
        let source = "// comment\nimport x from 'x';\n// gap\nconst y = require('y');\n";
        let imports = parse_imports(source, "tsx");
        assert_eq!(imports[0].line_number, 2);
        assert_eq!(imports[1].line_number, 4);
    }

    // --- Python parsing tests ---

    #[test]
    fn parse_python_imports() {
        let source = r#"
import os
import json
from pathlib import Path
from mypackage.utils import helper
"#;
        let imports = parse_imports(source, "py");
        assert_eq!(imports.len(), 4);
        assert_eq!(imports[0].import_path, "os");
        assert_eq!(imports[1].import_path, "json");
        assert_eq!(imports[2].import_path, "pathlib");
        assert_eq!(imports[3].import_path, "mypackage.utils");
    }

    // --- Rust parsing tests ---

    #[test]
    fn parse_rust_imports() {
        let source = r#"
use std::path::Path;
use chrono::Utc;
use crate::store::Store;
mod watcher;
"#;
        let imports = parse_imports(source, "rs");
        // std:: and crate:: should be skipped.
        assert_eq!(imports.len(), 2);
        assert_eq!(imports[0].import_path, "chrono::Utc");
        assert_eq!(imports[1].import_path, "watcher");
    }

    // --- Resolution tests ---

    #[test]
    fn resolve_js_relative_import() {
        let tmp = TempDir::new().unwrap();
        let dir = tmp.path();
        fs::write(dir.join("utils.ts"), "export const x = 1;").unwrap();

        assert!(resolve_js_import("./utils", dir));
        assert!(!resolve_js_import("./nonexistent", dir));
    }

    #[test]
    fn resolve_js_node_modules() {
        let tmp = TempDir::new().unwrap();
        let dir = tmp.path();
        fs::create_dir_all(dir.join("node_modules/react")).unwrap();
        fs::write(dir.join("node_modules/react/package.json"), "{}").unwrap();

        assert!(resolve_js_import("react", dir));
        assert!(!resolve_js_import("nonexistent-pkg", dir));
    }

    #[test]
    fn resolve_python_stdlib() {
        let tmp = TempDir::new().unwrap();
        let dir = tmp.path();
        assert!(resolve_py_import("os", dir));
        assert!(resolve_py_import("json", dir));
        assert!(resolve_py_import("pathlib", dir));
        assert!(!resolve_py_import("nonexistent_module", dir));
    }

    // --- DB tests ---

    #[test]
    fn insert_and_query_hallucinations() {
        let conn = setup_db();

        let h = Hallucination {
            id: None,
            timestamp: Utc::now(),
            file_path: "src/app.ts".to_string(),
            line_number: 5,
            import_path: "phantom-pkg".to_string(),
            agent: "claude-code".to_string(),
            session_id: Some("sess-1".to_string()),
            resolved: false,
        };
        let id = insert_hallucination(&conn, &h).unwrap();
        assert!(id > 0);

        let results = query_hallucinations(&conn, None, None).unwrap();
        assert_eq!(results.len(), 1);
        assert_eq!(results[0].import_path, "phantom-pkg");
        assert_eq!(results[0].agent, "claude-code");
    }

    #[test]
    fn count_unresolved_per_agent() {
        let conn = setup_db();

        for i in 0..3 {
            let h = Hallucination {
                id: None,
                timestamp: Utc::now(),
                file_path: format!("src/f{i}.ts"),
                line_number: 1,
                import_path: format!("phantom-{i}"),
                agent: "claude-code".to_string(),
                session_id: None,
                resolved: false,
            };
            insert_hallucination(&conn, &h).unwrap();
        }

        // Different agent.
        let h2 = Hallucination {
            id: None,
            timestamp: Utc::now(),
            file_path: "other.ts".to_string(),
            line_number: 1,
            import_path: "ghost".to_string(),
            agent: "cursor".to_string(),
            session_id: None,
            resolved: false,
        };
        insert_hallucination(&conn, &h2).unwrap();

        assert_eq!(count_unresolved(&conn, "claude-code").unwrap(), 3);
        assert_eq!(count_unresolved(&conn, "cursor").unwrap(), 1);
        assert_eq!(count_unresolved(&conn, "aider").unwrap(), 0);
    }

    #[test]
    fn scan_file_finds_phantoms() {
        let tmp = TempDir::new().unwrap();
        let dir = tmp.path();
        let conn = setup_db();

        let file = dir.join("app.ts");
        fs::write(
            &file,
            "import { foo } from './real';\nimport { bar } from 'nonexistent-pkg';\n",
        )
        .unwrap();
        // Create the real file.
        fs::write(dir.join("real.ts"), "export const foo = 1;").unwrap();

        let count = scan_file(&conn, &file, "claude-code", Some("s1")).unwrap();
        assert_eq!(count, 1);

        let hallucinations = query_hallucinations(&conn, None, None).unwrap();
        assert_eq!(hallucinations.len(), 1);
        assert_eq!(hallucinations[0].import_path, "nonexistent-pkg");
    }

    #[test]
    fn query_filters_by_agent() {
        let conn = setup_db();

        insert_hallucination(
            &conn,
            &Hallucination {
                id: None,
                timestamp: Utc::now(),
                file_path: "a.ts".into(),
                line_number: 1,
                import_path: "x".into(),
                agent: "claude-code".into(),
                session_id: None,
                resolved: false,
            },
        )
        .unwrap();
        insert_hallucination(
            &conn,
            &Hallucination {
                id: None,
                timestamp: Utc::now(),
                file_path: "b.ts".into(),
                line_number: 1,
                import_path: "y".into(),
                agent: "cursor".into(),
                session_id: None,
                resolved: false,
            },
        )
        .unwrap();

        let claude = query_hallucinations(&conn, Some("claude-code"), None).unwrap();
        assert_eq!(claude.len(), 1);
        assert_eq!(claude[0].agent, "claude-code");

        let all = query_hallucinations(&conn, None, None).unwrap();
        assert_eq!(all.len(), 2);
    }
}
