//! Bridge app-server notifications to frontend Tauri events.
//!
//! EngineHandle holds a stable `broadcast::Sender<ServerMessage>`. This module
//! subscribes once at startup and emits `codex:*` events that bridge.js maps
//! to `agent:*` CustomEvents.

use super::protocol::ServerMessage;
use super::EngineHandle;
use tauri::{AppHandle, Emitter, Manager};

/// Spawn the notification fan-out task.
pub fn spawn_event_bridge(app: AppHandle) {
    tauri::async_runtime::spawn(async move {
        // Small delay so setup() finishes managing EngineHandle.
        tokio::time::sleep(std::time::Duration::from_millis(50)).await;

        let Some(engine) = app.try_state::<EngineHandle>() else {
            tracing::warn!("EngineHandle not managed; event bridge idle");
            return;
        };
        let mut rx = engine.subscribe();
        tracing::info!("codex event bridge subscribed to engine notifications");

        loop {
            match rx.recv().await {
                Ok(msg) => {
                    if let Some((name, payload)) = map_server_message(&msg) {
                        if let Err(e) = app.emit(&name, payload) {
                            tracing::debug!(event=%name, error=%e, "emit failed");
                        }
                    }
                }
                Err(tokio::sync::broadcast::error::RecvError::Lagged(n)) => {
                    tracing::warn!(skipped = n, "event bridge lagged; dropped notifications");
                }
                Err(tokio::sync::broadcast::error::RecvError::Closed) => {
                    tracing::info!("engine event channel closed; event bridge exiting");
                    break;
                }
            }
        }
    });
}

/// Map a server message into a frontend event name + payload.
///
/// Naming: `codex:{method with / replaced by -}` so
/// `turn/completed` → `codex:turn-completed`.
/// (`-` because Tauri plugin:event names reject dots; bridge.js sanitizes
/// legacy dotted aliases to the same channels.)
pub fn map_server_message(msg: &ServerMessage) -> Option<(String, serde_json::Value)> {
    match msg {
        ServerMessage::Notification { method, params } => {
            let sanitized = method.replace(['/', '.'], "-");
            let name = format!("codex:{}", sanitized);
            Some((name, params.clone().unwrap_or(serde_json::Value::Null)))
        }
        ServerMessage::Request { method, params, id } => {
            // Approvals and user-input requests surface as dedicated events.
            let name = if method.contains("Approval") || method.contains("approval") {
                "codex:approval".to_string()
            } else if method.contains("userInput") || method.contains("requestUserInput") {
                "codex:user-input".to_string()
            } else if method.contains("elicitation") {
                "codex:user-input".to_string()
            } else {
                let sanitized = method.replace(['/', '.'], "-");
                format!("codex:server-request-{}", sanitized)
            };
            Some((
                name,
                serde_json::json!({
                    "id": id,
                    "method": method,
                    "params": params,
                }),
            ))
        }
        ServerMessage::Response(_) => None,
    }
}
