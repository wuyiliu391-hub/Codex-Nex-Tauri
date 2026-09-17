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
    use codex_app_server::in_process::{
        self, InProcessClientHandle, InProcessClientSender, InProcessServerEvent,
        InProcessStartArgs,
    };
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
        /// Kept for request/response; the full handle (which owns the event
        /// receiver) is moved into the event-pump task in `start`.
        sender: InProcessClientSender,
        next_request_id: AtomicI64,
        /// Signals the event-pump task to shut the runtime down.
        shutdown_tx: Option<tokio::sync::oneshot::Sender<()>>,
    }

    impl InProcessEngine {
        pub async fn start(
            _app: &AppHandle,
            events_tx: broadcast::Sender<ServerMessage>,
        ) -> anyhow::Result<Self> {
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

            // Split the handle: the sender drives requests/responses here, the
            // handle itself (owning the event receiver) drives the event pump.
            let sender = handle.sender();
            let (shutdown_tx, shutdown_rx) = tokio::sync::oneshot::channel();
            spawn_event_pump(handle, events_tx, shutdown_rx);

            Ok(Self {
                sender,
                next_request_id: AtomicI64::new(1),
                shutdown_tx: Some(shutdown_tx),
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
                .sender
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
            self.sender
                .respond_to_server_request(req_id, result)
                .map_err(|e| format!("respond error: {e}"))
        }

        pub async fn shutdown(mut self) {
            if let Some(tx) = self.shutdown_tx.take() {
                let _ = tx.send(());
            }
        }
    }

    /// Forward every in-process event into the shell's `ServerMessage` channel.
    ///
    /// Runs for the lifetime of the runtime; `shutdown_rx` lets the engine stop
    /// it gracefully, after which the runtime handle is awaited.
    fn spawn_event_pump(
        mut handle: InProcessClientHandle,
        events_tx: broadcast::Sender<ServerMessage>,
        mut shutdown_rx: tokio::sync::oneshot::Receiver<()>,
    ) {
        tauri::async_runtime::spawn(async move {
            loop {
                tokio::select! {
                    maybe_event = handle.next_event() => {
                        match maybe_event {
                            Some(event) => {
                                if let Some(msg) = event_to_server_message(event) {
                                    let _ = events_tx.send(msg);
                                }
                            }
                            None => break,
                        }
                    }
                    _ = &mut shutdown_rx => break,
                }
            }
            let _ = handle.shutdown().await;
        });
    }

    /// Convert one in-process event into the wire-level [`ServerMessage`].
    ///
    /// Reuses [`crate::codex::protocol::parse_server_message`] instead of
    /// matching variants by hand: `ServerNotification` serialises to
    /// `{ "method", "params" }` and `ServerRequest` to
    /// `{ "method", "id", "params" }` — exactly the shapes that parser already
    /// handles, so the sidecar and in-process paths share one parsing contract.
    fn event_to_server_message(event: InProcessServerEvent) -> Option<ServerMessage> {
        match event {
            InProcessServerEvent::ServerNotification(notification) => {
                let text = serde_json::to_string(&*notification).ok()?;
                crate::codex::protocol::parse_server_message(&text)
            }
            InProcessServerEvent::ServerRequest(request) => {
                let text = serde_json::to_string(&*request).ok()?;
                crate::codex::protocol::parse_server_message(&text)
            }
            InProcessServerEvent::Lagged { skipped } => {
                tracing::warn!(skipped, "in-process event stream lagged; events dropped");
                None
            }
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
                match in_process_backend::InProcessEngine::start(&app_clone, tx_clone).await {
                    Ok(eng) => {
                        tracing::info!("In-process Codex native backend started successfully");
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

        let mut child = None;

        // When the in-process backend is compiled in, no external binary is
        // spawned: the engine runs inside this process. The sidecar path below
        // is kept for builds that opt the feature out (and as a graceful
        // fallback if the in-process runtime fails to start — see `rpc`).
        #[cfg(not(feature = "in-process"))]
        {
            let bin = resolve_and_install_sidecar(app);

            // Provider API keys are kept in the shell store and handed to the
            // sidecar as environment variables, so config.toml only ever carries
            // the `env_key` *name*. See `state::provider_env_key`.
            let provider_env: Vec<(String, String)> = match app.try_state::<AppState>() {
                Some(state) => match state.inner.lock() {
                    Ok(inner) => inner
                        .provider_secrets
                        .iter()
                        .map(|(id, secret)| (crate::state::provider_env_key(id), secret.clone()))
                        .collect(),
                    Err(_) => Vec::new(),
                },
                None => Vec::new(),
            };

            if bin.exists() {
            let invocation = probe_invocation(&bin);
            let mut cmd = Command::new(&bin);
            for (name, value) in &provider_env {
                cmd.env(name, value);
            }
            // The official desktop ships a multi-call `codex.exe`; the app-server
            // transport only starts when the `app-server` subcommand comes first.
            // A standalone `codex-app-server.exe` takes no subcommand.
            for arg in &invocation.prefix {
                cmd.arg(arg);
            }
            cmd.arg("--listen").arg(&settings_listen);
            // Only pass `--session-source` when this build accepts it. The shipped
            // 0.154.0-alpha binary rejects it as an unknown argument and exits
            // immediately, leaving nothing listening on the port (symptom:
            // "由于目标计算机积极拒绝，无法连接" / os error 10061).
            if invocation.session_source {
                cmd.arg("--session-source").arg(SESSION_SOURCE);
            }
            // Hide the console window on Windows release builds.
            #[cfg(windows)]
            {
                use std::os::windows::process::CommandExt;
                const CREATE_NO_WINDOW: u32 = 0x0800_0000;
                cmd.creation_flags(CREATE_NO_WINDOW);
            }
            match cmd.spawn() {
                Ok(c) => {
                    tracing::info!(
                        path=%bin.display(),
                        listen=%settings_listen,
                        prefix=?invocation.prefix,
                        session_source=invocation.session_source,
                        "spawned codex-app-server"
                    );
                    child = Some(c);
                }
                Err(e) => {
                    tracing::warn!(error=%e, path=%bin.display(), "failed to spawn codex-app-server");
                }
            }
            } else {
                tracing::warn!(
                    "no codex-app-server binary resolved; engine stays disconnected. \
                     Put it at src-tauri/binaries/codex-app-server-x86_64-pc-windows-msvc.exe, \
                     set CODEX_APP_SERVER, or set settings.app_server_binary."
                );
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
    #[cfg(not(feature = "in-process"))]
    fn client_clone(&self) -> Option<CodexClient> {
        self.client.lock().ok().and_then(|g| g.clone())
    }

    #[cfg(not(feature = "in-process"))]
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

    #[cfg(not(feature = "in-process"))]
    fn listen_url(&self) -> String {
        self.listen_url
            .lock()
            .map(|g| g.clone())
            .unwrap_or_else(|_| DEFAULT_LISTEN_URL.to_string())
    }

    /// True when we spawned a sidecar and it has not exited yet.
    #[cfg(not(feature = "in-process"))]
    fn sidecar_alive(&self) -> bool {
        self.child
            .lock()
            .map(|mut guard| match guard.as_mut() {
                Some(child) => matches!(child.try_wait(), Ok(None)),
                None => false,
            })
            .unwrap_or(false)
    }

    /// Connect (and handshake), retrying briefly while a freshly spawned
    /// sidecar finishes binding its port.
    ///
    /// Without this the first RPC after a cold start races the sidecar's
    /// startup and surfaces as a spurious
    /// `connect codex-app-server: ... os error 10061`.
    /// When no sidecar was spawned we fail fast instead of stalling the UI.
    #[cfg(not(feature = "in-process"))]
    async fn connect_with_retry(&self, url: &str) -> Result<CodexClient, String> {
        const ATTEMPTS: u32 = 40;
        const DELAY_MS: u64 = 250;
        let budget = if self.sidecar_alive() { ATTEMPTS } else { 1 };
        let mut last = String::new();

        for attempt in 0..budget {
            match CodexClient::connect(url).await {
                Ok(client) => {
                    if attempt > 0 {
                        tracing::info!(
                            attempts = attempt + 1,
                            elapsed_ms = (attempt as u64) * DELAY_MS,
                            "codex-app-server accepted the connection after retry"
                        );
                    }
                    return Ok(client);
                }
                Err(e) => {
                    last = e.to_string();
                    if attempt + 1 < budget {
                        tokio::time::sleep(std::time::Duration::from_millis(DELAY_MS)).await;
                    }
                }
            }
        }
        Err(last)
    }

    /// Send a client→server request, connecting (and handshaking) on demand.
    pub async fn rpc(
        &self,
        method: &str,
        params: Option<serde_json::Value>,
    ) -> Result<serde_json::Value, String> {
        #[cfg(feature = "in-process")]
        {
            // The backend is started on a background task so `EngineHandle::start`
            // stays non-blocking. An RPC issued before it finishes must wait for
            // it rather than fall through to the (not spawned) sidecar path.
            const ATTEMPTS: u32 = 40;
            const DELAY_MS: u64 = 100;
            for attempt in 0..ATTEMPTS {
                {
                    let in_proc = self.in_process.lock().await;
                    if let Some(engine) = in_proc.as_ref() {
                        return engine.rpc(method, params).await;
                    }
                }
                if attempt + 1 < ATTEMPTS {
                    tokio::time::sleep(std::time::Duration::from_millis(DELAY_MS)).await;
                }
            }
            return Err("in-process Codex backend is not available (failed to start?)".to_string());
        }

        #[cfg(not(feature = "in-process"))]
        {
            if let Some(client) = self.client_clone() {
                if client.is_connected() {
                    return client.request(method, params).await;
                }
            }
            let url = self.listen_url();
            let client = self
                .connect_with_retry(&url)
                .await
                .map_err(|e| format!("connect codex-app-server: {e}"))?;
            // Kick off a warm-up so the UI can read initialize metadata later.
            let result = client.request(method, params).await;
            self.store_client(client);
            result
        }
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
            return Err("in-process Codex backend is not available".to_string());
        }

        #[cfg(not(feature = "in-process"))]
        {
            let client = self
                .client_clone()
                .ok_or_else(|| "engine not connected".to_string())?;
            if !client.is_connected() {
                return Err("engine not connected".into());
            }
            client.respond(id, result)
        }
    }

    /// Metadata from the last successful initialize handshake.
    ///
    /// Only the sidecar path exposes the handshake result; the in-process
    /// backend performs `initialize` internally without returning it, so this
    /// stays `None` there (the frontend treats it as optional).
    pub fn initialize_meta(&self) -> Option<serde_json::Value> {
        #[cfg(not(feature = "in-process"))]
        {
            return self.client_clone().and_then(|c| c.initialize_result());
        }
        #[cfg(feature = "in-process")]
        {
            None
        }
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

// ─── CLI shape probing ───────────────────────────────────────────────────────

/// How the resolved binary must be invoked.
///
/// Two shapes are supported:
/// - **Standalone** `codex-app-server.exe`: no subcommand, `--listen` at top level.
/// - **Multi-call** `codex.exe` (what the official desktop ships): needs the
///   `app-server` subcommand before any flag.
#[derive(Debug, Clone)]
struct SidecarInvocation {
    /// Args that must precede `--listen` (empty for a standalone binary).
    prefix: Vec<String>,
    /// Whether this build accepts `--session-source`.
    session_source: bool,
}

/// Determine the CLI shape by asking the binary for help.
///
/// This is deliberately a *probe* rather than a filename check: the official
/// `codex.exe` is routinely dropped in under the standalone filename, so the
/// name alone cannot be trusted. Costs ~200ms once at startup.
fn probe_invocation(bin: &Path) -> SidecarInvocation {
    // Multi-call `codex.exe`: `codex app-server --help`
    if let Some(help) = run_help(bin, &["app-server", "--help"]) {
        if help.contains("--listen") {
            return SidecarInvocation {
                prefix: vec!["app-server".to_string()],
                session_source: help.contains("--session-source"),
            };
        }
    }

    // Standalone `codex-app-server.exe`: `--help`
    if let Some(help) = run_help(bin, &["--help"]) {
        if help.contains("--listen") {
            return SidecarInvocation {
                prefix: Vec::new(),
                session_source: help.contains("--session-source"),
            };
        }
    }

    // Could not probe (unreadable, wrong arch, crashed). Fall back to the
    // filename heuristic and pass only the flags we know are universally safe.
    let name = bin
        .file_name()
        .map(|n| n.to_string_lossy().to_lowercase())
        .unwrap_or_default();
    let multi_call = !name.starts_with("codex-app-server");
    tracing::warn!(
        path=%bin.display(),
        multi_call,
        "could not probe sidecar CLI shape; using filename heuristic and omitting --session-source"
    );
    SidecarInvocation {
        prefix: if multi_call {
            vec!["app-server".to_string()]
        } else {
            Vec::new()
        },
        session_source: false,
    }
}

/// Run `<bin> <args>` and capture stdout+stderr. Returns `None` on spawn failure
/// or a non-zero exit. Never shows a console window on Windows.
fn run_help(bin: &Path, args: &[&str]) -> Option<String> {
    let mut cmd = Command::new(bin);
    cmd.args(args);
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x0800_0000;
        cmd.creation_flags(CREATE_NO_WINDOW);
    }
    let out = cmd.output().ok()?;
    if !out.status.success() {
        return None;
    }
    let mut text = String::from_utf8_lossy(&out.stdout).into_owned();
    text.push_str(&String::from_utf8_lossy(&out.stderr));
    Some(text)
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
