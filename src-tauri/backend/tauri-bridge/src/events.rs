//! Event emission wrappers for Tauri commands.

use serde::Serialize;
use std::sync::Arc;
use tauri::{Emitter, Manager};
use tokio::sync::broadcast;

/// Backend event that can be emitted to frontend
#[derive(Debug, Clone, Serialize)]
pub enum BackendEventPayload {
    TurnStarted { turn_id: String },
    TurnCompleted { turn_id: String },
    ErrorOccurred { error: String },
    MessageReceived { thread_id: String, text: String },
}

impl BackendEventPayload {
    /// Emit this event through Tauri event system
    pub fn emit<T: Manager>(&self, app: &T) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
        let event_name = match self {
            BackendEventPayload::TurnStarted { .. } => "turn-started",
            BackendEventPayload::TurnCompleted { .. } => "turn-completed",
            BackendEventPayload::ErrorOccurred { .. } => "error-occurred",
            BackendEventPayload::MessageReceived { .. } => "message-received",
        };

        app.emit(event_name, self)?;
        Ok(())
    }
}

/// Forwarder task for broadcasting backend events to frontend
pub async fn start_event_forwarder(
    app: tauri::AppHandle,
    mut rx: broadcast::Receiver<crate::event_sink::BackendEvent>,
) {
    tauri::async_runtime::spawn(async move {
        while let Ok(event) = rx.recv().await {
            // Convert internal BackendEvent to frontend-compatible payload
            let payload = match event {
                crate::event_sink::BackendEvent::TurnStarted { turn_id } => {
                    BackendEventPayload::TurnStarted { turn_id }
                }
                crate::event_sink::BackendEvent::TurnCompleted { turn_id } => {
                    BackendEventPayload::TurnCompleted { turn_id }
                }
                crate::event_sink::BackendEvent::ErrorOccurred { error } => {
                    BackendEventPayload::ErrorOccurred { error }
                }
                crate::event_sink::BackendEvent::MessageReceived { thread_id, text } => {
                    BackendEventPayload::MessageReceived { thread_id, text }
                }
            };

            if let Err(e) = payload.emit(&app) {
                tracing::warn!("Failed to emit event: {:?}", e);
            }
        }
    });
}
