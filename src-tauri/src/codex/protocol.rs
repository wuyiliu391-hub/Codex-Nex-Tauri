//! JSON-RPC method names used against codex-app-server.
//! Keep in sync with official app-server-protocol v0.154.0.

pub const INITIALIZE: &str = "initialize";

// threads
pub const THREAD_START: &str = "thread/start";
pub const THREAD_LIST: &str = "thread/list";
pub const THREAD_READ: &str = "thread/read";
pub const THREAD_DELETE: &str = "thread/delete";
pub const THREAD_ARCHIVE: &str = "thread/archive";
pub const THREAD_UNARCHIVE: &str = "thread/unarchive";
pub const THREAD_RESUME: &str = "thread/resume";

// turns
pub const TURN_START: &str = "turn/start";
pub const TURN_INTERRUPT: &str = "turn/interrupt";
pub const TURN_STEER: &str = "turn/steer";

// approvals
pub const APPROVAL_RESPOND: &str = "approval/respond";
pub const EXEC_COMMAND_APPROVAL_RESPOND: &str = "execCommandApproval/respond";
pub const APPLY_PATCH_APPROVAL_RESPOND: &str = "applyPatchApproval/respond";

// config / models
pub const CONFIG_GET: &str = "config/get";
pub const CONFIG_UPDATE: &str = "config/update";
pub const MODEL_LIST: &str = "model/list";
pub const PROVIDER_LIST: &str = "modelProvider/list";

// mcp / skills / plugins
pub const MCP_LIST_SERVERS: &str = "mcp/listServers";
pub const MCP_SET_SERVER_ENABLED: &str = "mcp/setServerEnabled";
pub const SKILLS_LIST: &str = "skills/list";
pub const PLUGINS_LIST: &str = "plugin/list";

// shell / exec
pub const COMMAND_EXEC_START: &str = "command/exec";
pub const SHELL_OPEN: &str = "shell/open";
pub const SHELL_WRITE: &str = "shell/write";

// git / fs / tools
pub const GIT_STATUS: &str = "git/status";
pub const FS_LIST: &str = "fs/list";
pub const TOOLS_LIST: &str = "tools/list";

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct RpcRequest {
    pub id: String,
    pub method: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub params: Option<serde_json::Value>,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct RpcResponse {
    pub id: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub result: Option<serde_json::Value>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub error: Option<RpcError>,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct RpcError {
    pub code: i64,
    pub message: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub data: Option<serde_json::Value>,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[serde(untagged)]
pub enum ServerMessage {
    Response(RpcResponse),
    Notification {
        method: String,
        #[serde(default)]
        params: Option<serde_json::Value>,
    },
    Request {
        id: serde_json::Value,
        method: String,
        #[serde(default)]
        params: Option<serde_json::Value>,
    },
}
