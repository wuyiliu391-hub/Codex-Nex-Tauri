//! JSON-RPC method names used against codex-app-server.
//! Keep in sync with official app-server-protocol v0.154.0
//! (`app-server-protocol/src/protocol/common.rs`).

// ─── handshake ───────────────────────────────────────────────────────────────
pub const INITIALIZE: &str = "initialize";
/// Client → server notification after a successful `initialize` response.
/// Serializes as `{"method":"initialized"}` with no `params` field.
pub const INITIALIZED: &str = "initialized";

// ─── threads ─────────────────────────────────────────────────────────────────
pub const THREAD_START: &str = "thread/start";
pub const THREAD_LIST: &str = "thread/list";
pub const THREAD_READ: &str = "thread/read";
pub const THREAD_RESUME: &str = "thread/resume";
pub const THREAD_FORK: &str = "thread/fork";
pub const THREAD_DELETE: &str = "thread/delete";
pub const THREAD_ARCHIVE: &str = "thread/archive";
pub const THREAD_UNARCHIVE: &str = "thread/unarchive";
pub const THREAD_TIMELINE_LIST: &str = "thread/timeline/list";
pub const THREAD_COMPACT_START: &str = "thread/compact/start";
pub const THREAD_NAME_SET: &str = "thread/name/set";
pub const THREAD_TURNS_LIST: &str = "thread/turns/list";
pub const THREAD_ITEMS_LIST: &str = "thread/items/list";
pub const THREAD_LOADED_LIST: &str = "thread/loaded/list";

// ─── turns ───────────────────────────────────────────────────────────────────
pub const TURN_START: &str = "turn/start";
pub const TURN_INTERRUPT: &str = "turn/interrupt";
pub const TURN_STEER: &str = "turn/steer";

// ─── server→client requests (approvals) ─────────────────────────────────────
// There is NO `approval/respond` client method. The client answers the
// *server request id* with a JSON-RPC result (see EngineHandle::respond).
pub const SERVER_REQ_EXEC_APPROVAL: &str = "item/commandExecution/requestApproval";
pub const SERVER_REQ_FILE_CHANGE_APPROVAL: &str = "item/fileChange/requestApproval";
pub const SERVER_REQ_PERMISSIONS_APPROVAL: &str = "item/permissions/requestApproval";
pub const SERVER_REQ_USER_INPUT: &str = "item/tool/requestUserInput";
pub const SERVER_REQ_MCP_ELICITATION: &str = "mcpServer/elicitation/request";
// Legacy v1 (only for turns started via deprecated sendUserTurn / sendUserMessage)
pub const SERVER_REQ_LEGACY_EXEC_APPROVAL: &str = "execCommandApproval";
pub const SERVER_REQ_LEGACY_APPLY_PATCH_APPROVAL: &str = "applyPatchApproval";

// ─── config / models / account ──────────────────────────────────────────────
// Official names: config/read, config/value/write, config/batchWrite
// (NOT config/get or config/update).
pub const CONFIG_READ: &str = "config/read";
pub const CONFIG_VALUE_WRITE: &str = "config/value/write";
pub const CONFIG_BATCH_WRITE: &str = "config/batchWrite";
pub const CONFIG_REQUIREMENTS_READ: &str = "configRequirements/read";
pub const MODEL_LIST: &str = "model/list";
pub const MODEL_PROVIDER_CAPABILITIES_READ: &str = "modelProvider/capabilities/read";
pub const ACCOUNT_READ: &str = "account/read";
/// Deprecated alias kept by app-server; prefer ACCOUNT_READ.
pub const GET_AUTH_STATUS: &str = "getAuthStatus";

// ─── mcp / skills / plugins / hooks ─────────────────────────────────────────
// Official: mcpServerStatus/list, config/mcpServer/reload
// (NOT mcp/listServers or mcp/setServerEnabled).
pub const MCP_SERVER_STATUS_LIST: &str = "mcpServerStatus/list";
pub const MCP_SERVER_REFRESH: &str = "config/mcpServer/reload";
pub const MCP_SERVER_OAUTH_LOGIN: &str = "mcpServer/oauth/login";
pub const MCP_SERVER_TOOL_CALL: &str = "mcpServer/tool/call";
pub const MCP_SERVER_RESOURCE_READ: &str = "mcpServer/resource/read";

pub const SKILLS_LIST: &str = "skills/list";
pub const SKILLS_CONFIG_WRITE: &str = "skills/config/write";

// Official: plugin/list, plugin/install, plugin/uninstall (no setEnabled).
pub const PLUGINS_LIST: &str = "plugin/list";
pub const PLUGIN_INSTALL: &str = "plugin/install";
pub const PLUGIN_UNINSTALL: &str = "plugin/uninstall";
pub const PLUGIN_READ: &str = "plugin/read";
pub const PLUGIN_SEARCH: &str = "plugin/search";

pub const HOOKS_LIST: &str = "hooks/list";

// ─── shell / exec (official: command/exec, not shell/open) ──────────────────
pub const COMMAND_EXEC: &str = "command/exec";
pub const COMMAND_EXEC_WRITE: &str = "command/exec/write";
pub const COMMAND_EXEC_TERMINATE: &str = "command/exec/terminate";
pub const COMMAND_EXEC_RESIZE: &str = "command/exec/resize";
pub const THREAD_SHELL_COMMAND: &str = "thread/shellCommand";

// ─── fs / misc ──────────────────────────────────────────────────────────────
pub const FS_READ_DIRECTORY: &str = "fs/readDirectory";
pub const FS_READ_FILE: &str = "fs/readFile";
pub const FS_WRITE_FILE: &str = "fs/writeFile";
pub const FUZZY_FILE_SEARCH: &str = "fuzzyFileSearch";
pub const FEEDBACK_UPLOAD: &str = "feedback/upload";
pub const SERVER_DIAGNOSTICS: &str = "server/diagnostics";

// ─── projects (experimental) ────────────────────────────────────────────────
pub const PROJECT_LIST: &str = "project/list";
pub const PROJECT_READ: &str = "project/read";
pub const PROJECT_CREATE: &str = "project/create";

/// Client identity reported during initialize. Must be a valid HTTP header
/// value (app-server validates this).
pub const CLIENT_NAME: &str = "codex-desktop-tauri";
pub const CLIENT_TITLE: &str = "Codex Desktop (Tauri)";

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct RpcRequest {
    pub id: String,
    pub method: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub params: Option<serde_json::Value>,
}

/// Response envelope. `id` is a raw JSON value so both string UUIDs and
/// integer ids from official app-server deserialize correctly.
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct RpcResponse {
    pub id: serde_json::Value,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub result: Option<serde_json::Value>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub error: Option<RpcError>,
}

/// JSON-RPC response sent *to the server* to resolve a ServerRequest
/// (approvals, user input, elicitation). Official protocol does not include
/// a `jsonrpc` field.
#[derive(Debug, Clone, serde::Serialize)]
pub struct RpcResultMessage {
    pub id: serde_json::Value,
    pub result: serde_json::Value,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct RpcError {
    pub code: i64,
    pub message: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub data: Option<serde_json::Value>,
}

/// Inbound wire message. Parsed via [`parse_server_message`] rather than
/// `#[serde(untagged)]` because Notification/Request/Response all overlap
/// on optional fields (`method`+`params` vs `id`+`result`).
#[derive(Debug, Clone, serde::Serialize)]
pub enum ServerMessage {
    Response(RpcResponse),
    Notification {
        method: String,
        #[serde(skip_serializing_if = "Option::is_none")]
        params: Option<serde_json::Value>,
    },
    Request {
        id: serde_json::Value,
        method: String,
        #[serde(skip_serializing_if = "Option::is_none")]
        params: Option<serde_json::Value>,
    },
}

/// Parse a JSON-RPC frame from app-server into a typed message.
///
/// Shape rules (official does not send a `jsonrpc` field):
/// - `{ id, result | error }`          → Response
/// - `{ id, method, params? }`         → Request (server→client, e.g. approvals)
/// - `{ method, params? }`             → Notification
pub fn parse_server_message(text: &str) -> Option<ServerMessage> {
    let value: serde_json::Value = serde_json::from_str(text).ok()?;
    let obj = value.as_object()?;

    let has_method = obj.contains_key("method");
    let has_id = obj.contains_key("id");
    let has_result = obj.contains_key("result");
    let has_error = obj.contains_key("error");

    if has_method && has_id {
        return Some(ServerMessage::Request {
            id: obj.get("id").cloned().unwrap_or(serde_json::Value::Null),
            method: obj.get("method")?.as_str()?.to_string(),
            params: obj.get("params").cloned(),
        });
    }
    if has_method {
        return Some(ServerMessage::Notification {
            method: obj.get("method")?.as_str()?.to_string(),
            params: obj.get("params").cloned(),
        });
    }
    if has_id && (has_result || has_error) {
        let resp = RpcResponse {
            id: obj.get("id").cloned().unwrap_or(serde_json::Value::Null),
            result: obj.get("result").cloned(),
            error: obj
                .get("error")
                .cloned()
                .and_then(|e| serde_json::from_value(e).ok()),
        };
        return Some(ServerMessage::Response(resp));
    }
    None
}

/// Normalize a JSON-RPC id to the string key used in the pending map.
pub fn rpc_id_key(id: &serde_json::Value) -> String {
    match id {
        serde_json::Value::String(s) => s.clone(),
        other => other.to_string(),
    }
}
