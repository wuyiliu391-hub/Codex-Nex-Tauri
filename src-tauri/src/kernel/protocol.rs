//! Protocol constants and wire types for the self-developed kernel.
//!
//! These strings are the frozen contract with the React frontend:
//!  * request method names must match `frontend/src/protocol/requests.ts`
//!  * notification method names must match `frontend/src/protocol/notifications.ts`
//!  * payload field names must match the coercers in
//!    `frontend/app/state/notificationReducer.ts` (which accept both
//!    camelCase and snake_case, but we emit camelCase for consistency).
//!
//! `scripts/verify-protocol-usage.mjs` scans source for protocol-looking string
//! literals and checks them against the generated tables, so every constant
//! here must exist in `frontend/src/protocol/generated/protocol.json`.

/// Client → kernel request methods that this kernel implements.
///
/// Only the subset the frontend actually calls is listed; the rest of the
/// 60-method official surface is intentionally absent until implemented.
pub mod requests {
    // ── handshake ────────────────────────────────────────────────────
    pub const INITIALIZE: &str = "initialize";

    // ── threads ──────────────────────────────────────────────────────
    pub const THREAD_START: &str = "thread/start";
    pub const THREAD_LIST: &str = "thread/list";
    pub const THREAD_READ: &str = "thread/read";
    pub const THREAD_DELETE: &str = "thread/delete";
    pub const THREAD_ARCHIVE: &str = "thread/archive";
    pub const THREAD_UNARCHIVE: &str = "thread/unarchive";

    // ── turns ────────────────────────────────────────────────────────
    pub const TURN_START: &str = "turn/start";
    pub const TURN_INTERRUPT: &str = "turn/interrupt";
}

/// Kernel → client notification methods this kernel emits.
///
/// Every entry must exist in `NOTIFICATION_METHODS`
/// (`frontend/src/protocol/notifications.ts`, 83 entries).
pub mod notifications {
    pub const ERROR: &str = "error";

    // thread lifecycle
    pub const THREAD_STARTED: &str = "thread/started";
    pub const THREAD_STATUS_CHANGED: &str = "thread/status/changed";
    pub const THREAD_ARCHIVED: &str = "thread/archived";
    pub const THREAD_DELETED: &str = "thread/deleted";
    pub const THREAD_UNARCHIVED: &str = "thread/unarchived";
    pub const THREAD_NAME_UPDATED: &str = "thread/name/updated";

    // turn lifecycle
    pub const TURN_STARTED: &str = "turn/started";
    pub const TURN_COMPLETED: &str = "turn/completed";

    // item lifecycle
    pub const ITEM_STARTED: &str = "item/started";
    pub const ITEM_COMPLETED: &str = "item/completed";

    // streaming deltas
    pub const ITEM_AGENT_MESSAGE_DELTA: &str = "item/agentMessage/delta";
    pub const ITEM_REASONING_TEXT_DELTA: &str = "item/reasoning/textDelta";

    // token accounting
    pub const THREAD_TOKEN_USAGE_UPDATED: &str = "thread/tokenUsage/updated";
    // tool/approval flow
    pub const ITEM_COMMAND_EXECUTION_OUTPUT_DELTA: &str = "item/commandExecution/outputDelta";
    pub const SERVER_REQUEST_RESOLVED: &str = "serverRequest/resolved";

    // warnings surfaced in the turn stream
    pub const WARNING: &str = "warning";
}

/// Server → client request methods (approvals / user input).
///
/// Must match `SERVER_REQUEST_METHODS` in
/// `frontend/src/protocol/requests.ts`. The frontend only binds the
/// `codex:approval` and `codex:user-input` channels, so these are the only
/// families that can be answered; see `kernel::events` for the routing rule.
pub mod server_requests {
    pub const EXEC_APPROVAL: &str = "item/commandExecution/requestApproval";
    pub const FILE_CHANGE_APPROVAL: &str = "item/fileChange/requestApproval";
    pub const PERMISSIONS_APPROVAL: &str = "item/permissions/requestApproval";
    pub const USER_INPUT: &str = "item/tool/requestUserInput";
    pub const MCP_ELICITATION: &str = "mcpServer/elicitation/request";
}

/// Item type discriminators. The frontend's `blockTypeOf()` maps these onto
/// block tags, accepting both `camelCase` and `snake_case` spellings.
pub mod item_types {
    pub const USER_MESSAGE: &str = "userMessage";
    pub const AGENT_MESSAGE: &str = "agentMessage";
    pub const REASONING: &str = "reasoning";
    pub const COMMAND_EXECUTION: &str = "commandExecution";
    pub const FILE_CHANGE: &str = "fileChange";
}

/// Turn/thread status strings. Must match `ItemStatus` in
/// `frontend/src/protocol/status.ts`.
pub mod status {
    pub const RUNNING: &str = "running";
    pub const IN_PROGRESS: &str = "inProgress";
    pub const COMPLETED: &str = "completed";
    pub const FAILED: &str = "failed";
    pub const INTERRUPTED: &str = "interrupted";
}

/// Tauri event-channel prefix.
///
/// The frontend (`frontend/app/bridge/events.ts::tauriEventName`) builds
/// `codex:{method with / and . replaced by -}`, so the emitter must apply the
/// exact same transform. Kept here as the single source of truth for that rule.
pub const EVENT_PREFIX: &str = "codex:";

/// Convert a protocol method into its Tauri event channel name.
///
/// `turn/completed`      -> `codex:turn-completed`
/// `item/agentMessage/delta` -> `codex:item-agentMessage-delta`
///
/// Dots and slashes both become `-` because Tauri rejects them in event names.
pub fn event_channel(method: &str) -> String {
    let mut out = String::with_capacity(EVENT_PREFIX.len() + method.len());
    out.push_str(EVENT_PREFIX);
    for ch in method.chars() {
        if ch == '/' || ch == '.' {
            out.push('-');
        } else {
            out.push(ch);
        }
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn event_channel_matches_frontend_transform() {
        assert_eq!(event_channel("turn/completed"), "codex:turn-completed");
        assert_eq!(
            event_channel("item/agentMessage/delta"),
            "codex:item-agentMessage-delta"
        );
        assert_eq!(
            event_channel("thread/tokenUsage/updated"),
            "codex:thread-tokenUsage-updated"
        );
    }

    #[test]
    fn request_constants_are_stable() {
        // These strings are the frozen contract with the frontend; a typo here
        // silently breaks the UI, so assert the exact values.
        assert_eq!(requests::THREAD_START, "thread/start");
        assert_eq!(requests::TURN_START, "turn/start");
        assert_eq!(notifications::ITEM_AGENT_MESSAGE_DELTA, "item/agentMessage/delta");
        assert_eq!(server_requests::EXEC_APPROVAL, "item/commandExecution/requestApproval");
    }
}
