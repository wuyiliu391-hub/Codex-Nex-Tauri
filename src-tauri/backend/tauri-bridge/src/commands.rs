//! Real Tauri command implementations for agent loop integration.

use serde::{Deserialize, Serialize};
use tauri::State;

/// Information about a session/thread
#[derive(Debug, Clone, Serialize)]
pub struct SessionInfo {
    pub id: String,
    pub title: String,
    pub updated_at: u64,
}

/// Engine status information
#[derive(Debug, Clone, Serialize)]
pub struct EngineStatus {
    pub connected: bool,
    pub version: String,
}

/// Begin a new turn in the specified thread
#[tauri::command]
pub async fn begin_turn(
    State(handle): State<crate::AgentLoopHandle>,
    thread_id: String,
) -> Result<String, String> {
    handle
        .begin_turn(thread_id)
        .await
        .map_err(|e| format!("Failed to begin turn: {:?}", e))?;
    
    // TODO: Return actual turn_id from agent loop state
    Ok(format!("turn-{}", chrono::Utc::now().timestamp_millis()))
}

/// Submit a message to the current turn
#[tauri::command]
pub async fn submit_message(
    State(handle): State<crate::AgentLoopHandle>,
    thread_id: String,
    text: String,
) -> Result<(), String> {
    handle
        .send_message(thread_id, text)
        .await
        .map_err(|e| format!("Failed to send message: {:?}", e))?;
    
    Ok(())
}

/// Interrupt the current turn in the specified thread
#[tauri::command]
pub async fn interrupt_turn(
    State(handle): State<crate::AgentLoopHandle>,
    thread_id: String,
) -> Result<(), String> {
    handle
        .interrupt_turn(thread_id)
        .await
        .map_err(|e| format!("Failed to interrupt turn: {:?}", e))?;
    
    Ok(())
}

/// List all active sessions/threads
#[tauri::command]
pub async fn list_sessions() -> Result<Vec<SessionInfo>, String> {
    // Stub implementation - return empty list for now
    // TODO: Query turn manager for active turns
    Ok(vec![])
}

/// Get the current engine (sidecar) status
#[tauri::command]
pub async fn get_engine_status() -> Result<EngineStatus, String> {
    // Stub implementation - always report disconnected for Phase 2
    // TODO: Check actual WebSocket connection state
    Ok(EngineStatus {
        connected: false,
        version: "v0.154.0".to_string(),
    })
}
