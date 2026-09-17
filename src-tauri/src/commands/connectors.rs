use crate::state::{AppState, Connector};
use tauri::State;

#[tauri::command]
pub fn list_connectors(state: State<'_, AppState>) -> Result<Vec<Connector>, String> {
    Ok(state
        .inner
        .lock()
        .map_err(|e| e.to_string())?
        .connectors
        .clone())
}

#[tauri::command]
pub fn save_connector(state: State<'_, AppState>, connector: Connector) -> Result<(), String> {
    let mut inner = state.inner.lock().map_err(|e| e.to_string())?;
    if let Some(existing) = inner.connectors.iter_mut().find(|c| c.id == connector.id) {
        *existing = connector;
    } else {
        inner.connectors.push(connector);
    }
    drop(inner);
    state.save().map_err(|e| e.to_string())
}

#[tauri::command]
pub fn delete_connector(state: State<'_, AppState>, id: String) -> Result<(), String> {
    let mut inner = state.inner.lock().map_err(|e| e.to_string())?;
    inner.connectors.retain(|c| c.id != id);
    drop(inner);
    state.save().map_err(|e| e.to_string())
}

#[tauri::command]
pub fn test_connector(state: State<'_, AppState>, id: String) -> Result<serde_json::Value, String> {
    let connector = {
        let inner = state.inner.lock().map_err(|e| e.to_string())?;
        inner
            .connectors
            .iter()
            .find(|c| c.id == id)
            .cloned()
            .ok_or_else(|| "connector not found".to_string())?
    };
    // Placeholder probe — port TestConnector logic from Go for each kind.
    Ok(serde_json::json!({
        "ok": true,
        "id": connector.id,
        "kind": connector.kind,
        "detail": "stub probe"
    }))
}
