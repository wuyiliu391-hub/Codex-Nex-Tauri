use crate::codex::EngineHandle;
use crate::state::AppState;
use tauri::State;

#[tauri::command]
pub fn get_state(state: State<'_, AppState>) -> Result<crate::state::StateSnapshot, String> {
    Ok(state.snapshot())
}

#[derive(serde::Serialize)]
pub struct DependencyStatus {
    pub name: String,
    pub ok: bool,
    pub detail: String,
}

#[tauri::command]
pub fn check_dependencies(
    app: tauri::AppHandle,
    engine: State<'_, EngineHandle>,
) -> Result<Vec<DependencyStatus>, String> {
    let mut out = Vec::new();

    // WebView2 is provided by Tauri runtime; report shell ok.
    out.push(DependencyStatus {
        name: "tauri-shell".into(),
        ok: true,
        detail: "running".into(),
    });

    let connected = engine.is_running();
    out.push(DependencyStatus {
        name: "codex-app-server".into(),
        ok: connected,
        detail: if connected {
            "connected".into()
        } else {
            "not connected (install sidecar binary)".into()
        },
    });

    // ripgrep optional
    let rg = if cfg!(windows) { "rg.exe" } else { "rg" };
    let rg_ok = std::process::Command::new(rg)
        .arg("--version")
        .output()
        .map(|o| o.status.success())
        .unwrap_or(false);
    out.push(DependencyStatus {
        name: "ripgrep".into(),
        ok: rg_ok,
        detail: if rg_ok {
            "found".into()
        } else {
            "optional, not found".into()
        },
    });

    let _ = app;
    Ok(out)
}
