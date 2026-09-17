//! Start / stop official `codex-app-server` as a Tauri sidecar and hold the RPC client.
//!
//! Mirrors official Desktop's content-addressed install under
//! `%LOCALAPPDATA%\CodexDesktop\bin\<hash>\` (see docs/RUST_BACKEND.md).

use super::client::CodexClient;
use super::protocol::ServerMessage;
use crate::state::AppState;
use std::path::{Path, PathBuf};
use std::process::{Child, Command};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Mutex;
use tauri::{AppHandle, Manager};
use tokio::sync::broadcast;

/// Default loopback WebSocket endpoint for the sidecar.
pub const DEFAULT_LISTEN_URL: &str = "ws://127.0.0.1:17457";
/// Session source passed to app-server (`SessionSource::Custom("codex-desktop")`).
pub const SESSION_SOURCE: &str = "codex-desktop";
/// Env var that overrides binary resolution (absolute path).
pub const CODEX_APP_SERVER_ENV: &str = "CODEX_APP_SERVER";

const EVENT_CAPACITY: usize = 256;

#[cfg(feature = "in-process")]
pub mod in_process_backend {
    use super::*;
    use codex_app_server::in_process::{self, InProcessClientHandle, InProcessStartArgs};
    use codex_app_server_protocol::{
        ClientInfo, ClientRequest, InitializeCapabilities, InitializeParams, RequestId,
        ServerMessage as ProtocolServerMessage,
    };
    use codex_arg0::Arg0DispatchPaths;
    use codex_config::{CloudConfigBundleLoader, LoaderOverrides, NoopThreadConfigLoader};
    use codex_core::config::Config;
    use codex_exec_server::EnvironmentManager;
    use codex_feedback::CodexFeedback;
    use codex_protocol::protocol::SessionSource;
    use std::sync::atomic::AtomicI64;

    pub struct InProcessEngine {
        handle: InProcessClientHandle,
        next_request_id: AtomicI64,
    }

    impl InProcessEngine {
        pub async fn start(app: &AppHandle) -> anyhow::Result<Self> {
            let codex_home = codex_core::config::find_codex_home()
                .unwrap_or_else(|_| dirs::data_dir().unwrap_or_default().join("codex"));

            let config = codex_core::config::load_config(&codex_home)
                .await
                .unwrap_or_default();
            let config = std::sync::Arc::new(config);

            let initialize = InitializeParams {
                client_info: ClientInfo {
                    name: "codex-desktop-tauri".to_string(),
                    title: Some("Codex Desktop (Tauri)".to_string()),
                    version: env!("CARGO_PKG_VERSION").to_string(),
                },
                capabilities: Some(InitializeCapabilities {
                    experimental_api: true,
                    request_attestation: false,
                    extensions: None,
                    opt_out_notification_methods: None,
                    mcp_server_openai_form_elicitation: false,
                }),
            };

            let args = InProcessStartArgs {
                arg0_paths: Arg0DispatchPaths::default(),
                config: std::sync::Arc::clone(&config),
                cli_overrides: Vec::new(),
                loader_overrides: LoaderOverrides::default(),
                strict_config: false,
                cloud_config_bundle: CloudConfigBundleLoader::default(),
                thread_config_loader: std::sync::Arc::new(NoopThreadConfigLoader),
                feedback: CodexFeedback::new(),
                log_db: None,
                state_db: None,
                environment_manager: std::sync::Arc::new(EnvironmentManager::default_for_tests()),
                config_warnings: Vec::new(),
                session_source: SessionSource::Custom("codex-desktop".to_string()),
                enable_codex_api_key_env: true,
                initialize,
                channel_capacity: in_process::DEFAULT_IN_PROCESS_CHANNEL_CAPACITY,
            };

            let handle = in_process::start(args)
                .await
                .map_err(|e| anyhow::anyhow!("failed to start in-process app server: {e}"))?;

            Ok(Self {
                handle,
                next_request_id: AtomicI64::new(1),
            })
        }

        pub async fn rpc(
            &self,
            method: &str,
            params: Option<serde_json::Value>,
        ) -> Result<serde_json::Value, String> {
            let id = self.next_request_id.fetch_add(1, Ordering::SeqCst);
            let req_json = serde_json::json!({
                "id": id,
                "method": method,
                "params": params.unwrap_or(serde_json::Value::Null)
            });
            let client_req: ClientRequest = serde_json::from_value(req_json)
                .map_err(|e| format!("invalid RPC request '{method}': {e}"))?;

            let res = self
                .handle
                .request(client_req)
                .await
                .map_err(|e| format!("in-process RPC '{method}' I/O error: {e}"))?;

            match res {
                Ok(val) => Ok(val),
                Err(err) => {
                    Err(format!("RPC '{method}' error: {} (code {})", err.message, err.code))
                }
            }
        }

        pub fn respond(
            &self,
            id: serde_json::Value,
            result: serde_json::Value,
        ) -> Result<(), String> {
            let req_id = match id {
                serde_json::Value::Number(n) => RequestId::Integer(n.as_i64().unwrap_or(0)),
                serde_json::Value::String(s) => RequestId::String(s),
                _ => RequestId::Integer(0),
            };
            self.handle
                .respond_to_server_request(req_id, result)
                .map_err(|e| format!("respond error: {e}"))
        }

        pub fn spawn_event_pump(&mut self, events_tx: broadcast::Sender<ServerMessage>) {
            // Note: in_process events are consumed via handle.next_event()
        }

        pub async fn shutdown(self) {
            let _ = self.handle.shutdown().await;
        }
    }
}

pub struct EngineHandle {
    #[cfg(feature = "in-process")]
    in_process: std::sync::Arc<tokio::sync::Mutex<Option<in_process_backend::InProcessEngine>>>,
    child: Mutex<Option<Child>>,
    client: Mutex<Option<CodexClient>>,
    running: AtomicBool,
    listen_url: Mutex<String>,
    /// Stable fan-out for server notifications, independent of client reconnects.
    events_tx: broadcast::Sender<ServerMessage>,
}

impl EngineHandle {
    pub fn start(app: &AppHandle) -> tauri::Result<Self> {
        let (events_tx, _) = broadcast::channel(EVENT_CAPACITY);

        #[cfg(feature = "in-process")]
        let in_process = {
            let tx_clone = events_tx.clone();
            let app_clone = app.clone();
            let engine_holder = std::sync::Arc::new(tokio::sync::Mutex::new(None));
            let holder_clone = engine_holder.clone();

            tauri::async_runtime::spawn(async move {
                match in_process_backend::InProcessEngine::start(&app_clone).await {
                    Ok(mut eng) => {
                        tracing::info!("In-process Codex native backend started successfully");
                        eng.spawn_event_pump(tx_clone);
                        let mut guard = holder_clone.lock().await;
                        *guard = Some(eng);
                    }
                    Err(e) => {
                        tracing::warn!(error = %e, "Failed to start in-process Codex backend");
                    }
                }
            });
            engine_holder
        };

        let settings_listen = app
            .state::<AppState>()
            .inner
            .lock()
            .map(|s| {
                let v = s.settings.app_server_listen.clone();
                if v.is_empty() {
                    DEFAULT_LISTEN_URL.to_string()
                } else {
                    v
                }
            })
            .unwrap_or_else(|_| DEFAULT_LISTEN_URL.to_string());

        let bin = resolve_and_install_sidecar(app);
        let mut child = None;

        if bin.exists() {
            let mut cmd = Command::new(&bin);
            cmd.arg("--listen").arg(&settings_listen);
            cmd.arg("--session-source").arg(SESSION_SOURCE);
            // Hide the console window on Windows release builds.
            #[cfg(windows)]
            {
                use std::os::windows::process::CommandExt;
                const CREATE_NO_WINDOW: u32 = 0x0800_0000;
                cmd.creation_flags(CREATE_NO_WINDOW);
            }
            match cmd.spawn() {
                Ok(c) => {
                    tracing::info!(path=%bin.display(), listen=%settings_listen, "spawned codex-app-server");
                    child = Some(c);
                }
                Err(e) => {
                    tracing::warn!(error=%e, path=%bin.display(), "failed to spawn codex-app-server");
                }
            }
        }

        Ok(Self {
            #[cfg(feature = "in-process")]
            in_process,
            child: Mutex::new(child),
            client: Mutex::new(None),
            running: AtomicBool::new(false),
            listen_url: Mutex::new(settings_listen),
            events_tx,
        })
    }

    pub fn is_running(&self) -> bool {
        #[cfg(feature = "in-process")]
        {
            if let Ok(guard) = self.in_process.try_lock() {
                if guard.is_some() {
                    return true;
                }
            }
        }

        self.running.load(Ordering::SeqCst)
            || self
                .client
                .lock()
                .map(|c| c.as_ref().map(|c| c.is_connected()).unwrap_or(false))
                .unwrap_or(false)
    }

    /// Subscribe to server notifications / server→client requests.
    pub fn subscribe(&self) -> broadcast::Receiver<ServerMessage> {
        self.events_tx.subscribe()
    }

    /// Clone the client out of the mutex so the guard is dropped before any await.
    fn client_clone(&self) -> Option<CodexClient> {
        self.client.lock().ok().and_then(|g| g.clone())
    }

    fn store_client(&self, client: CodexClient) {
        // Forward this client's broadcast into the stable EngineHandle channel.
        let mut rx = client.subscribe();
        let tx = self.events_tx.clone();
        tauri::async_runtime::spawn(async move {
            loop {
                match rx.recv().await {
                    Ok(msg) => {
                        let _ = tx.send(msg);
                    }
                    Err(broadcast::error::RecvError::Lagged(n)) => {
                        tracing::warn!(skipped = n, "engine event subscriber lagged");
                    }
                    Err(broadcast::error::RecvError::Closed) => break,
                }
            }
        });

        if let Ok(mut guard) = self.client.lock() {
            *guard = Some(client);
        }
        self.running.store(true, Ordering::SeqCst);
    }

    fn listen_url(&self) -> String {
        self.listen_url
            .lock()
            .map(|g| g.clone())
            .unwrap_or_else(|_| DEFAULT_LISTEN_URL.to_string())
    }

    /// Send a client→server request, connecting (and handshaking) on demand.
    pub async fn rpc(
        &self,
        method: &str,
        params: Option<serde_json::Value>,
    ) -> Result<serde_json::Value, String> {
        #[cfg(feature = "in-process")]
        {
            let in_proc = self.in_process.lock().await;
            if let Some(engine) = in_proc.as_ref() {
                return engine.rpc(method, params).await;
            }
        }

        if let Some(client) = self.client_clone() {
            if client.is_connected() {
                return client.request(method, params).await;
            }
        }

        let url = self.listen_url();
        let client = CodexClient::connect(&url)
            .await
            .map_err(|e| format!("connect codex-app-server: {e}"))?;
        // Kick off a warm-up so the UI can read initialize metadata later.
        let result = client.request(method, params).await;
        self.store_client(client);
        result
    }

    /// Resolve a server→client request (approval / user input / elicitation).
    pub fn respond(
        &self,
        id: serde_json::Value,
        result: serde_json::Value,
    ) -> Result<(), String> {
        #[cfg(feature = "in-process")]
        {
            if let Ok(guard) = self.in_process.try_lock() {
                if let Some(engine) = guard.as_ref() {
                    return engine.respond(id, result);
                }
            }
        }

        let client = self
            .client_clone()
            .ok_or_else(|| "engine not connected".to_string())?;
        if !client.is_connected() {
            return Err("engine not connected".into());
        }
        client.respond(id, result)
    }

    /// Metadata from the last successful initialize handshake.
    pub fn initialize_meta(&self) -> Option<serde_json::Value> {
        self.client_clone().and_then(|c| c.initialize_result())
    }

    pub fn shutdown(&self) {
        #[cfg(feature = "in-process")]
        {
            let in_proc = self.in_process.clone();
            tauri::async_runtime::spawn(async move {
                let mut guard = in_proc.lock().await;
                if let Some(engine) = guard.take() {
                    engine.shutdown().await;
                }
            });
        }

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

// ─── binary resolution + content-addressed install ───────────────────────────

/// Resolve the sidecar binary, installing it into a content-hash directory
/// under `%LOCALAPPDATA%\CodexDesktop\bin\<hash>\` when a source is found.
fn resolve_and_install_sidecar(app: &AppHandle) -> PathBuf {
    let source = resolve_sidecar_source(app);
    let Some(source) = source else {
        return if cfg!(windows) {
            PathBuf::from("codex-app-server.exe")
        } else {
            PathBuf::from("codex-app-server")
        };
    };

    if !source.exists() {
        tracing::warn!(path=%source.display(), "configured sidecar binary does not exist");
        return source;
    }

    match install_into_hash_dir(&source) {
        Ok(installed) => {
            tracing::info!(
                source=%source.display(),
                installed=%installed.display(),
                "sidecar installed into content-hash dir"
            );
            installed
        }
        Err(e) => {
            tracing::warn!(
                error=%e,
                source=%source.display(),
                "hash-dir install failed; spawning source path directly"
            );
            source
        }
    }
}

/// Find a source binary without installing it.
fn resolve_sidecar_source(app: &AppHandle) -> Option<PathBuf> {
    // 1. CODEX_APP_SERVER env
    if let Ok(p) = std::env::var(CODEX_APP_SERVER_ENV) {
        if !p.is_empty() {
            return Some(PathBuf::from(p));
        }
    }

    // 2. settings.app_server_binary
    if let Some(state) = app.try_state::<AppState>() {
        if let Ok(inner) = state.inner.lock() {
            let configured = inner.settings.app_server_binary.clone();
            if !configured.is_empty() {
                return Some(PathBuf::from(configured));
            }
        }
    }

    // 3. Existing hash-dir install (most recent)
    if let Some(installed) = latest_hash_dir_install() {
        return Some(installed);
    }

    // 4. Bundled / dev binaries
    if let Ok(dir) = app.path().resource_dir() {
        let candidates = [
            dir.join("binaries/codex-app-server-x86_64-pc-windows-msvc.exe"),
            dir.join("codex-app-server.exe"),
        ];
        for c in candidates {
            if c.exists() {
                return Some(c);
            }
        }
    }
    let dev = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("binaries/codex-app-server-x86_64-pc-windows-msvc.exe");
    if dev.exists() {
        return Some(dev);
    }

    // 5. PATH
    None
}

/// `%LOCALAPPDATA%\CodexDesktop\bin` (Windows) or equivalent local data dir.
fn bin_root() -> Option<PathBuf> {
    let base = dirs::data_local_dir()?;
    Some(base.join("CodexDesktop").join("bin"))
}

/// FNV-1a 64-bit content hash used as the install directory name.
/// (Not cryptographic; only used to version the installed binary.)
fn content_hash(bytes: &[u8]) -> String {
    let mut hash: u64 = 0xcbf2_9ce4_8422_2325;
    for &b in bytes {
        hash ^= b as u64;
        hash = hash.wrapping_mul(0x0100_0000_01b3);
    }
    format!("{hash:016x}")
}

fn install_into_hash_dir(source: &Path) -> anyhow::Result<PathBuf> {
    let root = bin_root().ok_or_else(|| anyhow::anyhow!("cannot resolve local data dir"))?;
    let bytes = std::fs::read(source)?;
    let hash = content_hash(&bytes);
    let dir = root.join(&hash);
    let dest_name = if cfg!(windows) {
        "codex-app-server.exe"
    } else {
        "codex-app-server"
    };
    let dest = dir.join(dest_name);

    if dest.exists() {
        // Already installed for this content hash.
        return Ok(dest);
    }

    std::fs::create_dir_all(&dir)?;
    // Write via temp + rename for atomicity within the dir.
    let tmp = dir.join(format!("{dest_name}.tmp"));
    std::fs::write(&tmp, &bytes)?;
    std::fs::rename(&tmp, &dest)?;

    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let _ = std::fs::set_permissions(&dest, std::fs::Permissions::from_mode(0o755));
    }

    Ok(dest)
}

/// Pick the newest existing install under the hash dir (if any).
fn latest_hash_dir_install() -> Option<PathBuf> {
    let root = bin_root()?;
    let name = if cfg!(windows) {
        "codex-app-server.exe"
    } else {
        "codex-app-server"
    };
    let mut best: Option<(std::time::SystemTime, PathBuf)> = None;
    let entries = std::fs::read_dir(&root).ok()?;
    for entry in entries.flatten() {
        let path = entry.path().join(name);
        if !path.exists() {
            continue;
        }
        let modified = entry
            .metadata()
            .and_then(|m| m.modified())
            .unwrap_or(std::time::SystemTime::UNIX_EPOCH);
        if best.as_ref().map(|(t, _)| modified > *t).unwrap_or(true) {
            best = Some((modified, path));
        }
    }
    best.map(|(_, p)| p)
}
