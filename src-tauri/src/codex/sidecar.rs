//! Start / stop official `codex-app-server` as a Tauri sidecar and hold the RPC client.

use super::client::CodexClient;
use super::protocol::ServerMessage;
use crate::state::AppState;
use std::path::PathBuf;
use std::process::{Child, Command};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Mutex;
use tauri::{AppHandle, Manager};
use tokio::sync::mpsc;

pub struct EngineHandle {
    child: Mutex<Option<Child>>,
    client: Mutex<Option<CodexClient>>,
    notify_rx: Mutex<Option<mpsc::UnboundedReceiver<ServerMessage>>>,
    running: AtomicBool,
    listen_url: Mutex<String>,
}

impl EngineHandle {
    pub fn start(app: &AppHandle) -> tauri::Result<Self> {
        let settings_listen = app
            .state::<AppState>()
            .inner
            .lock()
            .map(|s| s.settings.app_server_listen.clone())
            .unwrap_or_else(|_| "ws://127.0.0.1:17457".to_string());

        let bin = resolve_sidecar_bin(app);
        let mut child = None;

        // Best-effort spawn. If binary missing, engine stays offline and
        // rpc commands return a clear error (cloud installs binary).
        if bin.exists() {
            let mut cmd = Command::new(&bin);
            cmd.arg("--listen").arg(&settings_listen);
            cmd.arg("--session-source").arg("codex-desktop");
            match cmd.spawn() {
                Ok(c) => {
                    tracing::info!(path=%bin.display(), "spawned codex-app-server");
                    child = Some(c);
                }
                Err(e) => {
                    tracing::warn!(error=%e, "failed to spawn codex-app-server");
                }
            }
        } else {
            tracing::warn!(
                path=%bin.display(),
                "codex-app-server sidecar binary not found; engine offline"
            );
        }

        let handle = Self {
            child: Mutex::new(child),
            client: Mutex::new(None),
            notify_rx: Mutex::new(None),
            running: AtomicBool::new(false),
            listen_url: Mutex::new(settings_listen),
        };

        // Async connect on a runtime.
        let listen = handle.listen_url.lock().unwrap().clone();
        tauri::async_runtime::spawn(async move {
            // Wait briefly for sidecar bind.
            tokio::time::sleep(std::time::Duration::from_millis(400)).await;
            for attempt in 0..20 {
                match CodexClient::connect(&listen).await {
                    Ok(_client) => {
                        // Store via a later reconnect helper when EngineHandle is managed.
                        tracing::info!(url=%listen, attempt, "connected to codex-app-server");
                        break;
                    }
                    Err(e) => {
                        tracing::debug!(error=%e, attempt, "waiting for codex-app-server");
                        tokio::time::sleep(std::time::Duration::from_millis(250)).await;
                    }
                }
            }
        });

        Ok(handle)
    }

    pub fn is_running(&self) -> bool {
        self.running.load(Ordering::SeqCst)
            || self.client.lock().map(|c| c.as_ref().map(|c| c.is_connected()).unwrap_or(false)).unwrap_or(false)
    }

    pub fn ensure_client_sync(&self) -> Result<(), String> {
        let mut guard = self.client.lock().map_err(|e| e.to_string())?;
        if let Some(c) = guard.as_ref() {
            if c.is_connected() {
                return Ok(());
            }
        }
        let url = self.listen_url.lock().map_err(|e| e.to_string())?.clone();
        // Blocking connect on a throwaway runtime for command context.
        let rt = tokio::runtime::Builder::new_current_thread()
            .enable_all()
            .build()
            .map_err(|e| e.to_string())?;
        let client = rt
            .block_on(CodexClient::connect(&url))
            .map_err(|e| format!("connect codex-app-server: {e}"))?;
        *guard = Some(client);
        self.running.store(true, Ordering::SeqCst);
        Ok(())
    }

    pub async fn rpc(
        &self,
        method: &str,
        params: Option<serde_json::Value>,
    ) -> Result<serde_json::Value, String> {
        // Fast path: already connected.
        {
            let guard = self.client.lock().map_err(|e| e.to_string())?;
            if let Some(c) = guard.as_ref() {
                if c.is_connected() {
                    return c.request(method, params).await;
                }
            }
        }
        let url = self.listen_url.lock().map_err(|e| e.to_string())?.clone();
        let client = CodexClient::connect(&url)
            .await
            .map_err(|e| format!("connect codex-app-server: {e}"))?;
        let result = client.request(method, params).await;
        let mut guard = self.client.lock().map_err(|e| e.to_string())?;
        *guard = Some(client);
        self.running.store(true, Ordering::SeqCst);
        result
    }

    pub fn shutdown(&self) {
        if let Ok(mut guard) = self.client.lock() {
            if let Some(c) = guard.take() {
                c.close();
            }
        }
        if let Ok(mut guard) = self.child.lock() {
            if let Some(mut child) = guard.take() {
                let _ = child.kill();
                let _ = child.wait();
            }
        }
        self.running.store(false, Ordering::SeqCst);
    }
}

fn resolve_sidecar_bin(app: &AppHandle) -> PathBuf {
    // Prefer explicit setting, then resource dir, then PATH-like fallbacks.
    if let Ok(state) = app.try_state::<AppState>() {
        if let Ok(inner) = state.inner.lock() {
            let configured = inner.settings.app_server_binary.clone();
            if !configured.is_empty() {
                return PathBuf::from(configured);
            }
        }
    }
    if let Ok(dir) = app.path().resource_dir() {
        let candidates = [
            dir.join("binaries/codex-app-server-x86_64-pc-windows-msvc.exe"),
            dir.join("codex-app-server.exe"),
        ];
        for c in candidates {
            if c.exists() {
                return c;
            }
        }
    }
    // Dev: look next to this crate.
    let dev = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("binaries/codex-app-server-x86_64-pc-windows-msvc.exe");
    if dev.exists() {
        return dev;
    }
    // Final fallback: bare name for PATH.
    if cfg!(windows) {
        PathBuf::from("codex-app-server.exe")
    } else {
        PathBuf::from("codex-app-server")
    }
}
