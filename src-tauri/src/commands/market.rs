//! Local plugin marketplaces: clone, parse, install to disk.
//!
//! Mirrors the official marketplace contract (docs: "Package your plugin"):
//! a marketplace root holds `.agents/plugins/marketplace.json` (legacy
//! `.claude-plugin/marketplace.json`) plus one `plugins/<name>/` dir per
//! plugin, each with a portable root `plugin.json` or a
//! `.codex-plugin/plugin.json` compatibility manifest.
//!
//! Sources accepted by `plugin_marketplace_add` (same shapes as
//! `codex plugin marketplace add`):
//! - `owner/repo` or `owner/repo@ref` (GitHub shorthand)
//! - `https://…git` / `git@…` URLs (optional `#ref` suffix)
//! - local marketplace root directory
//!
//! Installs are plain directory copies under `{data_dir}/plugins/`; the L0
//! engine binary is never touched. Engine linkage (plugin/install RPC) stays
//! on the existing `set_plugin_enabled` path.

use crate::state::AppState;
use base64::Engine as _;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::path::{Path, PathBuf};
use tauri::State;

// ─── stored records ─────────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
struct MarketplaceRecord {
    name: String,
    display_name: String,
    kind: String,
    source: String,
    git_ref: Option<String>,
    local_path: String,
    added_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct InstalledRecord {
    id: String,
    name: String,
    marketplace: String,
    version: String,
    path: String,
    enabled: bool,
    installed_at: String,
}

// ─── helpers ────────────────────────────────────────────────────────────────

fn now_stamp() -> String {
    chrono::Utc::now().format("%Y-%m-%dT%H:%M:%SZ").to_string()
}

fn plugins_root(state: &State<'_, AppState>) -> PathBuf {
    state.data_dir.join("plugins")
}

fn read_json<T: Default + for<'de> Deserialize<'de>>(path: &Path) -> T {
    std::fs::read_to_string(path)
        .ok()
        .and_then(|raw| serde_json::from_str(&raw).ok())
        .unwrap_or_default()
}

fn write_json<T: Serialize>(path: &Path, value: &T) -> Result<(), String> {
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    let tmp = path.with_extension("json.tmp");
    std::fs::write(
        &tmp,
        serde_json::to_vec_pretty(value).map_err(|e| e.to_string())?,
    )
    .map_err(|e| e.to_string())?;
    std::fs::rename(&tmp, path).map_err(|e| e.to_string())?;
    Ok(())
}

fn load_marketplaces(state: &State<'_, AppState>) -> Vec<MarketplaceRecord> {
    read_json(&plugins_root(state).join("marketplaces.json"))
}

fn save_marketplaces(state: &State<'_, AppState>, v: &[MarketplaceRecord]) -> Result<(), String> {
    write_json(&plugins_root(state).join("marketplaces.json"), v)
}

fn load_installed(state: &State<'_, AppState>) -> Vec<InstalledRecord> {
    read_json(&plugins_root(state).join("installed.json"))
}

fn save_installed(state: &State<'_, AppState>, v: &[InstalledRecord]) -> Result<(), String> {
    write_json(&plugins_root(state).join("installed.json"), v)
}

fn safe_name(raw: &str) -> String {
    raw.chars()
        .map(|c| {
            if c.is_ascii_alphanumeric() || c == '-' || c == '_' || c == '.' {
                c
            } else {
                '_'
            }
        })
        .collect()
}

fn text(v: &Value, keys: &[&str]) -> String {
    for k in keys {
        if let Some(s) = v.get(k).and_then(|x| x.as_str()) {
            if !s.trim().is_empty() {
                return s.trim().to_string();
            }
        }
    }
    String::new()
}

fn first_non_empty(a: String, b: String) -> String {
    if a.is_empty() {
        b
    } else {
        a
    }
}

/// Marketplace catalog file inside a marketplace root.
fn catalog_path(root: &Path) -> Option<PathBuf> {
    for rel in [
        ".agents/plugins/marketplace.json",
        ".claude-plugin/marketplace.json",
    ] {
        let p = root.join(rel);
        if p.is_file() {
            return Some(p);
        }
    }
    None
}

/// Read a plugin manifest: portable root `plugin.json` first, then the
/// `.codex-plugin/plugin.json` compatibility overlay.
fn read_manifest(dir: &Path) -> Option<Value> {
    for rel in ["plugin.json", ".codex-plugin/plugin.json"] {
        let p = dir.join(rel);
        if let Ok(raw) = std::fs::read_to_string(&p) {
            if let Ok(v) = serde_json::from_str::<Value>(&raw) {
                return Some(v);
            }
        }
    }
    None
}

/// OpenAI presentation block: `extensions.com.openai.interface`, falling back
/// to a flat `interface` on the compatibility manifest.
fn interface_of(manifest: &Value) -> Value {
    manifest
        .pointer("/extensions/com.openai/interface")
        .or_else(|| manifest.get("interface"))
        .cloned()
        .unwrap_or(Value::Null)
}

/// Small logos become data URLs so the webview needs no extra file access.
fn logo_data_url(plugin_dir: &Path, manifest: &Value) -> String {
    let rel = text(&interface_of(manifest), &["logo", "composerIcon"]);
    if rel.is_empty() {
        return String::new();
    }
    // Remote logos (marketplace-hosted http URLs) are passed through.
    if rel.starts_with("http://") || rel.starts_with("https://") {
        return rel;
    }
    let path = plugin_dir.join(
        rel.trim_start_matches("./")
            .replace('/', &std::path::MAIN_SEPARATOR.to_string()),
    );
    let Ok(meta) = std::fs::metadata(&path) else {
        return String::new();
    };
    if meta.len() > 512 * 1024 {
        return String::new();
    }
    let Ok(bytes) = std::fs::read(&path) else {
        return String::new();
    };
    let mime = match path
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("")
        .to_lowercase()
        .as_str()
    {
        "svg" => "image/svg+xml",
        "png" => "image/png",
        "jpg" | "jpeg" => "image/jpeg",
        "webp" => "image/webp",
        "gif" => "image/gif",
        _ => "application/octet-stream",
    };
    format!(
        "data:{mime};base64,{}",
        base64::Engine::encode(&base64::engine::general_purpose::STANDARD, bytes)
    )
}

#[derive(Debug, Clone, Serialize)]
struct SkillInfo {
    name: String,
    description: String,
}

/// `skills/<skill>/SKILL.md` frontmatter (`name:` / `description:` lines).
fn scan_skills(plugin_dir: &Path) -> Vec<SkillInfo> {
    let mut out = Vec::new();
    let Ok(entries) = std::fs::read_dir(plugin_dir.join("skills")) else {
        return out;
    };
    for entry in entries.flatten() {
        let md = entry.path().join("SKILL.md");
        if !md.is_file() {
            continue;
        }
        let Ok(raw) = std::fs::read_to_string(&md) else {
            continue;
        };
        let mut name = entry.file_name().to_string_lossy().to_string();
        let mut desc = String::new();
        let mut in_front = false;
        for line in raw.lines() {
            let t = line.trim();
            if t == "---" {
                if in_front {
                    break;
                }
                in_front = true;
                continue;
            }
            if !in_front {
                continue;
            }
            if let Some(v) = t.strip_prefix("name:") {
                name = v.trim().trim_matches('"').to_string();
            } else if let Some(v) = t.strip_prefix("description:") {
                desc = v.trim().trim_matches('"').to_string();
            }
        }
        out.push(SkillInfo {
            name,
            description: desc,
        });
    }
    out.sort_by(|a, b| a.name.cmp(&b.name));
    out
}

fn copy_dir(src: &Path, dst: &Path) -> Result<(), String> {
    std::fs::create_dir_all(dst).map_err(|e| e.to_string())?;
    for entry in std::fs::read_dir(src).map_err(|e| e.to_string())? {
        let entry = entry.map_err(|e| e.to_string())?;
        let name = entry.file_name();
        let name = name.to_string_lossy();
        if name == ".git" || name == "node_modules" {
            continue;
        }
        let from = entry.path();
        let to = dst.join(entry.file_name());
        let ft = entry.file_type().map_err(|e| e.to_string())?;
        if ft.is_dir() {
            copy_dir(&from, &to)?;
        } else if ft.is_file() {
            std::fs::copy(&from, &to).map_err(|e| e.to_string())?;
        }
    }
    Ok(())
}

fn remove_dir_all(path: &Path) {
    std::fs::remove_dir_all(path).ok();
}

// ─── source parsing ─────────────────────────────────────────────────────────

enum Source {
    Github {
        owner: String,
        repo: String,
        git_ref: Option<String>,
    },
    GitUrl {
        url: String,
        git_ref: Option<String>,
    },
    LocalDir {
        path: PathBuf,
    },
}

fn parse_source(input: &str) -> Result<Source, String> {
    let s = input.trim();
    if s.is_empty() {
        return Err("empty marketplace source".to_string());
    }
    // Optional trailing ref: `owner/repo@main`, `<url>#main`. SSH `git@…`
    // keeps its prefix; only the last @/# segment counts as a ref.
    let (base, git_ref) = match s.rsplit_once(['#', '@']) {
        Some((b, r))
            if !b.is_empty()
                && !r.is_empty()
                && !r.contains(['/', ':', ' '])
                && (b.contains("://") || b.starts_with("git@") || b.matches('/').count() == 1) =>
        {
            (b, Some(r.to_string()))
        }
        _ => (s, None),
    };
    // SSH keeps the full base (e.g. git@github.com:owner/repo.git).
    if base.starts_with("git@") {
        return Ok(Source::GitUrl {
            url: base.to_string(),
            git_ref,
        });
    }
    if base.starts_with("http://") || base.starts_with("https://") {
        let url = base.strip_suffix(".git").unwrap_or(base).to_string() + ".git";
        return Ok(Source::GitUrl { url, git_ref });
    }
    // GitHub shorthand `owner/repo` (a drive-letter path never matches: no
    // forward slash pair and it contains a colon).
    if !base.contains("://")
        && !base.contains(':')
        && base.matches('/').count() == 1
        && !base.contains(' ')
    {
        let mut it = base.splitn(2, '/');
        let owner = it.next().unwrap_or("").to_string();
        let repo = it.next().unwrap_or("").trim_end_matches(".git").to_string();
        if !owner.is_empty() && !repo.is_empty() {
            return Ok(Source::Github {
                owner,
                repo,
                git_ref,
            });
        }
    }
    let p = PathBuf::from(base);
    if p.is_dir() {
        return Ok(Source::LocalDir { path: p });
    }
    Err(format!("unrecognized marketplace source: {input}"))
}

async fn git_clone(url: &str, git_ref: Option<&str>, dir: &Path) -> Result<(), String> {
    if let Some(parent) = dir.parent() {
        std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    if dir.exists() {
        remove_dir_all(dir);
    }
    let mut cmd = tokio::process::Command::new("git");
    cmd.arg("clone").arg("--depth").arg("1");
    if let Some(r) = git_ref {
        cmd.arg("--branch").arg(r);
    }
    cmd.arg(url).arg(dir);
    let out = tokio::time::timeout(std::time::Duration::from_secs(180), cmd.output())
        .await
        .map_err(|_| "git clone timed out after 180s".to_string())?
        .map_err(|e| {
            if e.kind() == std::io::ErrorKind::NotFound {
                "git is not installed; install git to add remote marketplaces".to_string()
            } else {
                e.to_string()
            }
        })?;
    if !out.status.success() {
        return Err(format!(
            "git clone failed: {}",
            String::from_utf8_lossy(&out.stderr).trim()
        ));
    }
    Ok(())
}

// ─── commands ───────────────────────────────────────────────────────────────

#[tauri::command]
pub fn plugin_marketplaces(state: State<'_, AppState>) -> Result<Value, String> {
    let records = load_marketplaces(&state);
    let list: Vec<Value> = records
        .iter()
        .map(|r| {
            let count = catalog_path(Path::new(&r.local_path))
                .and_then(|p| std::fs::read_to_string(p).ok())
                .and_then(|raw| serde_json::from_str::<Value>(&raw).ok())
                .and_then(|v| v.get("plugins").and_then(|x| x.as_array()).map(|a| a.len()))
                .unwrap_or(0);
            json!({
                "name": r.name,
                "displayName": r.display_name,
                "kind": r.kind,
                "source": r.source,
                "ref": r.git_ref,
                "pluginCount": count,
            })
        })
        .collect();
    Ok(json!({ "marketplaces": list }))
}

#[tauri::command]
pub async fn plugin_marketplace_add(
    state: State<'_, AppState>,
    source: String,
) -> Result<Value, String> {
    let parsed = parse_source(&source)?;
    let root = plugins_root(&state);
    let (name, display_fallback, kind, canon_source, git_ref, local_path): (
        String,
        String,
        String,
        String,
        Option<String>,
        PathBuf,
    ) = match parsed {
        Source::Github {
            owner,
            repo,
            git_ref,
        } => {
            let dir = root
                .join("sources")
                .join(safe_name(&format!("{owner}_{repo}")));
            let url = format!("https://github.com/{owner}/{repo}.git");
            git_clone(&url, git_ref.as_deref(), &dir).await?;
            (
                format!("{owner}/{repo}"),
                repo.clone(),
                "git".to_string(),
                format!("{owner}/{repo}"),
                git_ref,
                dir,
            )
        }
        Source::GitUrl { url, git_ref } => {
            let stem = url
                .rsplit('/')
                .next()
                .unwrap_or("repo")
                .trim_end_matches(".git");
            let dir = root.join("sources").join(safe_name(stem));
            git_clone(&url, git_ref.as_deref(), &dir).await?;
            (
                safe_name(stem),
                stem.to_string(),
                "git".to_string(),
                url,
                git_ref,
                dir,
            )
        }
        Source::LocalDir { path } => {
            let canon = path.canonicalize().map_err(|e| e.to_string())?;
            let stem = canon
                .file_name()
                .map(|s| s.to_string_lossy().to_string())
                .unwrap_or_else(|| "local".to_string());
            (
                safe_name(&stem),
                stem.clone(),
                "local".to_string(),
                canon.to_string_lossy().to_string(),
                None,
                canon,
            )
        }
    };
    let catalog = catalog_path(&local_path)
        .ok_or_else(|| "no .agents/plugins/marketplace.json found in source".to_string())?;
    let raw = std::fs::read_to_string(&catalog).map_err(|e| e.to_string())?;
    let catalog_v: Value = serde_json::from_str(&raw).map_err(|e| e.to_string())?;
    let mname = catalog_v
        .get("name")
        .and_then(|v| v.as_str())
        .filter(|s| !s.trim().is_empty())
        .map(|s| safe_name(s))
        .unwrap_or_else(|| safe_name(&name));
    let display = catalog_v
        .pointer("/interface/displayName")
        .and_then(|v| v.as_str())
        .filter(|s| !s.trim().is_empty())
        .unwrap_or(&display_fallback)
        .to_string();
    let mut records = load_marketplaces(&state);
    records.retain(|r| r.name != mname);
    records.push(MarketplaceRecord {
        name: mname.clone(),
        display_name: display.clone(),
        kind,
        source: canon_source,
        git_ref,
        local_path: local_path.to_string_lossy().to_string(),
        added_at: now_stamp(),
    });
    save_marketplaces(&state, &records)?;
    let count = catalog_v
        .get("plugins")
        .and_then(|v| v.as_array())
        .map(|a| a.len())
        .unwrap_or(0);
    Ok(json!({
        "name": mname,
        "displayName": display,
        "pluginCount": count,
    }))
}

#[tauri::command]
pub fn plugin_marketplace_remove(state: State<'_, AppState>, name: String) -> Result<(), String> {
    let mut records = load_marketplaces(&state);
    if let Some(pos) = records.iter().position(|r| r.name == name) {
        let rec = records.remove(pos);
        save_marketplaces(&state, &records)?;
        if rec.kind == "git" {
            remove_dir_all(Path::new(&rec.local_path));
        }
        Ok(())
    } else {
        Err(format!("marketplace not found: {name}"))
    }
}

/// Resolve one catalog entry to a local plugin dir (local-path sources only).
fn resolve_entry(root: &Path, entry: &Value) -> Option<PathBuf> {
    let src = entry.get("source")?;
    let rel = if let Some(s) = src.as_str() {
        s.to_string()
    } else {
        match src.get("source").and_then(|v| v.as_str()) {
            Some("local") => src.get("path").and_then(|v| v.as_str())?.to_string(),
            _ => return None,
        }
    };
    let dir = root.join(rel.trim_start_matches("./"));
    let canon = dir.canonicalize().ok()?;
    let root_canon = root.canonicalize().ok()?;
    if !canon.starts_with(&root_canon) || !canon.is_dir() {
        return None;
    }
    Some(canon)
}

fn entry_json(
    marketplace: &str,
    entry: &Value,
    root: &Path,
    installed_ids: &[String],
    enabled_ids: &[String],
) -> Value {
    let name = text(entry, &["name"]);
    let category = text(entry, &["category"]);
    let (display, desc, version, logo, brand, skills, installable, reason) =
        match resolve_entry(root, entry).and_then(|d| read_manifest(&d).map(|m| (d, m))) {
            Some((dir, manifest)) => {
                let iface = interface_of(&manifest);
                (
                    first_non_empty(text(&iface, &["displayName"]), text(&manifest, &["name"])),
                    first_non_empty(
                        text(&iface, &["shortDescription", "longDescription"]),
                        text(&manifest, &["description"]),
                    ),
                    text(&manifest, &["version"]),
                    logo_data_url(&dir, &manifest),
                    text(&iface, &["brandColor"]),
                    scan_skills(&dir)
                        .into_iter()
                        .map(|s| json!({"name": s.name, "description": s.description}))
                        .collect::<Vec<_>>(),
                    true,
                    String::new(),
                )
            }
            None => (
                name.clone(),
                String::new(),
                String::new(),
                String::new(),
                String::new(),
                Vec::new(),
                false,
                "remote source (git-subdir/npm/url) is not supported yet".to_string(),
            ),
        };
    // Same id scheme as do_install (safe names), so the UI can match
    // directory entries against installed records.
    let id = format!("{}__{}", safe_name(marketplace), safe_name(&name));
    json!({
        "id": id,
        "name": if name.is_empty() { display.clone() } else { name },
        "displayName": if display.is_empty() { name } else { display },
        "description": desc,
        "version": version,
        "category": category,
        "logo": logo,
        "brandColor": brand,
        "skills": skills,
        "installable": installable,
        "reason": reason,
        "installed": installed_ids.iter().any(|x| x == &id),
        "enabled": enabled_ids.iter().any(|x| x == &id),
    })
}

#[tauri::command]
pub fn plugin_marketplace_plugins(
    state: State<'_, AppState>,
    marketplace: String,
) -> Result<Value, String> {
    let records = load_marketplaces(&state);
    let rec = records
        .iter()
        .find(|r| r.name == marketplace)
        .ok_or_else(|| format!("marketplace not found: {marketplace}"))?;
    let root = PathBuf::from(&rec.local_path);
    let catalog = catalog_path(&root)
        .ok_or_else(|| "marketplace catalog missing; remove and re-add".to_string())?;
    let raw = std::fs::read_to_string(&catalog).map_err(|e| e.to_string())?;
    let catalog_v: Value = serde_json::from_str(&raw).map_err(|e| e.to_string())?;
    let installed = load_installed(&state);
    let ids: Vec<String> = installed.iter().map(|r| r.id.clone()).collect();
    let on: Vec<String> = installed
        .iter()
        .filter(|r| r.enabled)
        .map(|r| r.id.clone())
        .collect();
    let entries = catalog_v
        .get("plugins")
        .and_then(|v| v.as_array())
        .cloned()
        .unwrap_or_default();
    let list: Vec<Value> = entries
        .iter()
        .map(|e| entry_json(&rec.name, e, &root, &ids, &on))
        .collect();
    Ok(json!({ "marketplace": rec.name, "plugins": list }))
}

fn do_install(
    state: &State<'_, AppState>,
    marketplace: &str,
    name: &str,
    src_dir: &Path,
    version: &str,
) -> Result<Value, String> {
    let id = format!("{}__{}", safe_name(marketplace), safe_name(name));
    let dst = plugins_root(state).join("installed").join(&id);
    if dst.exists() {
        remove_dir_all(&dst);
    }
    copy_dir(src_dir, &dst)?;
    let mut installed = load_installed(state);
    installed.retain(|r| r.id != id);
    installed.push(InstalledRecord {
        id: id.clone(),
        name: name.to_string(),
        marketplace: marketplace.to_string(),
        version: version.to_string(),
        path: dst.to_string_lossy().to_string(),
        enabled: true,
        installed_at: now_stamp(),
    });
    save_installed(state, &installed)?;
    // Keep a personal marketplace catalog in sync (official layout).
    sync_personal_catalog(state)?;
    Ok(json!({ "id": id, "name": name }))
}

/// Personal catalog mirroring the official `~/.agents/plugins/marketplace.json`
/// layout, rooted at our own data dir (never the official client's paths).
fn sync_personal_catalog(state: &State<'_, AppState>) -> Result<(), String> {
    let installed = load_installed(state);
    let entries: Vec<Value> = installed
        .iter()
        .map(|r| {
            json!({
                "name": r.name,
                "source": { "source": "local", "path": format!("./installed/{}", r.id) },
                "policy": { "installation": "AVAILABLE", "authentication": "ON_INSTALL" },
                "category": "Personal",
            })
        })
        .collect();
    let catalog = json!({ "name": "personal", "interface": { "displayName": "Personal" }, "plugins": entries });
    write_json(
        &plugins_root(state).join("marketplace-personal.json"),
        &catalog,
    )
}

#[tauri::command]
pub fn plugin_install(
    state: State<'_, AppState>,
    marketplace: String,
    plugin: String,
) -> Result<Value, String> {
    let records = load_marketplaces(&state);
    let rec = records
        .iter()
        .find(|r| r.name == marketplace)
        .ok_or_else(|| format!("marketplace not found: {marketplace}"))?;
    let root = PathBuf::from(&rec.local_path);
    let catalog = catalog_path(&root)
        .ok_or_else(|| "marketplace catalog missing; remove and re-add".to_string())?;
    let raw = std::fs::read_to_string(&catalog).map_err(|e| e.to_string())?;
    let catalog_v: Value = serde_json::from_str(&raw).map_err(|e| e.to_string())?;
    let entry = catalog_v
        .get("plugins")
        .and_then(|v| v.as_array())
        .and_then(|a| a.iter().find(|e| text(e, &["name"]) == plugin))
        .cloned()
        .ok_or_else(|| format!("plugin not found in marketplace: {plugin}"))?;
    let dir = resolve_entry(&root, &entry).ok_or_else(|| {
        "only local-path entries can be installed; remote sources are not supported yet".to_string()
    })?;
    let manifest = read_manifest(&dir).unwrap_or(Value::Null);
    let version = text(&manifest, &["version"]);
    do_install(&state, &rec.name, &plugin, &dir, &version)
}

#[tauri::command]
pub fn plugin_add_local(state: State<'_, AppState>, path: String) -> Result<Value, String> {
    let dir = PathBuf::from(&path);
    let canon = dir.canonicalize().map_err(|e| e.to_string())?;
    if !canon.is_dir() {
        return Err("not a directory".to_string());
    }
    let manifest = read_manifest(&canon).ok_or_else(|| {
        "no plugin.json or .codex-plugin/plugin.json found; not a plugin folder".to_string()
    })?;
    let name = text(&manifest, &["name"]);
    if name.is_empty() {
        return Err("plugin manifest has no name".to_string());
    }
    let version = text(&manifest, &["version"]);
    do_install(&state, "local", &name, &canon, &version)
}

fn installed_json(rec: &InstalledRecord) -> Value {
    let dir = PathBuf::from(&rec.path);
    let manifest = read_manifest(&dir).unwrap_or(Value::Null);
    let iface = interface_of(&manifest);
    let display = first_non_empty(text(&iface, &["displayName"]), rec.name.clone());
    let desc = first_non_empty(
        text(&iface, &["shortDescription", "longDescription"]),
        text(&manifest, &["description"]),
    );
    json!({
        "id": rec.id,
        "name": rec.name,
        "displayName": display,
        "description": desc,
        "version": rec.version,
        "marketplace": rec.marketplace,
        "enabled": rec.enabled,
        "logo": logo_data_url(&dir, &manifest),
        "brandColor": text(&iface, &["brandColor"]),
        "skills": scan_skills(&dir).into_iter().map(|s| json!({"name": s.name, "description": s.description})).collect::<Vec<_>>(),
    })
}

#[tauri::command]
pub fn plugin_installed(state: State<'_, AppState>) -> Result<Value, String> {
    let installed = load_installed(&state);
    // Drop records whose dirs vanished (user deleted by hand).
    let live: Vec<InstalledRecord> = installed
        .into_iter()
        .filter(|r| Path::new(&r.path).is_dir())
        .collect();
    let list: Vec<Value> = live.iter().map(installed_json).collect();
    Ok(json!({ "plugins": list }))
}

#[tauri::command]
pub fn plugin_uninstall(state: State<'_, AppState>, id: String) -> Result<(), String> {
    let mut installed = load_installed(&state);
    if let Some(pos) = installed.iter().position(|r| r.id == id) {
        let rec = installed.remove(pos);
        save_installed(&state, &installed)?;
        remove_dir_all(Path::new(&rec.path));
        sync_personal_catalog(&state)?;
        Ok(())
    } else {
        Err(format!("plugin not installed: {id}"))
    }
}

#[tauri::command]
pub fn plugin_set_enabled(
    state: State<'_, AppState>,
    id: String,
    enabled: bool,
) -> Result<(), String> {
    let mut installed = load_installed(&state);
    let rec = installed
        .iter_mut()
        .find(|r| r.id == id)
        .ok_or_else(|| format!("plugin not installed: {id}"))?;
    rec.enabled = enabled;
    save_installed(&state, &installed)
}

#[tauri::command]
pub fn plugin_skills(state: State<'_, AppState>) -> Result<Value, String> {
    let installed = load_installed(&state);
    let mut skills = Vec::new();
    for rec in installed.iter().filter(|r| r.enabled) {
        let dir = PathBuf::from(&rec.path);
        for s in scan_skills(&dir) {
            skills.push(json!({
                "plugin": rec.name,
                "pluginId": rec.id,
                "name": s.name,
                "description": s.description,
            }));
        }
    }
    Ok(json!({ "skills": skills }))
}
