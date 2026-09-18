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

/// Respond to any server→client request with an arbitrary JSON result.
///
/// `resolve_approval` only carries a boolean, which cannot express the full
/// official decision set:
///   accept / acceptForSession / decline / cancel            (no payload)
///   acceptWithExecpolicyAmendment { execpolicyAmendment }   ("always allow")
///   applyNetworkPolicyAmendment   { networkPolicyAmendment }
///
/// The server tells the client which of these to offer via the request's
/// `availableDecisions`, so the client must be able to echo back exactly what
/// it was given. This command forwards the result verbatim to the request id.
#[tauri::command]
pub async fn respond_server_request(
    engine: State<'_, EngineHandle>,
    request_id: Value,
    result: Value,
) -> Result<(), String> {
    engine.respond(request_id, result)
}

/// List model providers from config/read. Engine has no dedicated
/// `modelProvider/list` — providers live in config.
#[tauri::command]
pub async fn list_providers(
    app: tauri::AppHandle,
    engine: State<'_, EngineHandle>,
) -> Result<Value, String> {
    use tauri::Manager as _;
    let (protocols, endpoints) = match app.try_state::<crate::state::AppState>() {
        Some(st) => match st.inner.lock() {
            Ok(inner) => (inner.provider_protocols.clone(), inner.provider_endpoints.clone()),
            Err(_) => (HashMap::new(), HashMap::new()),
        },
        None => (HashMap::new(), HashMap::new()),
    };

    match rpc(&engine, CONFIG_READ, json!({})).await {
        Ok(v) => {
            // Normalize to { providers: [...] } for bridge extractProviders.
            let providers = v
                .get("config")
                .and_then(|c| c.get("model_providers"))
                .cloned()
                .or_else(|| v.get("modelProviders").cloned())
                .unwrap_or_else(|| json!({}));
            let list: Vec<Value> = if providers.is_object() {
                providers
                    .as_object()
                    .map(|m| {
                        m.iter()
                            .map(|(k, val)| {
                                let mut val = val.clone();
                                if let Some(obj) = val.as_object_mut() {
                                    obj.entry("id").or_insert_with(|| Value::String(k.clone()));
                                    if let Some(proto) = protocols.get(k) {
                                        obj.insert("protocol".into(), Value::String(proto.clone()));
                                    }
                                    if let Some(real_url) = endpoints.get(k) {
                                        obj.insert("realBaseUrl".into(), Value::String(real_url.clone()));
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

/// Persist a provider into config.toml using **official schema fields only**.
///
/// The old version wrote the whole UI object — including `apiKey`, `models`,
/// `contextWindow`, `maxOutputTokens`, `hasApiKey` — under
/// `model_providers.<id>`. None of those are real config keys, so the key was
/// silently ignored by the engine (the provider could never authenticate) while
/// still being written to disk in plaintext.
///
/// Now:
/// - only `name` / `base_url` / `wire_api` / `requires_openai_auth` / `env_key`
///   are written, as individual leaf keys;
/// - sibling keys already in the file (e.g. `experimental_bearer_token`) are
///   deliberately left untouched;
/// - the secret goes into the shell store and is injected into the sidecar
///   environment as the `env_key` variable at spawn time.
#[tauri::command]
pub async fn save_provider(
    app: tauri::AppHandle,
    engine: State<'_, EngineHandle>,
    provider: Value,
) -> Result<Value, String> {
    use tauri::Manager as _;

    let id = provider
        .get("id")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .trim()
        .to_string();
    if id.is_empty() {
        return Err("provider id is required".into());
    }

    let name = provider
        .get("name")
        .and_then(|v| v.as_str())
        .unwrap_or(id.as_str())
        .trim()
        .to_string();
    let base_url = provider
        .get("baseUrl")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .trim()
        .trim_end_matches('/')
        .to_string();
    let api_key = provider
        .get("apiKey")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .trim()
        .to_string();

    let protocol = provider
        .get("protocol")
        .and_then(|v| v.as_str())
        .unwrap_or("openai_chat")
        .trim()
        .to_string();
    let default_model = provider
        .get("defaultModel")
        .and_then(|v| v.as_str())
        .map(|s| s.trim().to_string());

    let needs_adapter = protocol != "openai_responses";
    let effective_base_url = if needs_adapter {
        format!("http://127.0.0.1:{}/v1", crate::codex::DEFAULT_ADAPTER_PORT)
    } else {
        base_url.clone()
    };

    // Store the route in the protocol adapter
    if let Some(adapter_state) = app.try_state::<crate::codex::AdapterState>() {
        adapter_state.set_route(crate::codex::ProviderRoute {
            id: id.clone(),
            protocol: protocol.clone(),
            target_base_url: base_url.clone(),
            api_key: api_key.clone(),
            default_model: default_model.clone(),
        });
        adapter_state.set_active(&id);
    }

    // Persist provider secret, protocol and real endpoint in AppState
    if let Some(state) = app.try_state::<crate::state::AppState>() {
        if let Ok(mut inner) = state.inner.lock() {
            if !api_key.is_empty() {
                inner.provider_secrets.insert(id.clone(), api_key.clone());
            }
            inner.provider_protocols.insert(id.clone(), protocol.clone());
            inner.provider_endpoints.insert(id.clone(), base_url.clone());
        }
        state.save().map_err(|e| e.to_string())?;
    }

    // 0.154 dropped `wire_api = "chat"`; `responses` is the only supported wire.
    const WIRE_API: &str = "responses";
    let env_key = crate::state::provider_env_key(&id);

    let mut edits = vec![
        json!({
            "keyPath": format!("model_providers.{id}.name"),
            "value": name,
            "mergeStrategy": "replace",
        }),
        json!({
            "keyPath": format!("model_providers.{id}.base_url"),
            "value": effective_base_url,
            "mergeStrategy": "replace",
        }),
        json!({
            "keyPath": format!("model_providers.{id}.wire_api"),
            "value": WIRE_API,
            "mergeStrategy": "replace",
        }),
        json!({
            "keyPath": format!("model_providers.{id}.requires_openai_auth"),
            "value": false,
            "mergeStrategy": "replace",
        }),
    ];
    if !api_key.is_empty() {
        edits.push(json!({
            "keyPath": format!("model_providers.{id}.env_key"),
            "value": env_key.clone(),
            "mergeStrategy": "replace",
        }));
    }

    let result = rpc(
        &engine,
        CONFIG_BATCH_WRITE,
        json!({ "edits": edits, "reloadUserConfig": true }),
    )
    .await?;

    Ok(json!({
        "ok": true,
        "id": id,
        "envKey": env_key,
        "keyStored": !api_key.is_empty(),
        "note": "API key 保存在本机 shell 存储，通过 env_key 注入引擎环境，不写入 config.toml；重启应用后生效。",
        "result": result,
    }))
}

/// Probe a provider by talking HTTP straight to its gateway.
///
/// app-server has **no** provider-probe method: `model/list` ignores
/// `providerId` and returns a static catalog, so routing the check through the
/// engine proves nothing. The shell therefore performs the check itself:
/// `GET {base}/models` for OpenAI-compatible gateways, with protocol-specific
/// fallbacks for Anthropic and Ollama.
///
/// Never returns `Err` for a reachable-but-failing gateway — the failure is
/// reported as `{ ok: false, error }` so the UI can show it inline.
#[tauri::command]
pub async fn probe_provider(
    provider_id: Option<String>,
    base_url: Option<String>,
    protocol: Option<String>,
    api_key: Option<String>,
    model: Option<String>,
) -> Result<Value, String> {
    let base = base_url
        .unwrap_or_default()
        .trim()
        .trim_end_matches('/')
        .to_string();
    if base.is_empty() {
        return Ok(json!({ "ok": false, "error": "Base URL 为空" }));
    }
    if !base.starts_with("http://") && !base.starts_with("https://") {
        return Ok(json!({
            "ok": false,
            "error": "Base URL 必须以 http:// 或 https:// 开头",
        }));
    }

    let proto = protocol.unwrap_or_else(|| "openai_chat".into());
    let key = api_key.unwrap_or_default().trim().to_string();

    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(20))
        .build()
        .map_err(|e| format!("build http client: {e}"))?;

    // Candidate endpoints, most-likely first. `style` picks the auth header.
    let mut candidates: Vec<(String, &'static str)> = Vec::new();
    match proto.as_str() {
        "anthropic" => {
            candidates.push((format!("{base}/v1/models"), "anthropic"));
            candidates.push((format!("{base}/models"), "anthropic"));
        }
        "ollama" => {
            candidates.push((format!("{base}/api/tags"), "ollama"));
            candidates.push((format!("{base}/models"), "openai"));
        }
        _ => {
            candidates.push((format!("{base}/models"), "openai"));
            if !base.ends_with("/v1") {
                candidates.push((format!("{base}/v1/models"), "openai"));
            }
        }
    }

    let mut last_err = String::new();
    for (url, style) in candidates {
        let mut req = client.get(&url);
        if !key.is_empty() {
            req = match style {
                "anthropic" => req
                    .header("x-api-key", &key)
                    .header("anthropic-version", "2023-06-01"),
                _ => req.header("authorization", format!("Bearer {key}")),
            };
        }

        let resp = match req.send().await {
            Ok(r) => r,
            Err(e) => {
                last_err = format!("{url} → {e}");
                continue;
            }
        };
        let status = resp.status();
        let body = resp.text().await.unwrap_or_default();
        if !status.is_success() {
            last_err = format!(
                "{url} → HTTP {} {}",
                status.as_u16(),
                truncate_chars(&body, 160)
            );
            continue;
        }

        let models = extract_model_ids(&body);
        let model_found = model
            .as_deref()
            .map(str::trim)
            .filter(|m| !m.is_empty())
            .map(|m| models.iter().any(|x| x.eq_ignore_ascii_case(m)));
        return Ok(json!({
            "ok": true,
            "providerId": provider_id,
            "endpoint": url,
            "status": status.as_u16(),
            "models": models,
            "modelCount": models.len(),
            "modelFound": model_found,
        }));
    }

    Ok(json!({ "ok": false, "providerId": provider_id, "error": last_err }))
}

/// Pull model ids out of an OpenAI (`data[].id`), Ollama (`models[].name`) or
/// bare-array payload. Unknown shapes yield an empty list, not an error.
fn extract_model_ids(body: &str) -> Vec<String> {
    let Ok(value) = serde_json::from_str::<Value>(body) else {
        return Vec::new();
    };
    let arr = value
        .get("data")
        .and_then(|d| d.as_array())
        .or_else(|| value.get("models").and_then(|d| d.as_array()))
        .or_else(|| value.as_array());
    let Some(arr) = arr else {
        return Vec::new();
    };
    arr.iter()
        .filter_map(|m| {
            m.get("id")
                .and_then(|x| x.as_str())
                .or_else(|| m.get("name").and_then(|x| x.as_str()))
                .or_else(|| m.get("model").and_then(|x| x.as_str()))
        })
        .map(str::to_string)
        .collect()
}

/// Char-safe truncation for error bodies (may contain CJK).
fn truncate_chars(s: &str, max: usize) -> String {
    let s = s.trim();
    if s.chars().count() <= max {
        s.to_string()
    } else {
        let mut out: String = s.chars().take(max).collect();
        out.push('…');
        out
    }
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
