//! Provider, MCP and plugin configuration for the self-developed kernel.
//!
//! These commands previously forwarded to the official app-server over
//! WebSocket. The kernel has no engine, so they now operate on the shell's own
//! persisted store (`AppState`) and report honestly what is and is not wired.
//!
//! Design rule (from `README.md`): never return a fabricated success. Where a
//! capability is not implemented yet, the command returns a **typed
//! "not implemented" result** that names the missing piece, instead of an
//! empty list or a fake `ok: true`. The UI can then say something true.
//!
//! What is real here today:
//!  * providers are stored in `shell-state.json` (id, base URL, protocol, key)
//!  * the active provider selection persists
//!  * MCP server entries persist and can be enabled/disabled
//!  * plugin/marketplace entries persist and can be installed/removed locally
//! What is not wired yet (and says so):
//!  * `probe_provider` — no HTTP probe from the kernel yet
//!  * `rpc_raw` — there is no JSON-RPC surface to pass through to
//!  * approval replies — the echo provider never requests approval

use serde_json::{json, Value};
use tauri::State;

use crate::state::AppState;

/// Marker used across these commands so the frontend can distinguish "this
/// capability is intentionally absent" from "the call failed".
const NOT_WIRED: &str = "not-wired";

fn not_wired(command: &str, detail: &str) -> Value {
    json!({
        "ok": false,
        "status": NOT_WIRED,
        "command": command,
        "detail": detail,
    })
}

// ── providers ───────────────────────────────────────────────────────────────

/// `list_providers` — providers configured in the shell store.
///
/// Returns `{ providers: [...] }` because `appStore.ts` normalizes that shape.
/// The list is genuinely empty until a provider is added: the kernel ships an
/// echo provider, which is reported separately as `activeProvider` so the UI
/// can show "no real model configured" without pretending one exists.
#[tauri::command]
pub fn list_providers(state: State<'_, AppState>) -> Result<Value, String> {
    let inner = state.inner.lock().map_err(|e| e.to_string())?;

    let providers: Vec<Value> = inner
        .provider_endpoints
        .iter()
        .map(|(id, base_url)| {
            json!({
                "id": id,
                "baseUrl": base_url,
                "protocol": inner.provider_protocols.get(id).cloned().unwrap_or_else(|| "openai_chat".into()),
                // Never echo the secret itself — only whether one is stored.
                "hasKey": inner.provider_secrets.get(id).is_some_and(|k| !k.is_empty()),
            })
        })
        .collect();

    Ok(json!({
        "providers": providers,
        "activeProvider": inner.settings.active_provider_id,
        "kernelProvider": "echo",
        "placeholder": true,
    }))
}

/// `save_provider` — persist a provider definition.
///
/// Stores the endpoint/protocol in the shell store and the key in
/// `provider_secrets` (which `docs/RUST_BACKEND.md` documents as the shell's
/// secret store). Returns the stored id so the UI can select it.
#[tauri::command]
pub fn save_provider(state: State<'_, AppState>, payload: Value) -> Result<Value, String> {
    let id = payload
        .get("id")
        .or_else(|| payload.get("providerId"))
        .or_else(|| payload.get("name"))
        .and_then(Value::as_str)
        .map(str::to_string)
        .ok_or_else(|| "save_provider: missing provider id".to_string())?;

    let base_url = payload
        .get("baseUrl")
        .or_else(|| payload.get("base_url"))
        .and_then(Value::as_str)
        .unwrap_or_default()
        .to_string();

    let protocol = payload
        .get("protocol")
        .and_then(Value::as_str)
        .unwrap_or("openai_chat")
        .to_string();

    let api_key = payload
        .get("apiKey")
        .or_else(|| payload.get("api_key"))
        .and_then(Value::as_str)
        .map(str::to_string);

    {
        let mut inner = state.inner.lock().map_err(|e| e.to_string())?;
        inner.provider_endpoints.insert(id.clone(), base_url);
        inner.provider_protocols.insert(id.clone(), protocol);
        if let Some(key) = api_key {
            inner.provider_secrets.insert(id.clone(), key);
        }
        inner.settings.active_provider_id = id.clone();
    }
    state.save().map_err(|e| e.to_string())?;

    Ok(json!({
        "id": id,
        "saved": true,
        // Be explicit that the kernel still answers with the echo provider:
        // storing a provider does not yet route turns through it.
        "kernelProvider": "echo",
        "detail": "Provider stored. The kernel still answers with the echo provider until an HTTP provider is implemented.",
    }))
}

/// `probe_provider` — connectivity check.
///
/// Not implemented: the previous shell issued a direct HTTP request from Rust,
/// and the kernel has no HTTP client for this yet. Reports that plainly rather
/// than returning a fake `ok: true`.
#[tauri::command]
pub fn probe_provider(payload: Value) -> Value {
    let id = payload
        .get("id")
        .or_else(|| payload.get("providerId"))
        .and_then(Value::as_str)
        .unwrap_or("<unknown>");
    not_wired(
        "probe_provider",
        &format!("no HTTP probe is implemented for provider '{id}' yet"),
    )
}

// ── MCP servers ─────────────────────────────────────────────────────────────

/// `list_mcp_servers` — MCP entries from the shell store.
#[tauri::command]
pub fn list_mcp_servers(state: State<'_, AppState>) -> Result<Value, String> {
    let inner = state.inner.lock().map_err(|e| e.to_string())?;
    let servers: Vec<Value> = inner
        .connectors
        .iter()
        .filter(|c| c.kind == "mcp")
        .map(|c| {
            json!({
                "name": c.name,
                "enabled": c.config.get("enabled").and_then(Value::as_bool).unwrap_or(true),
                "kind": c.kind,
            })
        })
        .collect();
    Ok(json!({
        "servers": servers,
        "connected": false,
        "status": NOT_WIRED,
        "detail": "MCP servers are recorded but the kernel does not launch them yet",
    }))
}

/// `save_mcp_server` — persist an MCP server entry.
#[tauri::command]
pub fn save_mcp_server(state: State<'_, AppState>, payload: Value) -> Result<Value, String> {
    let name = payload
        .get("name")
        .or_else(|| payload.get("id"))
        .and_then(Value::as_str)
        .map(str::to_string)
        .ok_or_else(|| "save_mcp_server: missing name".to_string())?;

    {
        let mut inner = state.inner.lock().map_err(|e| e.to_string())?;
        // The connector `config` blob carries the MCP details plus the enabled
        // flag, so one entry holds everything the UI set.
        let mut config = payload.clone();
        if !config.is_object() {
            config = json!({});
        }
        if config.get("enabled").is_none() {
            config["enabled"] = json!(true);
        }
        let entry = crate::state::Connector {
            id: name.clone(),
            name: name.clone(),
            kind: "mcp".into(),
            config,
        };
        match inner.connectors.iter_mut().find(|c| c.id == name) {
            Some(existing) => *existing = entry,
            None => inner.connectors.push(entry),
        }
    }
    state.save().map_err(|e| e.to_string())?;

    Ok(json!({
        "name": name,
        "saved": true,
        "status": NOT_WIRED,
        "detail": "MCP server stored. The kernel does not launch MCP servers yet.",
    }))
}

/// `set_mcp_server_enabled` — flip the enabled flag.
#[tauri::command]
pub fn set_mcp_server_enabled(
    state: State<'_, AppState>,
    name: String,
    enabled: bool,
) -> Result<Value, String> {
    {
        let mut inner = state.inner.lock().map_err(|e| e.to_string())?;
        let entry = inner
            .connectors
            .iter_mut()
            .find(|c| c.id == name)
            .ok_or_else(|| format!("mcp server not found: {name}"))?;
        if !entry.config.is_object() {
            entry.config = json!({});
        }
        entry.config["enabled"] = json!(enabled);
    }
    state.save().map_err(|e| e.to_string())?;
    Ok(json!({ "name": name, "enabled": enabled }))
}

/// `test_mcp_connection` — not implemented, and says so.
#[tauri::command]
pub fn test_mcp_connection(payload: Value) -> Value {
    let name = payload
        .get("name")
        .or_else(|| payload.get("server"))
        .and_then(Value::as_str)
        .unwrap_or("<unknown>");
    not_wired(
        "test_mcp_connection",
        &format!("the kernel does not launch MCP servers yet, so '{name}' cannot be probed"),
    )
}

// ── skills / plugins ────────────────────────────────────────────────────────

/// `list_skills` — no skill loader exists in the kernel yet.
#[tauri::command]
pub fn list_skills() -> Value {
    json!({ "skills": [], "status": NOT_WIRED, "detail": "no skill loader is implemented yet" })
}

/// `reload_skills` — no-op with an honest report.
#[tauri::command]
pub fn reload_skills() -> Value {
    not_wired("reload_skills", "no skill loader is implemented yet")
}

/// `list_plugins` — plugin entries recorded in the shell store.
#[tauri::command]
pub fn list_plugins(state: State<'_, AppState>) -> Result<Value, String> {
    let inner = state.inner.lock().map_err(|e| e.to_string())?;
    let plugins: Vec<Value> = inner
        .connectors
        .iter()
        .filter(|c| c.kind == "plugin")
        .map(|c| {
            json!({
                "id": c.id,
                "name": c.name,
                "enabled": c.config.get("enabled").and_then(Value::as_bool).unwrap_or(true),
            })
        })
        .collect();
    Ok(json!({
        "plugins": plugins,
        "status": NOT_WIRED,
        "detail": "plugins are recorded but the kernel does not load them yet",
    }))
}

/// `set_plugin_enabled` — record the flag without pretending to load anything.
///
/// Deliberately does NOT mirror the old engine behaviour, where disabling a
/// plugin performed an *uninstall* (see the audit finding at `engine.rs:683-693`).
/// Toggling a flag must never delete data.
#[tauri::command]
pub fn set_plugin_enabled(
    state: State<'_, AppState>,
    id: String,
    enabled: bool,
) -> Result<Value, String> {
    {
        let mut inner = state.inner.lock().map_err(|e| e.to_string())?;
        match inner
            .connectors
            .iter_mut()
            .find(|c| c.id == id && c.kind == "plugin")
        {
            Some(entry) => {
                if !entry.config.is_object() {
                    entry.config = json!({});
                }
                entry.config["enabled"] = json!(enabled);
            }
            None => inner.connectors.push(crate::state::Connector {
                id: id.clone(),
                name: id.clone(),
                kind: "plugin".into(),
                config: json!({ "enabled": enabled }),
            }),
        }
    }
    state.save().map_err(|e| e.to_string())?;
    Ok(json!({ "id": id, "enabled": enabled }))
}

// ── approvals / raw RPC ─────────────────────────────────────────────────────

/// `respond_server_request` — reply to an approval or user-input request.
///
/// The echo provider never requests approval, so there is nothing to answer.
/// Returns an explicit "no pending request" result rather than a silent success,
/// so a UI that shows an approval card learns the card is stale.
#[tauri::command]
pub fn respond_server_request(payload: Value) -> Value {
    let id = payload
        .get("id")
        .or_else(|| payload.get("requestId"))
        .and_then(|v| v.as_str().map(str::to_string).or_else(|| Some(v.to_string())))
        .unwrap_or_else(|| "<none>".into());
    json!({
        "ok": false,
        "status": NOT_WIRED,
        "requestId": id,
        "detail": "the kernel has no pending server request with that id",
    })
}

/// `resolve_approval` — alias kept for the approval cards; same honesty.
#[tauri::command]
pub fn resolve_approval(payload: Value) -> Value {
    respond_server_request(payload)
}

/// `rpc_raw` — pass-through to the engine's JSON-RPC surface.
///
/// There is no engine to pass through to. Reporting this explicitly is
/// important: the old shell exposed an unauthenticated pass-through to any
/// app-server method, which was a security hole as well as a debugging aid.
#[tauri::command]
pub fn rpc_raw(payload: Value) -> Value {
    let method = payload
        .get("method")
        .and_then(Value::as_str)
        .unwrap_or("<unknown>");
    not_wired(
        "rpc_raw",
        &format!("there is no JSON-RPC engine in the kernel; '{method}' cannot be forwarded"),
    )
}

// ── shell / tools ───────────────────────────────────────────────────────────

/// `open_shell` / `write_shell` / `read_shell` / `close_shell` and
/// `git_status` / `list_agent_tools` used to drive the engine's PTY. The kernel
/// has no shell executor yet, so all of them report the missing capability.
fn shell_not_wired(command: &str) -> Value {
    not_wired(command, "the kernel does not execute shell commands yet")
}

#[tauri::command]
pub fn open_shell(payload: Value) -> Value {
    let _ = payload;
    shell_not_wired("open_shell")
}

#[tauri::command]
pub fn write_shell(payload: Value) -> Value {
    let _ = payload;
    shell_not_wired("write_shell")
}

#[tauri::command]
pub fn read_shell(payload: Value) -> Value {
    let _ = payload;
    shell_not_wired("read_shell")
}

#[tauri::command]
pub fn close_shell(payload: Value) -> Value {
    let _ = payload;
    shell_not_wired("close_shell")
}

/// `git_status` — no repository inspection yet.
///
/// The previous implementation fabricated a clean tree when `thread_id` was
/// absent; that is exactly the "fake success" the project forbids, so this
/// returns an explicit not-wired result instead.
#[tauri::command]
pub fn git_status(payload: Value) -> Value {
    let _ = payload;
    not_wired("git_status", "the kernel does not inspect git state yet")
}

/// `list_agent_tools` — no tool registry yet.
#[tauri::command]
pub fn list_agent_tools() -> Value {
    json!({
        "tools": [],
        "status": NOT_WIRED,
        "detail": "the kernel has no tool registry yet",
    })
}
