//! Bridge app-server notifications to frontend Tauri events.

use super::protocol::ServerMessage;
use tauri::{AppHandle, Emitter};

/// Spawn a poller. The primary notification receiver is owned by EngineHandle;
/// until multi-subscriber is wired, we emit a heartbeat and expose a generic
/// `codex:rpc-event` channel that commands can also use later.
pub fn spawn_event_bridge(app: AppHandle) {
    tauri::async_runtime::spawn(async move {
        let mut tick = 0u64;
        loop {
            tokio::time::sleep(std::time::Duration::from_secs(2)).await;
            tick += 1;
            // Placeholder heartbeat so frontend listen() wiring can be validated in CI
            // without a live model. Real ServerNotification fan-out is attached in P1
            // once EngineHandle holds the mpsc receiver.
            let _ = app.emit(
                "codex:heartbeat",
                serde_json::json!({ "tick": tick, "ts": chrono::Utc::now().to_rfc3339() }),
            );
        }
    });
}

/// Map a server message into a frontend event name + payload.
pub fn map_server_message(msg: &ServerMessage) -> Option<(String, serde_json::Value)> {
    match msg {
        ServerMessage::Notification { method, params } => {
            let name = format!("codex:{}", method.replace('/', "."));
            Some((name, params.clone().unwrap_or(serde_json::Value::Null)))
        }
        ServerMessage::Request { method, params, id } => {
            // Approvals and user-input requests surface as dedicated events.
            let name = if method.contains("Approval") || method.contains("approval") {
                "codex:approval".to_string()
            } else if method.contains("userInput") || method.contains("user_input") {
                "codex:user-input".to_string()
            } else {
                format!("codex:server-request.{}", method.replace('/', "."))
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
