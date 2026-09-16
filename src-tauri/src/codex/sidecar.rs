//! Start / stop official `codex-app-server` as a Tauri sidecar and hold the RPC client.

use super::client::CodexClient;
use crate::state::AppState;
use std::path::PathBuf;
use std::process::{Child, Command};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Mutex;
use tauri::{AppHandle, Manager};

pub struct EngineHandle {
    child: Mutex<Option<Child>>,
    client: Mutex<Option<CodexClient>>,
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

        Ok(Self {
            child: Mutex::new(child),
            client: Mutex::new(None),
            running: AtomicBool::new(false),
            listen_url: Mutex::new(settings_listen),
        })
    }

    pub fn is_running(&self) -> bool {
        self.running.load(Ordering::SeqCst)
            || self
                .client
                .lock()
                .map(|c| c.as_ref().map(|c| c.is_connected()).unwrap_or(false))
                .unwrap_or(false)
    }

    /// Clone the client out of the mutex so the guard is dropped before any await.
    fn client_clone(&self) -> Option<CodexClient> {
        self.client.lock().ok().and_then(|g| g.clone())
    }

    fn store_client(&self, client: CodexClient) {
        if let Ok(mut guard) = self.client.lock() {
            *guard = Some(client);
        }
        self.running.store(true, Ordering::SeqCst);
    }

    fn listen_url(&self) -> String {
        self.listen_url
            .lock()
            .map(|g| g.clone())
            .unwrap_or_else(|_| "ws://127.0.0.1:17457".to_string())
    }

    pub async fn rpc(
        &self,
        method: &str,
        params: Option<serde_json::Value>,
    ) -> Result<serde_json::Value, String> {
        if let Some(client) = self.client_clone() {
            if client.is_connected() {
                return client.request(method, params).await;
            }
        }

        let url = self.listen_url();
        let client = CodexClient::connect(&url)
            .await
            .map_err(|e| format!("connect codex-app-server: {e}"))?;
        let result = client.request(method, params).await;
        self.store_client(client);
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
    // try_state returns Option in Tauri 2, not Result.
    if let Some(state) = app.try_state::<AppState>() {
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
    let dev = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("binaries/codex-app-server-x86_64-pc-windows-msvc.exe");
    if dev.exists() {
        return dev;
    }
    if cfg!(windows) {
        PathBuf::from("codex-app-server.exe")
    } else {
        PathBuf::from("codex-app-server")
    }
}
