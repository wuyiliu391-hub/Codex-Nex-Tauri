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
}

impl KernelEvent {
    pub fn new(method: &'static str, params: Value) -> Self {
        Self { method, params }
    }

    /// The Tauri channel this event is delivered on.
    pub fn channel(&self) -> String {
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
pub fn token_usage_updated(
    thread_id: &str,
    turn_id: &str,
    input_tokens: u64,
    output_tokens: u64,
    total_tokens: u64,
) -> KernelEvent {
    KernelEvent::new(
        protocol::notifications::THREAD_TOKEN_USAGE_UPDATED,
        json!({
            "threadId": thread_id,
            "turnId": turn_id,
            "usage": {
                "inputTokens": input_tokens,
                "outputTokens": output_tokens,
                "totalTokens": total_tokens,
            },
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn channels_match_the_frontend_transform() {
        // `frontend/app/bridge/events.ts::tauriEventName` replaces / and . with -.
        assert_eq!(agent_message_delta("t", "u", "i", "x", "commentary").channel(),
                   "codex:item-agentMessage-delta");
        assert_eq!(turn_completed("t", "u", "completed", None).channel(), "codex:turn-completed");
        assert_eq!(token_usage_updated("t", "u", 1, 2, 3).channel(),
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
            token_usage_updated("t", "u", 1, 1, 2).method,
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
}
