//! Local scheduled tasks and pull requests store.
//!
//! The official app-server has no scheduler API, so the desktop shell owns
//! this state (persisted in shell-state.json). bridge.js calls these commands
//! first and falls back to localStorage only when they are missing.

use crate::state::{AppState, ScheduledTask};
use serde_json::{json, Value};
use tauri::State;

#[tauri::command]
pub fn list_scheduled_tasks(
    state: State<'_, AppState>,
) -> Result<Vec<ScheduledTask>, String> {
    Ok(state
        .inner
        .lock()
        .map_err(|e| e.to_string())?
        .scheduled_tasks
        .clone())
}

#[tauri::command]
pub fn save_scheduled_tasks(
    state: State<'_, AppState>,
    tasks: Vec<ScheduledTask>,
) -> Result<(), String> {
    let mut inner = state.inner.lock().map_err(|e| e.to_string())?;
    inner.scheduled_tasks = tasks;
    drop(inner);
    state.save().map_err(|e| e.to_string())
}

#[tauri::command]
pub fn run_scheduled_task(
    state: State<'_, AppState>,
    id: String,
) -> Result<Value, String> {
    let found = {
        let inner = state.inner.lock().map_err(|e| e.to_string())?;
        inner
            .scheduled_tasks
            .iter()
            .find(|t| t.id == id)
            .cloned()
    };
    match found {
        Some(t) => Ok(json!({
            "ok": true,
            "id": t.id,
            "title": t.title,
            "note": "engine has no scheduler API; the run is handled locally",
        })),
        None => Err(format!("scheduled task not found: {id}")),
    }
}

#[tauri::command]
pub fn list_pull_requests(state: State<'_, AppState>) -> Result<Vec<Value>, String> {
    Ok(state
        .inner
        .lock()
        .map_err(|e| e.to_string())?
        .pull_requests
        .clone())
}

#[tauri::command]
pub fn save_pull_requests(
    state: State<'_, AppState>,
    prs: Vec<Value>,
) -> Result<(), String> {
    let mut inner = state.inner.lock().map_err(|e| e.to_string())?;
    inner.pull_requests = prs;
    drop(inner);
    state.save().map_err(|e| e.to_string())
}
