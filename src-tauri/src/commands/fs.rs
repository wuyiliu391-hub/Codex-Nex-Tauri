//! Workspace file helpers for the side pane (replaces file_api.go).

use serde::Serialize;
use std::path::{Path, PathBuf};

const MAX_READ_BYTES: u64 = 1024 * 1024;

const IGNORED_DIRS: &[&str] = &[
    "node_modules",
    "dist",
    "build",
    "out",
    "target",
    ".git",
    ".idea",
    ".vscode",
    "vendor",
];

#[derive(Serialize)]
pub struct FileEntry {
    pub name: String,
    pub path: String,
    #[serde(rename = "absPath")]
    pub abs_path: String,
    #[serde(rename = "isDirectory")]
    pub is_directory: bool,
    pub ext: String,
}

fn sanitize_join(root: &Path, rel: &str) -> Result<PathBuf, String> {
    let rel = rel.replace('\\', "/");
    let rel = rel.trim_start_matches('/');
    if rel.split('/').any(|p| p == "..") {
        return Err("path traversal rejected".into());
    }
    let mut path = root.to_path_buf();
    for part in rel.split('/').filter(|p| !p.is_empty()) {
        path.push(part);
    }
    // Ensure still under root after canonicalization attempt.
    if let (Ok(canon_root), Ok(canon_path)) = (root.canonicalize(), path.canonicalize()) {
        if !canon_path.starts_with(&canon_root) {
            return Err("path escapes workspace".into());
        }
    }
    Ok(path)
}

#[tauri::command]
pub fn list_files(cwd: String, dir: String) -> Result<Vec<FileEntry>, String> {
    let root = PathBuf::from(&cwd);
    if !root.is_dir() {
        return Err("cwd is not a directory".into());
    }
    let base = if dir.is_empty() {
        root.clone()
    } else {
        sanitize_join(&root, &dir)?
    };
    let mut entries = Vec::new();
    let rd = std::fs::read_dir(&base).map_err(|e| e.to_string())?;
    for item in rd.flatten() {
        let name = item.file_name().to_string_lossy().to_string();
        if name.starts_with('.') {
            continue;
        }
        let is_dir = item.file_type().map(|t| t.is_dir()).unwrap_or(false);
        if is_dir && IGNORED_DIRS.contains(&name.as_str()) {
            continue;
        }
        let abs = item.path();
        let rel = abs
            .strip_prefix(&root)
            .unwrap_or(&abs)
            .to_string_lossy()
            .replace('\\', "/");
        let ext = if is_dir {
            String::new()
        } else {
            abs.extension()
                .map(|e| e.to_string_lossy().to_lowercase())
                .unwrap_or_default()
        };
        entries.push(FileEntry {
            name,
            path: rel,
            abs_path: abs.to_string_lossy().to_string(),
            is_directory: is_dir,
            ext,
        });
    }
    entries.sort_by(|a, b| match (a.is_directory, b.is_directory) {
        (true, false) => std::cmp::Ordering::Less,
        (false, true) => std::cmp::Ordering::Greater,
        _ => a.name.to_lowercase().cmp(&b.name.to_lowercase()),
    });
    Ok(entries)
}

#[tauri::command]
pub fn read_file(cwd: String, path: String, offset: Option<usize>, limit: Option<usize>) -> Result<String, String> {
    let root = PathBuf::from(&cwd);
    let abs = sanitize_join(&root, &path)?;
    let meta = std::fs::metadata(&abs).map_err(|e| e.to_string())?;
    if meta.len() > MAX_READ_BYTES {
        return Err("file exceeds 1MiB read cap".into());
    }
    let text = std::fs::read_to_string(&abs).map_err(|e| e.to_string())?;
    let lines: Vec<&str> = text.lines().collect();
    let start = offset.unwrap_or(0).min(lines.len());
    let end = limit
        .map(|l| start.saturating_add(l).min(lines.len()))
        .unwrap_or(lines.len());
    Ok(lines[start..end].join("\n"))
}

#[tauri::command]
pub fn write_file(cwd: String, path: String, content: String) -> Result<(), String> {
    let root = PathBuf::from(&cwd);
    let abs = sanitize_join(&root, &path)?;
    if let Some(parent) = abs.parent() {
        std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    std::fs::write(&abs, content).map_err(|e| e.to_string())
}
