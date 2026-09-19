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

/// `test_connector` — connectivity probe for one stored connector.
///
/// This used to answer `{ ok: true, detail: "stub probe" }` unconditionally, so
/// the UI reported a successful probe for a connector that had never been
/// contacted. Nothing here implements an SSH/SFTP transport, so the honest
/// answer is a failure that names the reason. The call site
/// (`ConnectionsTab.tsx:77-82`) branches on `ok === false` and shows `detail`,
/// which is exactly this shape.
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

    // A connector that is switched off cannot be probed either; say which of the
    // two situations this is rather than reporting a generic failure.
    let enabled = connector
        .config
        .get("enabled")
        .and_then(serde_json::Value::as_bool)
        .unwrap_or(true);

    Ok(serde_json::json!({
        "ok": false,
        "id": connector.id,
        "kind": connector.kind,
        "status": "not-wired",
        "detail": if enabled {
            "the kernel has no SSH/SFTP transport yet, so this connector cannot be probed"
        } else {
            "this connector is disabled"
        },
    }))
}
