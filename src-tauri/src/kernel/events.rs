//! Kernel → frontend event emission.
//!
//! Every notification the kernel produces goes through here, so the mapping
//! from protocol method to Tauri channel name lives in exactly one place
//! (`protocol::event_channel`) and stays identical to the frontend's
//! `tauriEventName()`.
//!
//! The channel-name transform is the single most fragile part of the
//! integration: if the two sides disagree, the UI silently receives nothing.
//! `protocol::event_channel` is unit-tested against the frontend's rule, and
//! `emit` is the only function allowed to construct a channel name.

use serde_json::{json, Value};
use tauri::{AppHandle, Emitter};

use super::protocol::{self, event_channel};

/// A kernel-originated event, ready to be emitted.
///
/// Storing `method` + `params` (rather than a channel name) keeps the protocol
/// method authoritative and makes the type trivially testable without a Tauri
/// runtime.
#[derive(Debug, Clone, PartialEq)]
pub struct KernelEvent {
    pub method: &'static str,
    pub params: Value,
    pub custom_channel: Option<String>,
}

impl KernelEvent {
    pub fn new(method: &'static str, params: Value) -> Self {
        Self {
            method,
            params,
            custom_channel: None,
        }
    }

    pub fn with_channel(channel: impl Into<String>, method: &'static str, params: Value) -> Self {
        Self {
            method,
            params,
            custom_channel: Some(channel.into()),
        }
    }

    /// The Tauri channel this event is delivered on.
    pub fn channel(&self) -> String {
        if let Some(ref ch) = self.custom_channel {
            return ch.clone();
        }
        event_channel(self.method)
    }

    /// Emit to the frontend. Failures are logged, never propagated: a missing
    /// window must not abort the kernel's work.
    pub fn emit(&self, app: &AppHandle) {
        let channel = self.channel();
        if let Err(err) = app.emit(&channel, self.params.clone()) {
            tracing::warn!(channel = %channel, error = %err, "kernel event emit failed");
        }
    }

    pub fn tool_approval_request(
        approval_type: String,
        tool_name: String,
        args: serde_json::Value,
        approval_id: String,
    ) -> Self {
        tool_approval_request(None, approval_type, tool_name, args, approval_id)
    }
}

// ── constructors ────────────────────────────────────────────────────────────
//
// Payload field names follow the frontend reducer, which accepts camelCase
// first (see `notificationReducer.ts` `str(params, "threadId", "thread_id")`).
// We emit camelCase only.

/// `thread/started` — a new thread exists.
pub fn thread_started(thread_id: &str, title: &str) -> KernelEvent {
    KernelEvent::new(
        protocol::notifications::THREAD_STARTED,
        json!({ "threadId": thread_id, "title": title }),
    )
}

/// `thread/status/changed` — coarse thread state for the sidebar.
pub fn thread_status_changed(thread_id: &str, status: &str) -> KernelEvent {
    KernelEvent::new(
        protocol::notifications::THREAD_STATUS_CHANGED,
        json!({ "threadId": thread_id, "status": status }),
    )
}

/// `thread/name/updated` — the derived title changed.
pub fn thread_name_updated(thread_id: &str, name: &str) -> KernelEvent {
    KernelEvent::new(
        protocol::notifications::THREAD_NAME_UPDATED,
        json!({ "threadId": thread_id, "name": name }),
    )
}

pub fn thread_archived(thread_id: &str) -> KernelEvent {
    KernelEvent::new(
        protocol::notifications::THREAD_ARCHIVED,
        json!({ "threadId": thread_id }),
    )
}

pub fn thread_unarchived(thread_id: &str) -> KernelEvent {
    KernelEvent::new(
        protocol::notifications::THREAD_UNARCHIVED,
        json!({ "threadId": thread_id }),
    )
}

pub fn thread_deleted(thread_id: &str) -> KernelEvent {
    KernelEvent::new(
        protocol::notifications::THREAD_DELETED,
        json!({ "threadId": thread_id }),
    )
}

/// `turn/started` — the turn is now running.
pub fn turn_started(thread_id: &str, turn_id: &str) -> KernelEvent {
    KernelEvent::new(
        protocol::notifications::TURN_STARTED,
        json!({ "threadId": thread_id, "turnId": turn_id }),
    )
}

/// `turn/completed` — terminal. `error` is only present on failure.
pub fn turn_completed(thread_id: &str, turn_id: &str, status: &str, error: Option<&str>) -> KernelEvent {
    let mut params = json!({
        "threadId": thread_id,
        "turnId": turn_id,
        "status": status,
    });
    if let Some(err) = error {
        params["error"] = json!(err);
    }
    KernelEvent::new(protocol::notifications::TURN_COMPLETED, params)
}

/// `item/started` — an item (user message, agent message, tool call) opened.
pub fn item_started(thread_id: &str, turn_id: &str, item_id: &str, item_type: &str) -> KernelEvent {
    KernelEvent::new(
        protocol::notifications::ITEM_STARTED,
        json!({
            "threadId": thread_id,
            "turnId": turn_id,
            "item": { "id": item_id, "itemType": item_type, "status": protocol::status::IN_PROGRESS },
        }),
    )
}

/// `item/completed` — the item is final, with its full text.
pub fn item_completed(
    thread_id: &str,
    turn_id: &str,
    item_id: &str,
    item_type: &str,
    text: &str,
) -> KernelEvent {
    KernelEvent::new(
        protocol::notifications::ITEM_COMPLETED,
        json!({
            "threadId": thread_id,
            "turnId": turn_id,
            "item": {
                "id": item_id,
                "itemType": item_type,
                "status": protocol::status::COMPLETED,
                "text": text,
            },
        }),
    )
}

/// `item/agentMessage/delta` — one streaming piece of the answer.
///
/// `phase` is `commentary` while streaming and `final_answer` once the turn is
/// closing, matching what the reducer expects from `phaseOf()`.
pub fn agent_message_delta(
    thread_id: &str,
    turn_id: &str,
    item_id: &str,
    delta: &str,
    phase: &str,
) -> KernelEvent {
    KernelEvent::new(
        protocol::notifications::ITEM_AGENT_MESSAGE_DELTA,
        json!({
            "threadId": thread_id,
            "turnId": turn_id,
            "itemId": item_id,
            "delta": delta,
            "phase": phase,
        }),
    )
}

/// `item/reasoning/textDelta` — one streaming piece of reasoning output.
pub fn reasoning_delta(thread_id: &str, turn_id: &str, item_id: &str, delta: &str) -> KernelEvent {
    KernelEvent::new(
        protocol::notifications::ITEM_REASONING_TEXT_DELTA,
        json!({
            "threadId": thread_id,
            "turnId": turn_id,
            "itemId": item_id,
            "delta": delta,
        }),
    )
}

/// `thread/tokenUsage/updated` — approximate accounting for this turn.
///
/// Field names are a **compatibility contract** with `tokenUsageOf`
/// (`notificationReducer.ts:116-126`), which reads `inputTokens`,
/// `cachedInputTokens`, `outputTokens`, `reasoningOutputTokens`, `totalTokens`
/// and `modelContextWindow`. The last three were never sent, so the
/// context-usage badge in `Composer.tsx:955-973` could not render (it requires
/// `modelContextWindow > 0`) and the cache/reasoning counters were always
/// blank. Each optional counter is omitted when the provider did not report it,
/// which the reducer reads as "unknown".
#[allow(clippy::too_many_arguments)]
pub fn token_usage_updated(
    thread_id: &str,
    turn_id: &str,
    input_tokens: u64,
    output_tokens: u64,
    total_tokens: u64,
    cached_input_tokens: Option<u64>,
    reasoning_output_tokens: Option<u64>,
    model_context_window: Option<u64>,
) -> KernelEvent {
    let mut usage = serde_json::Map::new();
    usage.insert("inputTokens".into(), json!(input_tokens));
    usage.insert("outputTokens".into(), json!(output_tokens));
    usage.insert("totalTokens".into(), json!(total_tokens));
    // Skip rather than send `null`, so an absent counter is distinguishable from
    // a genuine zero. `modelContextWindow` in particular gates the UI badge.
    for (key, value) in [
        ("cachedInputTokens", cached_input_tokens),
        ("reasoningOutputTokens", reasoning_output_tokens),
        ("modelContextWindow", model_context_window),
    ] {
        if let Some(n) = value {
            usage.insert(key.into(), json!(n));
        }
    }
    KernelEvent::new(
        protocol::notifications::THREAD_TOKEN_USAGE_UPDATED,
        json!({
            "threadId": thread_id,
            "turnId": turn_id,
            "usage": Value::Object(usage),
        }),
    )
}

/// `warning` — a non-fatal, user-visible notice.
pub fn warning(thread_id: &str, message: &str) -> KernelEvent {
    KernelEvent::new(
        protocol::notifications::WARNING,
        json!({ "threadId": thread_id, "message": message }),
    )
}

/// `error` — a fatal or turn-level error.
pub fn error(thread_id: Option<&str>, message: &str) -> KernelEvent {
    let mut params = json!({ "message": message });
    if let Some(id) = thread_id {
        params["threadId"] = json!(id);
    }
    KernelEvent::new(protocol::notifications::ERROR, params)
}

// ── tool/approval flow constructors ────────────────────────────────────────
// For self-developed kernel features. These map to protocol methods:
// - item/commandExecution/requestApproval (channel: codex:approval)
// - item/fileChange/requestApproval (channel: codex:approval)
// - item/commandExecution/outputDelta
// - serverRequest/resolved (note: this is a response notification)

pub fn tool_approval_request(
    thread_id: Option<&str>,
    approval_type: String, // "commandExecution", "fileChange", etc.
    tool_name: String,
    args: serde_json::Value,
    approval_id: String,
) -> KernelEvent {
    let method = match approval_type.as_str() {
        "fileChange" => "item/fileChange/requestApproval",
        _ => "item/commandExecution/requestApproval",
    };

    let mut inner = serde_json::Map::new();
    if let Some(tid) = thread_id {
        inner.insert("threadId".into(), json!(tid));
    }
    inner.insert("approvalId".into(), json!(approval_id.clone()));
    inner.insert("toolName".into(), json!(tool_name));
    inner.insert("arguments".into(), args.clone());

    if let Some(cmd) = args.get("command").or_else(|| args.get("cmd")).and_then(Value::as_str) {
        inner.insert("command".into(), json!(cmd));
    } else if tool_name == "shell_exec" {
        if let Some(cmd) = args.get("command").and_then(Value::as_str) {
            inner.insert("command".into(), json!(cmd));
        }
    }

    if let Some(cwd) = args.get("cwd").and_then(Value::as_str) {
        inner.insert("cwd".into(), json!(cwd));
    }

    if let Some(changes) = args.get("changes") {
        inner.insert("changes".into(), changes.clone());
    } else if tool_name == "fs_write" {
        if let Some(path) = args.get("path").and_then(Value::as_str) {
            inner.insert("changes".into(), json!([path]));
            inner.insert("path".into(), json!(path));
        }
    }

    inner.insert(
        "availableDecisions".into(),
        json!(["accept", "acceptForSession", "decline", "cancel"]),
    );

    let payload = json!({
        "id": approval_id,
        "method": method,
        "params": Value::Object(inner),
    });

    KernelEvent::with_channel("codex:approval", method, payload)
}

pub fn command_execution_output_delta(
    thread_id: &str,
    turn_id: &str,
    item_id: &str,
    delta: &str,
) -> KernelEvent {
    KernelEvent::new(
        protocol::notifications::ITEM_COMMAND_EXECUTION_OUTPUT_DELTA,
        json!({
            "threadId": thread_id,
            "turnId": turn_id,
            "itemId": item_id,
            "delta": delta,
        }),
    )
}

pub fn server_request_resolved(
    thread_id: &str,
    approval_id: &str,
    approved: bool,
    result: Option<String>,
) -> KernelEvent {
    KernelEvent::new(
        protocol::notifications::SERVER_REQUEST_RESOLVED,
        json!({
            "threadId": thread_id,
            "requestId": approval_id,
            "approvalId": approval_id,
            "approved": approved,
            "result": result,
        }),
    )
}

#[cfg(test)]

mod tests {
    use super::*;

    #[test]
    fn channels_match_the_frontend_transform() {
        // `frontend/app/bridge/events.ts::tauriEventName` replaces / and . with -.
        assert_eq!(agent_message_delta("t", "u", "i", "x", "commentary").channel(),
                   "codex:item-agentMessage-delta");
        assert_eq!(turn_completed("t", "u", "completed", None).channel(), "codex:turn-completed");
        assert_eq!(token_usage_updated("t", "u", 1, 2, 3, None, None, None).channel(),
                   "codex:thread-tokenUsage-updated");
    }

    #[test]
    fn every_emitted_method_is_in_the_frontend_table() {
        // Guard against inventing a method the reducer cannot recognise: the
        // frontend would record a "No handler" warning instead of rendering.
        let emitted = [
            thread_started("t", "x").method,
            thread_status_changed("t", "running").method,
            thread_name_updated("t", "x").method,
            thread_archived("t").method,
            thread_unarchived("t").method,
            thread_deleted("t").method,
            turn_started("t", "u").method,
            turn_completed("t", "u", "completed", None).method,
            item_started("t", "u", "i", "agentMessage").method,
            item_completed("t", "u", "i", "agentMessage", "x").method,
            agent_message_delta("t", "u", "i", "x", "commentary").method,
            reasoning_delta("t", "u", "i", "x").method,
            token_usage_updated("t", "u", 1, 1, 2, None, None, None).method,
            warning("t", "x").method,
            error(None, "x").method,
        ];
        // The same list, sourced from the generated frontend table by the
        // verifier script; here we assert the exact strings so a rename is caught.
        let expected = [
            "thread/started",
            "thread/status/changed",
            "thread/name/updated",
            "thread/archived",
            "thread/unarchived",
            "thread/deleted",
            "turn/started",
            "turn/completed",
            "item/started",
            "item/completed",
            "item/agentMessage/delta",
            "item/reasoning/textDelta",
            "thread/tokenUsage/updated",
            "warning",
            "error",
        ];
        assert_eq!(emitted, expected);
    }

    #[test]
    fn turn_completed_omits_error_when_absent() {
        let ev = turn_completed("t", "u", "completed", None);
        assert!(ev.params.get("error").is_none());
        let ev = turn_completed("t", "u", "failed", Some("boom"));
        assert_eq!(ev.params["error"], "boom");
    }

    #[test]
    fn delta_payload_shape_matches_reducer_expectations() {
        // The reducer reads `itemId` and `delta` (see notificationReducer.ts).
        let ev = agent_message_delta("th", "tu", "item-1", "hi", "commentary");
        assert_eq!(ev.params["itemId"], "item-1");
        assert_eq!(ev.params["delta"], "hi");
        assert_eq!(ev.params["threadId"], "th");
        assert_eq!(ev.params["turnId"], "tu");
    }

    #[test]
    fn token_usage_omits_counters_the_provider_did_not_report() {
        // The context badge renders only when `modelContextWindow` is present
        // and positive, so an absent counter must not be sent as `null` or `0`.
        let bare = token_usage_updated("t", "u", 10, 5, 15, None, None, None);
        let usage = &bare.params["usage"];
        assert_eq!(usage["inputTokens"], 10);
        assert_eq!(usage["outputTokens"], 5);
        assert_eq!(usage["totalTokens"], 15);
        assert!(usage.get("modelContextWindow").is_none());
        assert!(usage.get("cachedInputTokens").is_none());
        assert!(usage.get("reasoningOutputTokens").is_none());

        let full = token_usage_updated("t", "u", 10, 5, 15, Some(4), Some(2), Some(128_000));
        let usage = &full.params["usage"];
        assert_eq!(usage["cachedInputTokens"], 4);
        assert_eq!(usage["reasoningOutputTokens"], 2);
        assert_eq!(usage["modelContextWindow"], 128_000);
    }

    #[test]
    fn a_reported_zero_counter_is_kept() {
        // Zero is a real measurement and must survive; only absence is skipped.
        let ev = token_usage_updated("t", "u", 1, 1, 2, Some(0), Some(0), Some(0));
        assert_eq!(ev.params["usage"]["cachedInputTokens"], 0);
        assert_eq!(ev.params["usage"]["modelContextWindow"], 0);
    }

    #[test]
    fn tool_approval_request_matches_frontend_contract() {
        let ev = tool_approval_request(
            Some("t1"),
            "commandExecution".into(),
            "shell_exec".into(),
            json!({ "command": "cargo test" }),
            "appr-1".into(),
        );
        assert_eq!(ev.channel(), "codex:approval");
        assert_eq!(ev.params["id"], "appr-1");
        assert_eq!(ev.params["method"], "item/commandExecution/requestApproval");
        assert_eq!(ev.params["params"]["approvalId"], "appr-1");
        assert_eq!(ev.params["params"]["toolName"], "shell_exec");
        assert_eq!(ev.params["params"]["command"], "cargo test");
        assert!(ev.params["params"]["availableDecisions"].is_array());
    }
}
