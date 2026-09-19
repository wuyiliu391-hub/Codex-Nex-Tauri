//! Provider, MCP and plugin configuration for the self-developed kernel.
//!
//! These commands used to forward to the official app-server over WebSocket.
//! The kernel has no engine, so they now operate on the shell's own persisted
//! store (`AppState`) and report honestly what is and is not wired.
//!
//! Design rule (from `README.md`): never return a fabricated success. Where a
//! capability is not implemented yet, the command returns a **typed
//! "not implemented" result** that names the missing piece, instead of an
//! empty list or a fake `ok: true`. The UI can then say something true.
//!
//! What is real here today:
//!  * providers persist in `shell-state.json` (id, base URL, protocol, key)
//!  * **saving a provider rebuilds the kernel's active provider immediately**,
//!    so a newly configured model is used by the very next turn
//!  * `probe_provider` performs a real HTTP request
//!  * MCP server entries persist and can be enabled/disabled
//!  * plugin/marketplace entries persist and can be installed/removed locally
//! What is not wired yet (and says so):
//!  * MCP servers are stored but never launched
//!  * plugins are stored but never loaded
//!  * approvals are never raised (the HTTP provider sends no tools)

use std::sync::Arc;

use serde_json::{json, Value};
use tauri::State;

use crate::kernel::{self, KernelState};
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

/// Rebuild the kernel's provider from the current store contents.
///
/// Called after any write that could change the active provider. Doing it here
/// (rather than on every turn) means a turn never pays for provider
/// construction, and a misconfiguration is reported at save time — where the
/// user is looking — instead of surfacing as a mysterious failure mid-answer.
fn refresh_kernel_provider(
    store: &AppState,
    kernel: &KernelState,
) -> Result<kernel::Resolved, String> {
    let inputs = {
        let inner = store.inner.lock().map_err(|e| e.to_string())?;
        kernel::ProviderInputs {
            active_provider_id: inner.settings.active_provider_id.clone(),
            active_model: inner.settings.active_model.clone(),
            endpoints: inner.provider_endpoints.clone(),
            protocols: inner.provider_protocols.clone(),
            secrets: inner.provider_secrets.clone(),
        }
    };
    let resolved = kernel::build_provider(&inputs);
    kernel.set_provider(resolved.provider());
    Ok(resolved)
}

// ── providers ───────────────────────────────────────────────────────────────

/// `list_providers` — providers configured in the shell store.
///
/// Returns `{ providers: [...] }` because `appStore.ts` normalizes that shape.
/// `kernelProvider` / `placeholder` describe what the kernel is *actually*
/// using right now, which may differ from what is stored if the stored config
/// is incomplete.
#[tauri::command]
pub fn list_providers(
    state: State<'_, AppState>,
    kernel: State<'_, Arc<KernelState>>,
) -> Result<Value, String> {
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
        "activeModel": inner.settings.active_model,
        "kernelProvider": kernel.provider_name(),
        "placeholder": kernel.provider_is_placeholder(),
    }))
}

/// `save_provider` — persist a provider definition and activate it.
///
/// Payload shape is a **compatibility contract** taken from the call site
/// (`frontend/app/views/settings/tabs/AccountTab.tsx:92`), which sends a nested
/// object:
///
/// ```json
/// { "provider": { "id", "name", "baseUrl", "apiKey", "protocol", "defaultModel" } }
/// ```
///
/// Flat fields are also accepted so tests and future callers keep working, but
/// the nested shape is what matters today. Reading only the flat keys would
/// silently store an empty provider.
///
/// After storing, the kernel's active provider is rebuilt so the change takes
/// effect on the next turn without restarting the app.
#[tauri::command]
pub fn save_provider(
    state: State<'_, AppState>,
    kernel: State<'_, Arc<KernelState>>,
    payload: Value,
) -> Result<Value, String> {
    // Accept `{ provider: {...} }` (the frontend) or a flat object.
    let p = payload.get("provider").unwrap_or(&payload);

    let id = p
        .get("id")
        .or_else(|| p.get("providerId"))
        .or_else(|| p.get("name"))
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .map(str::to_string)
        .ok_or_else(|| "save_provider: missing provider id".to_string())?;

    let base_url = p
        .get("baseUrl")
        .or_else(|| p.get("base_url"))
        .and_then(Value::as_str)
        .unwrap_or_default()
        .trim()
        .to_string();

    let protocol = p
        .get("protocol")
        .and_then(Value::as_str)
        .filter(|s| !s.trim().is_empty())
        .unwrap_or("openai_chat")
        .to_string();

    // Only overwrite the stored key when a non-empty one is supplied, so
    // editing the URL does not wipe the credential.
    let api_key = p
        .get("apiKey")
        .or_else(|| p.get("api_key"))
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .map(str::to_string);

    // The form calls it `defaultModel`; the kernel calls it the active model.
    let model = p
        .get("defaultModel")
        .or_else(|| p.get("model"))
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .map(str::to_string);

    {
        let mut inner = state.inner.lock().map_err(|e| e.to_string())?;
        inner.provider_endpoints.insert(id.clone(), base_url);
        inner.provider_protocols.insert(id.clone(), protocol);
        if let Some(key) = api_key {
            inner.provider_secrets.insert(id.clone(), key);
        }
        if let Some(model) = model {
            inner.settings.active_model = model;
        }
        inner.settings.active_provider_id = id.clone();
    }
    state.save().map_err(|e| e.to_string())?;

    let resolved = refresh_kernel_provider(&state, &kernel)?;
    let active = !resolved.is_echo();

    Ok(json!({
        "id": id,
        "saved": true,
        "active": active,
        "kernelProvider": kernel.provider_name(),
        "placeholder": kernel.provider_is_placeholder(),
        // When it did not activate, say why instead of implying success.
        "detail": if active {
            "Provider saved and activated; the next message will use it."
        } else {
            "Provider saved, but the kernel is still on the echo provider — a base URL and a model are both required."
        },
    }))
}

/// `probe_provider` — connectivity check against the configured gateway.
///
/// Performs a real request. Which request depends on the protocol, because the
/// cheapest reliable "is this endpoint alive and is my key accepted" differs:
///
///  * OpenAI-compatible and Anthropic: `GET {base}/models`. It needs no tokens
///    and no spend, and a 401 proves the endpoint is reachable but the key is
///    wrong — which is exactly the distinction the user needs.
///  * Ollama: `GET {base}/api/tags`, its native model listing.
///
/// Response shape is a **compatibility contract** from the call site
/// (`AccountTab.tsx:117-137`), which reads `ok`, `error`, `hint`, `modelCount`,
/// `models[]` and `modelFound`. A network failure is reported as a failure,
/// never as `ok: true`.
#[tauri::command]
pub async fn probe_provider(payload: Value) -> Value {
    // The frontend sends flat fields: providerId / baseUrl / protocol / apiKey / model.
    let id = payload
        .get("providerId")
        .or_else(|| payload.get("provider_id"))
        .or_else(|| payload.get("id"))
        .and_then(Value::as_str)
        .unwrap_or("<unnamed>")
        .to_string();

    let base = payload
        .get("baseUrl")
        .or_else(|| payload.get("base_url"))
        .and_then(Value::as_str)
        .unwrap_or_default()
        .trim()
        .trim_end_matches('/')
        .to_string();

    if base.is_empty() {
        return json!({
            "ok": false,
            "error": "Base URL is empty",
            "hint": "Enter the gateway root, for example https://api.openai.com/v1",
        });
    }
    if !base.starts_with("http://") && !base.starts_with("https://") {
        return json!({
            "ok": false,
            "error": "Base URL must start with http:// or https://",
            "hint": format!("Got '{base}'"),
        });
    }

    let protocol = kernel::WireProtocol::parse(
        payload
            .get("protocol")
            .and_then(Value::as_str)
            .unwrap_or("openai_chat"),
    );

    let api_key = payload
        .get("apiKey")
        .or_else(|| payload.get("api_key"))
        .and_then(Value::as_str)
        .unwrap_or_default()
        .trim()
        .to_string();

    // The model the user expects to find, so the probe can report whether the
    // gateway actually advertises it.
    let wanted_model = payload
        .get("model")
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .map(str::to_string);

    /// Append `/v1` when the user omitted it, matching `HttpProviderConfig`.
    fn versioned(base: &str) -> String {
        match base.rsplit('/').next() {
            Some(last) if last.starts_with('v') && last.len() <= 4 => base.to_string(),
            _ => format!("{base}/v1"),
        }
    }

    let (url, auth) = match protocol {
        kernel::WireProtocol::Ollama => (format!("{base}/api/tags"), Auth::None),
        kernel::WireProtocol::Anthropic => (format!("{}/models", versioned(&base)), Auth::ApiKey),
        _ => (format!("{}/models", versioned(&base)), Auth::Bearer),
    };

    let client = match reqwest::Client::builder()
        .connect_timeout(std::time::Duration::from_secs(10))
        .timeout(std::time::Duration::from_secs(20))
        .build()
    {
        Ok(c) => c,
        Err(e) => {
            return json!({ "ok": false, "error": format!("HTTP client init failed: {e}") })
        }
    };

    let mut req = client.get(&url);
    match auth {
        Auth::Bearer if !api_key.is_empty() => {
            req = req.header(reqwest::header::AUTHORIZATION, format!("Bearer {api_key}"));
        }
        Auth::ApiKey if !api_key.is_empty() => {
            req = req.header("x-api-key", api_key.clone());
            req = req.header("anthropic-version", "2023-06-01");
        }
        _ => {}
    }

    match req.send().await {
        Ok(resp) => {
            let status = resp.status();
            let body = resp.text().await.unwrap_or_default();

            if status.is_success() {
                let models = extract_model_ids(&body);
                let model_found = wanted_model
                    .as_ref()
                    .map(|w| models.iter().any(|m| m == w))
                    // No model requested means "nothing to verify", not "missing".
                    .unwrap_or(true);

                let hint = if models.is_empty() {
                    "Endpoint reachable, but it advertised no models. Some gateways only list models once a key is set.".to_string()
                } else if !model_found {
                    format!(
                        "The endpoint is reachable but does not advertise '{}'. It may still work — some gateways accept any model id.",
                        wanted_model.as_deref().unwrap_or("")
                    )
                } else {
                    "Endpoint reachable and the model is advertised.".to_string()
                };

                json!({
                    "ok": true,
                    "id": id,
                    "status": status.as_u16(),
                    "url": url,
                    "modelCount": models.len(),
                    "models": models,
                    "modelFound": model_found,
                    "hint": hint,
                })
            } else if status.as_u16() == 401 || status.as_u16() == 403 {
                json!({
                    "ok": false,
                    "id": id,
                    "status": status.as_u16(),
                    "url": url,
                    "error": format!("Endpoint reachable but the credential was rejected (HTTP {})", status.as_u16()),
                    "hint": "The URL is correct; the API key is wrong, expired, or not sent. Check the key field.",
                })
            } else {
                json!({
                    "ok": false,
                    "id": id,
                    "status": status.as_u16(),
                    "url": url,
                    "error": format!(
                        "HTTP {}: {}",
                        status.as_u16(),
                        body.chars().take(300).collect::<String>().trim()
                    ),
                    "hint": "The endpoint responded but not with a model list. Verify the base URL points at the API root.",
                })
            }
        }
        Err(e) => {
            let (error, hint) = if e.is_connect() {
                (
                    format!("Could not connect: {e}"),
                    "Check the base URL and that the gateway is running.",
                )
            } else if e.is_timeout() {
                (
                    format!("Timed out: {e}"),
                    "The host did not answer within 20s.",
                )
            } else {
                (format!("Request failed: {e}"), "")
            };
            json!({ "ok": false, "id": id, "url": url, "error": error, "hint": hint })
        }
    }
}

/// How to authenticate a probe request.
#[derive(Clone, Copy)]
enum Auth {
    None,
    Bearer,
    ApiKey,
}

/// Pull model ids out of a `/models`-style response.
///
/// Handles the three shapes seen in the wild: OpenAI (`{data:[{id}]}`),
/// Anthropic (`{data:[{id}]}` too), and Ollama (`{models:[{name}]}`).
fn extract_model_ids(body: &str) -> Vec<String> {
    let Ok(v) = serde_json::from_str::<Value>(body) else {
        return Vec::new();
    };
    let Some(arr) = v
        .get("data")
        .or_else(|| v.get("models"))
        .and_then(Value::as_array)
    else {
        return Vec::new();
    };
    arr.iter()
        .filter_map(|m| {
            m.get("id")
                .or_else(|| m.get("name"))
                .or_else(|| m.get("model"))
                .and_then(Value::as_str)
                .map(str::to_string)
        })
        .collect()
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
