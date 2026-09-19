use crate::kernel::{self, KernelState};
use crate::state::{AppState, Preferences, Settings, Shortcut};
use std::sync::Arc;
use tauri::State;

fn save_ok(state: &State<'_, AppState>) -> Result<(), String> {
    state.save().map_err(|e| e.to_string())
}

#[tauri::command]
pub fn get_settings(state: State<'_, AppState>) -> Result<Settings, String> {
    Ok(state
        .inner
        .lock()
        .map_err(|e| e.to_string())?
        .settings
        .clone())
}

/// `save_settings` — persist shell settings and re-resolve the active provider.
///
/// Settings carry `active_provider_id` and `active_model`, so this is one of the
/// two places a provider change can originate (the other is `save_provider`).
/// Rebuilding here is what makes picking a different model take effect on the
/// next turn without restarting the app.
#[tauri::command]
pub fn save_settings(
    state: State<'_, AppState>,
    kernel: State<'_, Arc<KernelState>>,
    settings: Settings,
) -> Result<(), String> {
    state.inner.lock().map_err(|e| e.to_string())?.settings = settings;
    save_ok(&state)?;

    // Rebuild the provider from the freshly saved store contents.
    let inputs = {
        let inner = state.inner.lock().map_err(|e| e.to_string())?;
        kernel::ProviderInputs {
            active_provider_id: inner.settings.active_provider_id.clone(),
            active_model: inner.settings.active_model.clone(),
            endpoints: inner.provider_endpoints.clone(),
            protocols: inner.provider_protocols.clone(),
            secrets: inner.provider_secrets.clone(),
        }
    };
    let resolved = kernel::build_provider(&inputs);
    kernel.set_provider(resolved.provider());
    tracing::info!(
        provider = kernel.provider_name(),
        placeholder = kernel.provider_is_placeholder(),
        "provider re-resolved after settings change"
    );

    Ok(())
}

#[tauri::command]
pub fn get_preferences(state: State<'_, AppState>) -> Result<Preferences, String> {
    Ok(state
        .inner
        .lock()
        .map_err(|e| e.to_string())?
        .preferences
        .clone())
}

#[tauri::command]
pub fn save_preferences(
    state: State<'_, AppState>,
    preferences: Preferences,
) -> Result<(), String> {
    state.inner.lock().map_err(|e| e.to_string())?.preferences = preferences;
    save_ok(&state)
}

#[tauri::command]
pub fn list_shortcuts(state: State<'_, AppState>) -> Result<Vec<Shortcut>, String> {
    Ok(state
        .inner
        .lock()
        .map_err(|e| e.to_string())?
        .shortcuts
        .clone())
}

#[tauri::command]
pub fn save_shortcuts(state: State<'_, AppState>, shortcuts: Vec<Shortcut>) -> Result<(), String> {
    state.inner.lock().map_err(|e| e.to_string())?.shortcuts = shortcuts;
    save_ok(&state)
}
