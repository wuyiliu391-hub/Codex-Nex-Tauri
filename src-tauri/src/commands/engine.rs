//! Forward Codex-Nex App methods to official codex-app-server JSON-RPC.
//!
//! Method names follow app-server-protocol v0.154.0 (see protocol.rs and
//! docs/RUST_BACKEND.md). Unknown/optional endpoints still return structured
//! errors so the UI can degrade instead of hanging.

use crate::codex::protocol::*;
use crate::codex::EngineHandle;
use serde_json::{json, Value};
use tauri::State;

async fn rpc(
    engine: &State<'_, EngineHandle>,
    method: &str,
    params: Value,
) -> Result<Value, String> {
    let params = if params.is_null() { None } else { Some(params) };
    engine.rpc(method, params).await
}

#[tauri::command]
pub async fn engine_status(engine: State<'_, EngineHandle>) -> Result<Value, String> {
    Ok(json!({
        "connected": engine.is_running(),
        "initialize": engine.initialize_meta(),
    }))
}

#[tauri::command]
pub async fn new_session(
    engine: State<'_, EngineHandle>,
    project_path: Option<String>,
) -> Result<Value, String> {
    let mut params = json!({});
    if let Some(p) = project_path {
        params["cwd"] = json!(p);
    }
    let v = rpc(&engine, THREAD_START, params).await?;
    // ThreadStartResponse is `{ thread, model, modelProvider, cwd, ... }`.
    // Flatten `thread` to the top level so UI can read `id` directly while
    // keeping the full payload under `threadStart`.
    if let Some(thread) = v.get("thread").cloned() {
        let mut flat = thread;
        if let Some(obj) = flat.as_object_mut() {
            obj.insert("threadStart".into(), v);
        }
        Ok(flat)
    } else {
        Ok(v)
    }
}

#[tauri::command]
pub async fn list_sessions(
    engine: State<'_, EngineHandle>,
    archived: Option<bool>,
) -> Result<Value, String> {
    rpc(
        &engine,
        THREAD_LIST,
        json!({ "archived": archived.unwrap_or(false) }),
    )
    .await
}

#[tauri::command]
pub async fn get_session(
    engine: State<'_, EngineHandle>,
    session_id: String,
) -> Result<Value, String> {
    let v = rpc(&engine, THREAD_READ, json!({ "threadId": session_id })).await?;
    // ThreadReadResponse is `{ thread: Thread }`. Return the Thread object
    // so UI optional-chaining (`s?.id`, `s?.archived`) works.
    Ok(v.get("thread").cloned().unwrap_or(v))
}

#[tauri::command]
pub async fn delete_session(
    engine: State<'_, EngineHandle>,
    session_id: String,
) -> Result<Value, String> {
    rpc(&engine, THREAD_DELETE, json!({ "threadId": session_id })).await
}

#[tauri::command]
pub async fn archive_session(
    engine: State<'_, EngineHandle>,
    session_id: String,
) -> Result<Value, String> {
    rpc(&engine, THREAD_ARCHIVE, json!({ "threadId": session_id })).await
}

#[tauri::command]
pub async fn unarchive_session(
    engine: State<'_, EngineHandle>,
    session_id: String,
) -> Result<Value, String> {
    rpc(&engine, THREAD_UNARCHIVE, json!({ "threadId": session_id })).await
}

#[tauri::command]
pub async fn send_message(
    engine: State<'_, EngineHandle>,
    session_id: String,
    message: String,
    attachments: Option<Vec<Value>>,
) -> Result<Value, String> {
    // Official TurnStartParams.input is Vec<UserInput>:
    //   [{ "type": "text", "text": "...", "textElements": [] }, ...]
    // NOT `{ input: { items: [...] } }`.
    let mut items = vec![json!({ "type": "text", "text": message })];
    if let Some(files) = attachments {
        for f in files {
            items.push(f);
        }
    }
    rpc(
        &engine,
        TURN_START,
        json!({
            "threadId": session_id,
            "input": items,
        }),
    )
    .await
}

#[tauri::command]
pub async fn interrupt_session(
    engine: State<'_, EngineHandle>,
    session_id: String,
) -> Result<Value, String> {
    rpc(&engine, TURN_INTERRUPT, json!({ "threadId": session_id })).await
}

/// Resolve a server→client approval / user-input request.
///
/// Official turn/start approvals do NOT use a client method. We reply to the
/// server request id with `{ "decision": "accept" | "decline" | "cancel" }`.
/// `kind` is accepted for UI compatibility (`exec` | `apply_patch` | other).
#[tauri::command]
pub async fn resolve_approval(
    engine: State<'_, EngineHandle>,
    request_id: Value,
    approved: bool,
    kind: Option<String>,
    session_scope: Option<bool>,
) -> Result<(), String> {
    let decision = if approved {
        if session_scope.unwrap_or(false) {
            "acceptForSession"
        } else {
            "accept"
        }
    } else {
        match kind.as_deref() {
            Some("cancel") => "cancel",
            _ => "decline",
        }
    };
    engine.respond(request_id, json!({ "decision": decision }))
}

/// List model providers from config/read. Engine has no dedicated
/// `modelProvider/list` — providers live in config.
#[tauri::command]
pub async fn list_providers(engine: State<'_, EngineHandle>) -> Result<Value, String> {
    match rpc(&engine, CONFIG_READ, json!({})).await {
        Ok(v) => {
            // Normalize to { providers: [...] } for bridge extractProviders.
            let providers = v
                .get("config")
                .and_then(|c| c.get("model_providers"))
                .cloned()
                .or_else(|| v.get("modelProviders").cloned())
                .unwrap_or_else(|| json!({}));
            let list = if providers.is_object() {
                providers
                    .as_object()
                    .map(|m| {
                        m.iter()
                            .map(|(k, mut val)| {
                                if val.is_object() {
                                    if let Some(obj) = val.as_object_mut() {
                                        obj.entry("id")
                                            .or_insert_with(|| Value::String(k.clone()));
                                    }
                                }
                                val
                            })
                            .collect::<Vec<_>>()
                    })
                    .unwrap_or_default()
            } else if providers.is_array() {
                providers.as_array().cloned().unwrap_or_default()
            } else {
                Vec::new()
            };
            Ok(json!({ "providers": list, "raw": v }))
        }
        Err(e) => Err(e),
    }
}

/// Write a provider into config via config/batchWrite.
#[tauri::command]
pub async fn save_provider(
    engine: State<'_, EngineHandle>,
    provider: Value,
) -> Result<Value, String> {
    let id = provider
        .get("id")
        .and_then(|v| v.as_str())
        .unwrap_or("custom")
        .to_string();
    let mut value = provider.clone();
    if let Some(obj) = value.as_object_mut() {
        obj.remove("id");
    }
    rpc(
        &engine,
        CONFIG_BATCH_WRITE,
        json!({
            "edits": [{
                "keyPath": format!("model_providers.{id}"),
                "value": value,
                "mergeStrategy": "replace",
            }],
            "reloadUserConfig": true,
        }),
    )
    .await
}

/// Probe models for a provider.
#[tauri::command]
pub async fn probe_provider(
    engine: State<'_, EngineHandle>,
    provider_id: String,
) -> Result<Value, String> {
    rpc(&engine, MODEL_LIST, json!({ "providerId": provider_id })).await
}

/// List MCP servers from official mcpServerStatus/list.
#[tauri::command]
pub async fn list_mcp_servers(engine: State<'_, EngineHandle>) -> Result<Value, String> {
    match rpc(&engine, MCP_SERVER_STATUS_LIST, json!({})).await {
        Ok(v) => {
            // Normalize { data: [...] } → { servers: [...] } for bridge.
            let servers = v
                .get("data")
                .and_then(|d| d.as_array())
                .cloned()
                .or_else(|| v.get("servers").and_then(|d| d.as_array()).cloned())
                .unwrap_or_default();
            Ok(json!({ "servers": servers, "raw": v }))
        }
        Err(e) => Err(e),
    }
}

/// Persist an MCP server into config via config/batchWrite.
#[tauri::command]
pub async fn save_mcp_server(
    engine: State<'_, EngineHandle>,
    server: Value,
) -> Result<Value, String> {
    let name = server
        .get("name")
        .and_then(|v| v.as_str())
        .unwrap_or("server")
        .to_string();
    let mut value = server.clone();
    if let Some(obj) = value.as_object_mut() {
        obj.remove("name");
    }
    rpc(
        &engine,
        CONFIG_BATCH_WRITE,
        json!({
            "edits": [{
                "keyPath": format!("mcp_servers.{name}"),
                "value": value,
                "mergeStrategy": "replace",
            }],
            "reloadUserConfig": true,
        }),
    )
    .await
}

/// Best-effort MCP connectivity probe: reload then list status.
#[tauri::command]
pub async fn test_mcp_connection(
    engine: State<'_, EngineHandle>,
    server: Value,
) -> Result<Value, String> {
    // Persist-optional probe: write is not required; reload + list is enough
    // to see whether a configured server becomes connected.
    let _ = server;
    match engine.rpc(MCP_SERVER_REFRESH, None).await {
        Ok(_) => rpc(&engine, MCP_SERVER_STATUS_LIST, json!({})).await,
        Err(_) => rpc(&engine, MCP_SERVER_STATUS_LIST, json!({})).await,
    }
}

/// Enable/disable an MCP server by rewriting its config entry and reloading.
#[tauri::command]
pub async fn set_mcp_server_enabled(
    engine: State<'_, EngineHandle>,
    name: String,
    enabled: bool,
) -> Result<Value, String> {
    rpc(
        &engine,
        CONFIG_VALUE_WRITE,
        json!({
            "keyPath": format!("mcp_servers.{name}.enabled"),
            "value": enabled,
            "mergeStrategy": "replace",
        }),
    )
    .await?;
    engine.rpc(MCP_SERVER_REFRESH, None).await
}

#[tauri::command]
pub async fn list_skills(engine: State<'_, EngineHandle>) -> Result<Value, String> {
    match rpc(&engine, SKILLS_LIST, json!({})).await {
        Ok(v) => {
            let skills = v
                .get("skills")
                .and_then(|d| d.as_array())
                .cloned()
                .or_else(|| v.get("data").and_then(|d| d.as_array()).cloned())
                .unwrap_or_default();
            Ok(json!({ "skills": skills, "raw": v }))
        }
        Err(e) => Err(e),
    }
}

/// Official has no skills/reload; list is a refresh.
#[tauri::command]
pub async fn reload_skills(engine: State<'_, EngineHandle>) -> Result<Value, String> {
    rpc(&engine, SKILLS_LIST, json!({})).await
}

#[tauri::command]
pub async fn list_plugins(engine: State<'_, EngineHandle>) -> Result<Value, String> {
    match rpc(&engine, PLUGINS_LIST, json!({})).await {
        Ok(v) => {
            let plugins = v
                .get("plugins")
                .and_then(|d| d.as_array())
                .cloned()
                .or_else(|| v.get("data").and_then(|d| d.as_array()).cloned())
                .unwrap_or_default();
            Ok(json!({ "plugins": plugins, "raw": v }))
        }
        Err(e) => Err(e),
    }
}

/// Official has no plugin/setEnabled. Disable is uninstall; enable is install.
#[tauri::command]
pub async fn set_plugin_enabled(
    engine: State<'_, EngineHandle>,
    id: String,
    enabled: bool,
) -> Result<Value, String> {
    if enabled {
        rpc(&engine, PLUGIN_INSTALL, json!({ "id": id })).await
    } else {
        rpc(&engine, PLUGIN_UNINSTALL, json!({ "id": id })).await
    }
}

// ─── shell: official method is command/exec ──────────────────────────────────

/// Spawn a shell via official `command/exec`.
///
/// Requires a `command` argv vector. When only `shell` is provided we launch
/// an interactive TTY shell (`cmd.exe` / `powershell` / `pwsh` on Windows).
/// `processId` is client-supplied so follow-up write/terminate can address it.
/// Returns the processId (also present in the engine response when echoed).
#[tauri::command]
pub async fn open_shell(
    engine: State<'_, EngineHandle>,
    session_id: Option<String>,
    shell: Option<String>,
    cwd: Option<String>,
) -> Result<Value, String> {
    let process_id = session_id.unwrap_or_else(|| uuid::Uuid::new_v4().to_string());
    let shell_bin = shell.unwrap_or_else(|| {
        if cfg!(windows) {
            "powershell.exe".to_string()
        } else {
            "/bin/sh".to_string()
        }
    });
    let mut params = json!({
        "command": [shell_bin],
        "processId": process_id,
        "tty": true,
        "streamStdin": true,
        "streamStdoutStderr": true,
    });
    if let Some(c) = cwd {
        params["cwd"] = json!(c);
    }
    match rpc(&engine, COMMAND_EXEC, params).await {
        Ok(mut v) => {
            // Ensure the client-supplied processId is always visible to the UI.
            if let Some(obj) = v.as_object_mut() {
                obj.entry("processId")
                    .or_insert_with(|| json!(process_id.clone()));
            }
            Ok(v)
        }
        // TTY sessions may ack with an empty/error-shaped result while the
        // process stays alive; still hand back the processId so write/close work.
        Err(e) => {
            if e.contains("timeout") || e.contains("WouldBlock") {
                Ok(json!({ "processId": process_id, "note": e }))
            } else {
                Err(e)
            }
        }
    }
}

/// `session_id` is the `command/exec` processId returned by `open_shell`
/// (bridge.js keeps the historical name). Official write takes base64 stdin.
#[tauri::command]
pub async fn write_shell(
    engine: State<'_, EngineHandle>,
    session_id: String,
    data: String,
) -> Result<Value, String> {
    use base64::Engine as _;
    let encoded = base64::engine::general_purpose::STANDARD.encode(data.as_bytes());
    rpc(
        &engine,
        COMMAND_EXEC_WRITE,
        json!({ "processId": session_id, "deltaBase64": encoded }),
    )
    .await
}

/// command/exec streams output via notifications (`command/exec/outputDelta`).
/// There is no read endpoint; this is a no-op that documents the contract.
#[tauri::command]
pub async fn read_shell(
    engine: State<'_, EngineHandle>,
    session_id: String,
) -> Result<Value, String> {
    let _ = (&engine, session_id);
    Ok(json!({
        "note": "output streams via command/exec/outputDelta notifications",
        "items": [],
    }))
}

#[tauri::command]
pub async fn close_shell(
    engine: State<'_, EngineHandle>,
    session_id: String,
) -> Result<Value, String> {
    // Close stdin first so the shell can exit cleanly, then terminate.
    let _ = engine
        .rpc(
            COMMAND_EXEC_WRITE,
            Some(json!({ "processId": session_id, "closeStdin": true })),
        )
        .await;
    rpc(
        &engine,
        COMMAND_EXEC_TERMINATE,
        json!({ "processId": session_id }),
    )
    .await
}

/// Git status is not a first-class app-server method. Use thread/shellCommand
/// as a one-shot (shell out to git) when a thread context exists; otherwise
/// return a structured empty status so the UI degrades.
/// Official ThreadShellCommandParams.command is a shell **string** (not argv).
#[tauri::command]
pub async fn git_status(
    engine: State<'_, EngineHandle>,
    cwd: String,
    thread_id: Option<String>,
) -> Result<Value, String> {
    if let Some(tid) = thread_id {
        return rpc(
            &engine,
            THREAD_SHELL_COMMAND,
            json!({
                "threadId": tid,
                "command": "git status --porcelain=v1 -b",
            }),
        )
        .await;
    }
    Ok(json!({
        "branch": "",
        "dirty": false,
        "files": [],
        "note": "pass thread_id to run git status via thread/shellCommand",
        "cwd": cwd,
    }))
}

#[tauri::command]
pub async fn get_runtime_events(
    engine: State<'_, EngineHandle>,
    session_id: String,
) -> Result<Value, String> {
    rpc(
        &engine,
        THREAD_TIMELINE_LIST,
        json!({ "threadId": session_id }),
    )
    .await
}

/// Agent tools are not a stable app-server method. Return empty and let
/// rpc_raw reach experimental endpoints if needed.
#[tauri::command]
pub async fn list_agent_tools(engine: State<'_, EngineHandle>) -> Result<Value, String> {
    let _ = &engine;
    Ok(json!({ "tools": [] }))
}

/// Escape hatch: send any app-server method. Used for incremental migration.
#[tauri::command]
pub async fn rpc_raw(
    engine: State<'_, EngineHandle>,
    method: String,
    params: Option<Value>,
) -> Result<Value, String> {
    engine.rpc(&method, params).await
}
