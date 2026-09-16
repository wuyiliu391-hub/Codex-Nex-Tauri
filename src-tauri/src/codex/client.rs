//! Async WebSocket JSON-RPC client for codex-app-server.

use super::protocol::{RpcError, RpcRequest, RpcResponse, ServerMessage};
use futures_util::{SinkExt, StreamExt};
use std::collections::HashMap;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use tokio::sync::{mpsc, oneshot};
use tokio_tungstenite::tungstenite::Message;

type Pending = oneshot::Sender<Result<serde_json::Value, RpcError>>;

#[derive(Clone)]
pub struct CodexClient {
    cmd_tx: mpsc::UnboundedSender<ClientCmd>,
    pending: Arc<Mutex<HashMap<String, Pending>>>,
    connected: Arc<AtomicBool>,
    notify_tx: mpsc::UnboundedSender<ServerMessage>,
}

enum ClientCmd {
    Send(String),
    Close,
}

impl CodexClient {
    pub async fn connect(url: &str) -> anyhow::Result<Self> {
        let (ws, _) = tokio_tungstenite::connect_async(url).await?;
        let (mut write, mut read) = ws.split();
        let (cmd_tx, mut cmd_rx) = mpsc::unbounded_channel::<ClientCmd>();
        let (notify_tx, _notify_rx) = mpsc::unbounded_channel::<ServerMessage>();
        let pending: Arc<Mutex<HashMap<String, Pending>>> = Arc::new(Mutex::new(HashMap::new()));
        let connected = Arc::new(AtomicBool::new(true));

        // Writer task
        tokio::spawn(async move {
            while let Some(cmd) = cmd_rx.recv().await {
                match cmd {
                    ClientCmd::Send(text) => {
                        if write.send(Message::Text(text)).await.is_err() {
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
                        if let Ok(server_msg) = serde_json::from_str::<ServerMessage>(&text) {
                            match &server_msg {
                                ServerMessage::Response(resp) => {
                                    let mut map = pending_r.lock().unwrap();
                                    if let Some(tx) = map.remove(&resp.id) {
                                        let _ = tx.send(match (&resp.result, &resp.error) {
                                            (Some(v), _) => Ok(v.clone()),
                                            (None, Some(e)) => Err(e.clone()),
                                            (None, None) => Ok(serde_json::Value::Null),
                                        });
                                    }
                                }
                                _ => {
                                    let _ = notify_r.send(server_msg);
                                }
                            }
                        } else if let Ok(resp) = serde_json::from_str::<RpcResponse>(&text) {
                            let mut map = pending_r.lock().unwrap();
                            if let Some(tx) = map.remove(&resp.id) {
                                let _ = tx.send(match (&resp.result, &resp.error) {
                                    (Some(v), _) => Ok(v.clone()),
                                    (None, Some(e)) => Err(e.clone()),
                                    (None, None) => Ok(serde_json::Value::Null),
                                });
                            }
                        }
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
        };
        Ok(client)
    }

    pub fn is_connected(&self) -> bool {
        self.connected.load(Ordering::SeqCst)
    }

    pub fn take_notify_rx(&self) -> Option<mpsc::UnboundedReceiver<ServerMessage>> {
        // One-shot: caller should hold the receiver from connect(). We expose a helper
        // for EngineHandle to own a dedicated subscribe channel instead.
        None
    }

    pub fn subscribe(&self) -> mpsc::UnboundedReceiver<ServerMessage> {
        // New dedicated subscription via re-broadcast is handled by EngineHandle.
        // For simplicity, EngineHandle keeps the original receiver.
        let (tx, rx) = mpsc::unbounded_channel();
        // Bridge from notify_tx is not multi-subscriber; EngineHandle owns primary rx.
        let _ = tx;
        rx
    }

    pub async fn request(
        &self,
        method: &str,
        params: Option<serde_json::Value>,
    ) -> Result<serde_json::Value, String> {
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
        match tokio::time::timeout(std::time::Duration::from_secs(120), rx).await {
            Ok(Ok(Ok(v))) => Ok(v),
            Ok(Ok(Err(e))) => Err(format!("{}: {}", e.code, e.message)),
            Ok(Err(_)) => Err("response channel closed".into()),
            Err(_) => {
                self.pending.lock().unwrap().remove(&id);
                Err("rpc timeout".into())
            }
        }
    }

    pub fn notify(&self, method: &str, params: Option<serde_json::Value>) -> Result<(), String> {
        #[derive(serde::Serialize)]
        struct N<'a> {
            method: &'a str,
            #[serde(skip_serializing_if = "Option::is_none")]
            params: Option<serde_json::Value>,
        }
        let text = serde_json::to_string(&N { method, params }).map_err(|e| e.to_string())?;
        self.cmd_tx
            .send(ClientCmd::Send(text))
            .map_err(|_| "client closed".into())
    }

    pub fn close(&self) {
        let _ = self.cmd_tx.send(ClientCmd::Close);
    }
}
