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

/// `check_dependencies` — environment probe for the settings UI.
///
/// The `codex-app-server` entry is gone on purpose: the kernel is in-process,
/// so there is no external binary to resolve or connect to. Reporting a
/// missing sidecar here would now be misleading. What remains are the things
/// that genuinely can be absent: the WebView runtime (supplied by Tauri) and
/// the optional `ripgrep` used by future file search.
#[tauri::command]
pub fn check_dependencies(app: tauri::AppHandle) -> Result<Vec<DependencyStatus>, String> {
    let mut out = Vec::new();

    // WebView2 is provided by the Tauri runtime; if this code runs, it exists.
    out.push(DependencyStatus {
        name: "tauri-shell".into(),
        ok: true,
        detail: "running".into(),
    });

    // The kernel is compiled into this binary: it cannot be missing.
    out.push(DependencyStatus {
        name: "kernel".into(),
        ok: true,
        detail: "in-process (no external engine binary)".into(),
    });

    // ripgrep is optional and only used by future file search.
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
