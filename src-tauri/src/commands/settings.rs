use crate::state::{AppState, Preferences, Settings, Shortcut};
use tauri::State;

fn save_ok(state: &State<'_, AppState>) -> Result<(), String> {
    state.save().map_err(|e| e.to_string())
}

#[tauri::command]
pub fn get_settings(state: State<'_, AppState>) -> Result<Settings, String> {
    Ok(state.inner.lock().map_err(|e| e.to_string())?.settings.clone())
}

#[tauri::command]
pub fn save_settings(state: State<'_, AppState>, settings: Settings) -> Result<(), String> {
    state.inner.lock().map_err(|e| e.to_string())?.settings = settings;
    save_ok(&state)
}

#[tauri::command]
pub fn get_preferences(state: State<'_, AppState>) -> Result<Preferences, String> {
    Ok(state.inner.lock().map_err(|e| e.to_string())?.preferences.clone())
}

#[tauri::command]
pub fn save_preferences(state: State<'_, AppState>, preferences: Preferences) -> Result<(), String> {
    state.inner.lock().map_err(|e| e.to_string())?.preferences = preferences;
    save_ok(&state)
}

#[tauri::command]
pub fn list_shortcuts(state: State<'_, AppState>) -> Result<Vec<Shortcut>, String> {
    Ok(state.inner.lock().map_err(|e| e.to_string())?.shortcuts.clone())
}

#[tauri::command]
pub fn save_shortcuts(state: State<'_, AppState>, shortcuts: Vec<Shortcut>) -> Result<(), String> {
    state.inner.lock().map_err(|e| e.to_string())?.shortcuts = shortcuts;
    save_ok(&state)
}
