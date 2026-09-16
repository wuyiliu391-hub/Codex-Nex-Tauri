//! Forward Codex-Nex App methods to official codex-app-server JSON-RPC.
//!
//! Method names follow app-server v0.154.0. Unknown/optional endpoints still
//! return structured errors so the UI can degrade instead of hanging.

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
    rpc(&engine, THREAD_START, params).await
}

#[tauri::command]
pub async fn list_sessions(
    engine: State<'_, EngineHandle>,
    archived: Option<bool>,
) -> Result<Value, String> {
    rpc(&engine, THREAD_LIST, json!({ "archived": archived.unwrap_or(false) })).await
}

#[tauri::command]
pub async fn get_session(engine: State<'_, EngineHandle>, session_id: String) -> Result<Value, String> {
    rpc(&engine, THREAD_READ, json!({ "threadId": session_id })).await
}

#[tauri::command]
pub async fn delete_session(engine: State<'_, EngineHandle>, session_id: String) -> Result<Value, String> {
    rpc(&engine, THREAD_DELETE, json!({ "threadId": session_id })).await
}

#[tauri::command]
pub async fn archive_session(engine: State<'_, EngineHandle>, session_id: String) -> Result<Value, String> {
    rpc(&engine, THREAD_ARCHIVE, json!({ "threadId": session_id })).await
}

#[tauri::command]
pub async fn unarchive_session(engine: State<'_, EngineHandle>, session_id: String) -> Result<Value, String> {
    rpc(&engine, THREAD_UNARCHIVE, json!({ "threadId": session_id })).await
}

#[tauri::command]
pub async fn send_message(
    engine: State<'_, EngineHandle>,
    session_id: String,
    message: String,
    attachments: Option<Vec<Value>>,
) -> Result<Value, String> {
    let mut input = json!([{ "type": "text", "text": message }]);
    if let Some(files) = attachments {
        for f in files {
            input.as_array_mut().unwrap().push(f);
        }
    }
    rpc(
        &engine,
        TURN_START,
        json!({
            "threadId": session_id,
            "input": { "items": input },
        }),
    )
    .await
}

#[tauri::command]
pub async fn interrupt_session(engine: State<'_, EngineHandle>, session_id: String) -> Result<Value, String> {
    rpc(&engine, TURN_INTERRUPT, json!({ "threadId": session_id })).await
}

#[tauri::command]
pub async fn resolve_approval(
    engine: State<'_, EngineHandle>,
    request_id: String,
    approved: bool,
    kind: Option<String>,
) -> Result<Value, String> {
    let method = match kind.as_deref() {
        Some("apply_patch") => APPLY_PATCH_APPROVAL_RESPOND,
        Some("exec") | None => EXEC_COMMAND_APPROVAL_RESPOND,
        Some(_) => APPROVAL_RESPOND,
    };
    rpc(
        &engine,
        method,
        json!({
            "requestId": request_id,
            "approved": approved,
        }),
    )
    .await
}

#[tauri::command]
pub async fn list_providers(engine: State<'_, EngineHandle>) -> Result<Value, String> {
    rpc(&engine, PROVIDER_LIST, json!({})).await
}

#[tauri::command]
pub async fn save_provider(
    engine: State<'_, EngineHandle>,
    provider: Value,
) -> Result<Value, String> {
    rpc(&engine, CONFIG_UPDATE, json!({ "modelProvider": provider })).await
}

#[tauri::command]
pub async fn probe_provider(
    engine: State<'_, EngineHandle>,
    provider_id: String,
) -> Result<Value, String> {
    rpc(&engine, MODEL_LIST, json!({ "providerId": provider_id })).await
}

#[tauri::command]
pub async fn list_mcp_servers(engine: State<'_, EngineHandle>) -> Result<Value, String> {
    rpc(&engine, MCP_LIST_SERVERS, json!({})).await
}

#[tauri::command]
pub async fn save_mcp_server(engine: State<'_, EngineHandle>, server: Value) -> Result<Value, String> {
    rpc(&engine, CONFIG_UPDATE, json!({ "mcpServers": [server] })).await
}

#[tauri::command]
pub async fn test_mcp_connection(engine: State<'_, EngineHandle>, server: Value) -> Result<Value, String> {
    // Best-effort: some builds expose mcp/test; fall back to list.
    match engine
        .rpc("mcp/test", Some(json!({ "server": server })))
        .await
    {
        Ok(v) => Ok(v),
        Err(_) => rpc(&engine, MCP_LIST_SERVERS, json!({})).await,
    }
}

#[tauri::command]
pub async fn set_mcp_server_enabled(
    engine: State<'_, EngineHandle>,
    name: String,
    enabled: bool,
) -> Result<Value, String> {
    rpc(
        &engine,
        MCP_SET_SERVER_ENABLED,
        json!({ "name": name, "enabled": enabled }),
    )
    .await
}

#[tauri::command]
pub async fn list_skills(engine: State<'_, EngineHandle>) -> Result<Value, String> {
    rpc(&engine, SKILLS_LIST, json!({})).await
}

#[tauri::command]
pub async fn reload_skills(engine: State<'_, EngineHandle>) -> Result<Value, String> {
    match engine.rpc("skills/reload", None).await {
        Ok(v) => Ok(v),
        Err(_) => rpc(&engine, SKILLS_LIST, json!({})).await,
    }
}

#[tauri::command]
pub async fn list_plugins(engine: State<'_, EngineHandle>) -> Result<Value, String> {
    rpc(&engine, PLUGINS_LIST, json!({})).await
}

#[tauri::command]
pub async fn set_plugin_enabled(
    engine: State<'_, EngineHandle>,
    id: String,
    enabled: bool,
) -> Result<Value, String> {
    rpc(
        &engine,
        "plugin/setEnabled",
        json!({ "id": id, "enabled": enabled }),
    )
    .await
}

#[tauri::command]
pub async fn open_shell(
    engine: State<'_, EngineHandle>,
    session_id: String,
    shell: Option<String>,
    cwd: Option<String>,
) -> Result<Value, String> {
    rpc(
        &engine,
        SHELL_OPEN,
        json!({
            "threadId": session_id,
            "shell": shell,
            "cwd": cwd,
        }),
    )
    .await
}

#[tauri::command]
pub async fn write_shell(
    engine: State<'_, EngineHandle>,
    session_id: String,
    data: String,
) -> Result<Value, String> {
    rpc(
        &engine,
        SHELL_WRITE,
        json!({ "threadId": session_id, "data": data }),
    )
    .await
}

#[tauri::command]
pub async fn read_shell(
    engine: State<'_, EngineHandle>,
    session_id: String,
) -> Result<Value, String> {
    rpc(&engine, "shell/read", json!({ "threadId": session_id })).await
}

#[tauri::command]
pub async fn close_shell(engine: State<'_, EngineHandle>, session_id: String) -> Result<Value, String> {
    rpc(&engine, "shell/close", json!({ "threadId": session_id })).await
}

#[tauri::command]
pub async fn git_status(engine: State<'_, EngineHandle>, cwd: String) -> Result<Value, String> {
    rpc(&engine, GIT_STATUS, json!({ "cwd": cwd })).await
}

#[tauri::command]
pub async fn get_runtime_events(
    engine: State<'_, EngineHandle>,
    session_id: String,
) -> Result<Value, String> {
    rpc(&engine, "thread/timeline", json!({ "threadId": session_id })).await
}

#[tauri::command]
pub async fn list_agent_tools(engine: State<'_, EngineHandle>) -> Result<Value, String> {
    match engine.rpc(TOOLS_LIST, None).await {
        Ok(v) => Ok(v),
        Err(_) => Ok(json!({ "tools": [] })),
    }
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
