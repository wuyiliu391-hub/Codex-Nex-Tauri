//! Async WebSocket JSON-RPC client for codex-app-server.
//!
//! Performs the official initialize / initialized handshake on connect
//! (see docs/RUST_BACKEND.md). Notifications are fan-out via
//! `tokio::sync::broadcast` so the event bridge and any other subscriber
//! can observe them without stealing the pending-request map.

use super::protocol::{RpcError, RpcRequest, RpcResultMessage, ServerMessage};
use futures_util::{SinkExt, StreamExt};
use serde_json::{json, Value};
use std::collections::HashMap;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use tokio::sync::{broadcast, mpsc, oneshot};
use tokio_tungstenite::tungstenite::Message;

type Pending = oneshot::Sender<Result<Value, RpcError>>;

const INITIALIZE_TIMEOUT: std::time::Duration = std::time::Duration::from_secs(10);
const REQUEST_TIMEOUT: std::time::Duration = std::time::Duration::from_secs(120);
const NOTIFY_CAPACITY: usize = 256;

#[derive(Clone)]
pub struct CodexClient {
    cmd_tx: mpsc::UnboundedSender<ClientCmd>,
    pending: Arc<Mutex<HashMap<String, Pending>>>,
    connected: Arc<AtomicBool>,
    notify_tx: broadcast::Sender<ServerMessage>,
    initialize_result: Arc<Mutex<Option<Value>>>,
}

enum ClientCmd {
    Send(String),
    Close,
}

impl CodexClient {
    /// Connect over WebSocket and complete the official initialize handshake.
    pub async fn connect(url: &str) -> anyhow::Result<Self> {
        let (ws, _) = tokio_tungstenite::connect_async(url).await?;
        let (mut write, mut read) = ws.split();
        let (cmd_tx, mut cmd_rx) = mpsc::unbounded_channel::<ClientCmd>();
        let (notify_tx, _) = broadcast::channel::<ServerMessage>(NOTIFY_CAPACITY);
        let pending: Arc<Mutex<HashMap<String, Pending>>> = Arc::new(Mutex::new(HashMap::new()));
        let connected = Arc::new(AtomicBool::new(true));

        // Writer task
        tokio::spawn(async move {
            while let Some(cmd) = cmd_rx.recv().await {
                match cmd {
                    ClientCmd::Send(text) => {
                        if write.send(Message::Text(text.into())).await.is_err() {
                            break;
                        }
                    }
                    ClientCmd::Close => {
                        let _ = write.send(Message::Close(None)).await;
                        break;
                    }
                }
            }
        });

        // Reader task
        let pending_r = pending.clone();
        let connected_r = connected.clone();
        let notify_r = notify_tx.clone();
        tokio::spawn(async move {
            while let Some(Ok(msg)) = read.next().await {
                match msg {
                    Message::Text(text) => {
                        handle_text_frame(&text, &pending_r, &notify_r);
                    }
                    Message::Close(_) => break,
                    _ => {}
                }
            }
            connected_r.store(false, Ordering::SeqCst);
        });

        let client = Self {
            cmd_tx,
            pending,
            connected,
            notify_tx,
            initialize_result: Arc::new(Mutex::new(None)),
        };

        let init = client.perform_initialize().await?;
        if let Ok(mut guard) = client.initialize_result.lock() {
            *guard = Some(init);
        }
        Ok(client)
    }

    /// Official handshake: `initialize` request → response → `initialized` notification.
    async fn perform_initialize(&self) -> anyhow::Result<Value> {
        let params = json!({
            "clientInfo": {
                "name": super::protocol::CLIENT_NAME,
                "title": super::protocol::CLIENT_TITLE,
                "version": env!("CARGO_PKG_VERSION"),
            },
            "capabilities": {
                "experimentalApi": true,
            },
        });
        let id = "initialize".to_string();
        let req = RpcRequest {
            id: id.clone(),
            method: super::protocol::INITIALIZE.to_string(),
            params: Some(params),
        };
        let text = serde_json::to_string(&req)?;
        let (tx, rx) = oneshot::channel();
        self.pending.lock().unwrap().insert(id.clone(), tx);
        self.cmd_tx
            .send(ClientCmd::Send(text))
            .map_err(|_| anyhow::anyhow!("client closed before initialize"))?;

        let result = tokio::time::timeout(INITIALIZE_TIMEOUT, rx)
            .await
            .map_err(|_| anyhow::anyhow!("initialize timed out"))?
            .map_err(|_| anyhow::anyhow!("initialize response channel closed"))?;

        let result = result.map_err(|e| anyhow::anyhow!("initialize rejected: {} {}", e.code, e.message))?;

        // Must follow the response. No params field (official test asserts this).
        self.notify(super::protocol::INITIALIZED, None)?;
        Ok(result)
    }

    pub fn is_connected(&self) -> bool {
        self.connected.load(Ordering::SeqCst)
    }

    pub fn initialize_result(&self) -> Option<Value> {
        self.initialize_result.lock().ok().and_then(|g| g.clone())
    }

    /// Subscribe to server notifications / requests. Multiple subscribers allowed.
    pub fn subscribe(&self) -> broadcast::Receiver<ServerMessage> {
        self.notify_tx.subscribe()
    }

    pub async fn request(
        &self,
        method: &str,
        params: Option<Value>,
    ) -> Result<Value, String> {
        let id = uuid::Uuid::new_v4().to_string();
        let req = RpcRequest {
            id: id.clone(),
            method: method.to_string(),
            params,
        };
        let text = serde_json::to_string(&req).map_err(|e| e.to_string())?;
        let (tx, rx) = oneshot::channel();
        self.pending.lock().unwrap().insert(id.clone(), tx);
        self.cmd_tx
            .send(ClientCmd::Send(text))
            .map_err(|_| "client closed".to_string())?;
        match tokio::time::timeout(REQUEST_TIMEOUT, rx).await {
            Ok(Ok(Ok(v))) => Ok(v),
            Ok(Ok(Err(e))) => Err(format!("{}: {}", e.code, e.message)),
            Ok(Err(_)) => Err("response channel closed".into()),
            Err(_) => {
                self.pending.lock().unwrap().remove(&id);
                Err("rpc timeout".into())
            }
        }
    }

    /// Fire-and-forget client notification (e.g. `initialized`).
    pub fn notify(&self, method: &str, params: Option<Value>) -> Result<(), String> {
        #[derive(serde::Serialize)]
        struct N<'a> {
            method: &'a str,
            #[serde(skip_serializing_if = "Option::is_none")]
            params: Option<Value>,
        }
        let text = serde_json::to_string(&N { method, params }).map_err(|e| e.to_string())?;
        self.cmd_tx
            .send(ClientCmd::Send(text))
            .map_err(|_| "client closed".into())
    }

    /// Resolve a server→client request (approval, user input, elicitation)
    /// by sending a JSON-RPC result for the given server request id.
    pub fn respond(&self, id: Value, result: Value) -> Result<(), String> {
        let text = serde_json::to_string(&RpcResultMessage { id, result })
            .map_err(|e| e.to_string())?;
        self.cmd_tx
            .send(ClientCmd::Send(text))
            .map_err(|_| "client closed".into())
    }

    pub fn close(&self) {
        let _ = self.cmd_tx.send(ClientCmd::Close);
    }
}

fn handle_text_frame(
    text: &str,
    pending: &Arc<Mutex<HashMap<String, Pending>>>,
    notify_tx: &broadcast::Sender<ServerMessage>,
) {
    if let Some(server_msg) = super::protocol::parse_server_message(text) {
        match &server_msg {
            ServerMessage::Response(resp) => {
                let key = super::protocol::rpc_id_key(&resp.id);
                complete_pending(pending, &key, &resp.result, &resp.error);
            }
            ServerMessage::Notification { .. } | ServerMessage::Request { .. } => {
                let _ = notify_tx.send(server_msg);
            }
        }
    }
}

fn complete_pending(
    pending: &Arc<Mutex<HashMap<String, Pending>>>,
    id: &str,
    result: &Option<Value>,
    error: &Option<RpcError>,
) {
    let mut map = pending.lock().unwrap();
    if let Some(tx) = map.remove(id) {
        let _ = tx.send(match (result, error) {
            (Some(v), _) => Ok(v.clone()),
            (None, Some(e)) => Err(e.clone()),
            (None, None) => Ok(Value::Null),
        });
    }
}
