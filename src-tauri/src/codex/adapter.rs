//! Protocol adapter / gateway for custom model providers.
//!
//! Codex engine 0.154 natively requires `wire_api = "responses"` (calling `/v1/responses`).
//! Many third-party providers only offer OpenAI Chat (`/v1/chat/completions`), Anthropic
//! Messages (`/v1/messages`), or Ollama (`/api/chat`).
//!
//! This module runs a lightweight local HTTP server (default `http://127.0.0.1:17458`) that:
//! 1. Receives standard `POST /v1/responses` requests from the Codex engine.
//! 2. Adapts the request body into the upstream provider's protocol (Chat, Anthropic, or Ollama).
//! 3. Forwards the request to the upstream target `base_url`.
//! 4. Adapts streaming response chunks back into the SSE format expected by Codex.

use futures_util::StreamExt;
use reqwest::header::{HeaderMap, HeaderValue, AUTHORIZATION, CONTENT_TYPE};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::collections::HashMap;
use std::net::SocketAddr;
use std::sync::{Arc, Mutex};
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::net::{TcpListener, TcpStream};
use tracing::{error, info, warn};

pub const DEFAULT_ADAPTER_PORT: u16 = 17458;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProviderRoute {
    pub id: String,
    pub protocol: String, // "openai_chat" | "anthropic" | "ollama" | "openai_responses"
    pub target_base_url: String,
    pub api_key: String,
    pub default_model: Option<String>,
}

#[derive(Clone, Default)]
pub struct AdapterState {
    routes: Arc<Mutex<HashMap<String, ProviderRoute>>>,
    active_provider_id: Arc<Mutex<Option<String>>>,
}

impl AdapterState {
    pub fn set_route(&self, route: ProviderRoute) {
        if let Ok(mut map) = self.routes.lock() {
            map.insert(route.id.clone(), route);
        }
    }

    pub fn set_active(&self, id: &str) {
        if let Ok(mut act) = self.active_provider_id.lock() {
            *act = Some(id.to_string());
        }
    }

    pub fn get_active_route(&self) -> Option<ProviderRoute> {
        let act = self.active_provider_id.lock().ok()?.clone()?;
        self.routes.lock().ok()?.get(&act).cloned()
    }

    pub fn get_route(&self, id: &str) -> Option<ProviderRoute> {
        self.routes.lock().ok()?.get(id).cloned()
    }
}

pub struct ProtocolAdapter {
    state: AdapterState,
    port: u16,
}

impl ProtocolAdapter {
    pub fn new(port: u16) -> Self {
        Self {
            state: AdapterState::default(),
            port,
        }
    }

    pub fn state(&self) -> AdapterState {
        self.state.clone()
    }

    /// Spawn the adapter HTTP server in a background tokio task.
    pub async fn spawn_server(self: Arc<Self>) -> anyhow::Result<()> {
        let addr = SocketAddr::from(([127, 0, 0, 1], self.port));
        let listener = TcpListener::bind(addr).await?;
        info!("Protocol adapter listening on http://{}", addr);

        tokio::spawn(async move {
            loop {
                match listener.accept().await {
                    Ok((stream, _)) => {
                        let this = self.clone();
                        tokio::spawn(async move {
                            if let Err(e) = this.handle_connection(stream).await {
                                warn!("Adapter connection error: {}", e);
                            }
                        });
                    }
                    Err(e) => {
                        error!("Adapter listener error: {}", e);
                        tokio::time::sleep(tokio::time::Duration::from_millis(100)).await;
                    }
                }
            }
        });

        Ok(())
    }

    async fn handle_connection(&self, mut stream: TcpStream) -> anyhow::Result<()> {
        let mut buf = vec![0u8; 8192];
        let mut total_read = 0;
        let mut header_end = 0;

        // Read until HTTP header separator \r\n\r\n
        while total_read < buf.len() {
            let n = stream.read(&mut buf[total_read..]).await?;
            if n == 0 {
                return Ok(());
            }
            total_read += n;
            if let Some(pos) = find_subsequence(&buf[..total_read], b"\r\n\r\n") {
                header_end = pos + 4;
                break;
            }
        }

        let header_str = String::from_utf8_lossy(&buf[..header_end]);
        let mut lines = header_str.lines();
        let request_line = lines.next().unwrap_or("");
        let mut parts = request_line.split_whitespace();
        let method = parts.next().unwrap_or("GET");
        let path = parts.next().unwrap_or("/");

        // Content-Length parsing
        let mut content_length: usize = 0;
        for line in lines {
            let lower = line.to_lowercase();
            if lower.starts_with("content-length:") {
                if let Some(val) = line.split(':').nth(1) {
                    content_length = val.trim().parse().unwrap_or(0);
                }
            }
        }

        let mut body_bytes = Vec::new();
        if header_end < total_read {
            body_bytes.extend_from_slice(&buf[header_end..total_read]);
        }
        while body_bytes.len() < content_length {
            let mut chunk = vec![0u8; 8192];
            let n = stream.read(&mut chunk).await?;
            if n == 0 {
                break;
            }
            body_bytes.extend_from_slice(&chunk[..n]);
        }

        // Routing: handle POST /v1/responses
        if method == "POST" && (path.starts_with("/v1/responses") || path.starts_with("/responses")) {
            let route = self.state.get_active_route();
            if let Some(route) = route {
                self.forward_responses_request(&mut stream, &route, &body_bytes).await?;
                return Ok(());
            } else {
                let err_body = json!({
                    "error": {
                        "message": "No active provider route configured in Codex adapter",
                        "type": "invalid_request_error"
                    }
                }).to_string();
                let resp = format!(
                    "HTTP/1.1 400 Bad Request\r\nContent-Type: application/json\r\nContent-Length: {}\r\n\r\n{}",
                    err_body.len(),
                    err_body
                );
                stream.write_all(resp.as_bytes()).await?;
                return Ok(());
            }
        }

        // Default 404 for unknown endpoints
        let not_found = "HTTP/1.1 404 Not Found\r\nContent-Length: 0\r\n\r\n";
        stream.write_all(not_found.as_bytes()).await?;
        Ok(())
    }

    async fn forward_responses_request(
        &self,
        client_stream: &mut TcpStream,
        route: &ProviderRoute,
        raw_body: &[u8],
    ) -> anyhow::Result<()> {
        let codex_req: Value = serde_json::from_slice(raw_body).unwrap_or(json!({}));
        let http_client = reqwest::Client::builder()
            .timeout(std::time::Duration::from_secs(180))
            .build()?;

        match route.protocol.as_str() {
            "anthropic" => {
                self.forward_anthropic(client_stream, &http_client, route, &codex_req).await
            }
            "ollama" => {
                self.forward_ollama(client_stream, &http_client, route, &codex_req).await
            }
            // Default: openai_chat
            _ => {
                self.forward_openai_chat(client_stream, &http_client, route, &codex_req).await
            }
        }
    }

    /// Adapt Codex Responses request -> OpenAI Chat Completions -> SSE stream back to Codex.
    async fn forward_openai_chat(
        &self,
        client_stream: &mut TcpStream,
        http_client: &reqwest::Client,
        route: &ProviderRoute,
        req: &Value,
    ) -> anyhow::Result<()> {
        let model = req.get("model")
            .and_then(|m| m.as_str())
            .or(route.default_model.as_deref())
            .unwrap_or("gpt-4o");

        let messages = extract_chat_messages(req);
        let stream = req.get("stream").and_then(|s| s.as_bool()).unwrap_or(true);

        let mut chat_body = json!({
            "model": model,
            "messages": messages,
            "stream": stream,
        });

        if let Some(temp) = req.get("temperature") {
            chat_body["temperature"] = temp.clone();
        }

        let target_url = format!("{}/chat/completions", route.target_base_url.trim_end_matches('/'));
        let mut req_builder = http_client.post(&target_url).json(&chat_body);

        if !route.api_key.is_empty() {
            req_builder = req_builder.header(AUTHORIZATION, format!("Bearer {}", route.api_key));
        }

        let upstream_resp = match req_builder.send().await {
            Ok(r) => r,
            Err(e) => {
                let err_msg = json!({
                    "error": { "message": format!("Upstream error: {e}"), "type": "gateway_error" }
                }).to_string();
                let resp = format!(
                    "HTTP/1.1 502 Bad Gateway\r\nContent-Type: application/json\r\nContent-Length: {}\r\n\r\n{}",
                    err_msg.len(), err_msg
                );
                client_stream.write_all(resp.as_bytes()).await?;
                return Ok(());
            }
        };

        if !upstream_resp.status().is_success() {
            let status = upstream_resp.status().as_u16();
            let body = upstream_resp.text().await.unwrap_or_default();
            let resp = format!(
                "HTTP/1.1 {} Upstream Error\r\nContent-Type: application/json\r\nContent-Length: {}\r\n\r\n{}",
                status, body.len(), body
            );
            client_stream.write_all(resp.as_bytes()).await?;
            return Ok(());
        }

        // Send HTTP 200 OK + SSE headers to Codex engine
        client_stream.write_all(b"HTTP/1.1 200 OK\r\nContent-Type: text/event-stream\r\nCache-Control: no-cache\r\nConnection: keep-alive\r\n\r\n").await?;

        let mut stream_bytes = upstream_resp.bytes_stream();
        let mut sse_buffer = String::new();

        while let Some(chunk_res) = stream_bytes.next().await {
            if let Ok(chunk) = chunk_res {
                let text = String::from_utf8_lossy(&chunk);
                sse_buffer.push_str(&text);

                while let Some(pos) = sse_buffer.find('\n') {
                    let line = sse_buffer[..pos].trim_end_matches('\r').to_string();
                    sse_buffer = sse_buffer[pos + 1..].to_string();

                    if line.starts_with("data: ") {
                        let payload = line.trim_start_matches("data: ").trim();
                        if payload == "[DONE]" {
                            let completed_event = "event: response.completed\r\ndata: {\"status\":\"completed\"}\r\n\r\n";
                            client_stream.write_all(completed_event.as_bytes()).await?;
                            break;
                        }

                        if let Ok(v) = serde_json::from_str::<Value>(payload) {
                            if let Some(content) = v.pointer("/choices/0/delta/content").and_then(|c| c.as_str()) {
                                if !content.is_empty() {
                                    let delta_event = json!({
                                        "type": "response.text.delta",
                                        "delta": content
                                    });
                                    let sse_out = format!("event: response.text.delta\r\ndata: {}\r\n\r\n", delta_event);
                                    client_stream.write_all(sse_out.as_bytes()).await?;
                                }
                            }
                        }
                    }
                }
            }
        }

        Ok(())
    }

    /// Adapt Codex Responses request -> Anthropic Messages API -> SSE stream back to Codex.
    async fn forward_anthropic(
        &self,
        client_stream: &mut TcpStream,
        http_client: &reqwest::Client,
        route: &ProviderRoute,
        req: &Value,
    ) -> anyhow::Result<()> {
        let model = req.get("model")
            .and_then(|m| m.as_str())
            .or(route.default_model.as_deref())
            .unwrap_or("claude-3-5-sonnet-20241022");

        let (system_prompt, messages) = extract_anthropic_messages(req);
        let stream = req.get("stream").and_then(|s| s.as_bool()).unwrap_or(true);

        let mut anthropic_body = json!({
            "model": model,
            "max_tokens": 4096,
            "messages": messages,
            "stream": stream,
        });

        if let Some(sys) = system_prompt {
            anthropic_body["system"] = json!(sys);
        }

        let target_url = format!("{}/v1/messages", route.target_base_url.trim_end_matches('/'));
        let mut headers = HeaderMap::new();
        headers.insert("x-api-key", HeaderValue::from_str(&route.api_key).unwrap_or(HeaderValue::from_static("")));
        headers.insert("anthropic-version", HeaderValue::from_static("2023-06-01"));
        headers.insert(CONTENT_TYPE, HeaderValue::from_static("application/json"));

        let upstream_resp = match http_client.post(&target_url).headers(headers).json(&anthropic_body).send().await {
            Ok(r) => r,
            Err(e) => {
                let err_msg = json!({ "error": { "message": format!("Anthropic upstream error: {e}") } }).to_string();
                let resp = format!("HTTP/1.1 502 Bad Gateway\r\nContent-Type: application/json\r\nContent-Length: {}\r\n\r\n{}", err_msg.len(), err_msg);
                client_stream.write_all(resp.as_bytes()).await?;
                return Ok(());
            }
        };

        if !upstream_resp.status().is_success() {
            let status = upstream_resp.status().as_u16();
            let body = upstream_resp.text().await.unwrap_or_default();
            let resp = format!("HTTP/1.1 {} Error\r\nContent-Type: application/json\r\nContent-Length: {}\r\n\r\n{}", status, body.len(), body);
            client_stream.write_all(resp.as_bytes()).await?;
            return Ok(());
        }

        client_stream.write_all(b"HTTP/1.1 200 OK\r\nContent-Type: text/event-stream\r\nCache-Control: no-cache\r\nConnection: keep-alive\r\n\r\n").await?;

        let mut stream_bytes = upstream_resp.bytes_stream();
        let mut sse_buffer = String::new();

        while let Some(chunk_res) = stream_bytes.next().await {
            if let Ok(chunk) = chunk_res {
                let text = String::from_utf8_lossy(&chunk);
                sse_buffer.push_str(&text);

                while let Some(pos) = sse_buffer.find('\n') {
                    let line = sse_buffer[..pos].trim_end_matches('\r').to_string();
                    sse_buffer = sse_buffer[pos + 1..].to_string();

                    if line.starts_with("data: ") {
                        let payload = line.trim_start_matches("data: ").trim();
                        if let Ok(v) = serde_json::from_str::<Value>(payload) {
                            if let Some(delta) = v.pointer("/delta/text").and_then(|d| d.as_str()) {
                                if !delta.is_empty() {
                                    let delta_event = json!({
                                        "type": "response.text.delta",
                                        "delta": delta
                                    });
                                    let sse_out = format!("event: response.text.delta\r\ndata: {}\r\n\r\n", delta_event);
                                    client_stream.write_all(sse_out.as_bytes()).await?;
                                }
                            }
                            if v.get("type").and_then(|t| t.as_str()) == Some("message_stop") {
                                let completed_event = "event: response.completed\r\ndata: {\"status\":\"completed\"}\r\n\r\n";
                                client_stream.write_all(completed_event.as_bytes()).await?;
                            }
                        }
                    }
                }
            }
        }

        Ok(())
    }

    /// Adapt Codex Responses request -> Ollama Chat API -> SSE stream back to Codex.
    async fn forward_ollama(
        &self,
        client_stream: &mut TcpStream,
        http_client: &reqwest::Client,
        route: &ProviderRoute,
        req: &Value,
    ) -> anyhow::Result<()> {
        let model = req.get("model")
            .and_then(|m| m.as_str())
            .or(route.default_model.as_deref())
            .unwrap_or("llama3");

        let messages = extract_chat_messages(req);
        let ollama_body = json!({
            "model": model,
            "messages": messages,
            "stream": true,
        });

        let target_url = format!("{}/api/chat", route.target_base_url.trim_end_matches('/'));
        let mut req_builder = http_client.post(&target_url).json(&ollama_body);

        if !route.api_key.is_empty() {
            req_builder = req_builder.header(AUTHORIZATION, format!("Bearer {}", route.api_key));
        }

        let upstream_resp = match req_builder.send().await {
            Ok(r) => r,
            Err(e) => {
                let err_msg = json!({ "error": { "message": format!("Ollama upstream error: {e}") } }).to_string();
                let resp = format!("HTTP/1.1 502 Bad Gateway\r\nContent-Type: application/json\r\nContent-Length: {}\r\n\r\n{}", err_msg.len(), err_msg);
                client_stream.write_all(resp.as_bytes()).await?;
                return Ok(());
            }
        };

        client_stream.write_all(b"HTTP/1.1 200 OK\r\nContent-Type: text/event-stream\r\nCache-Control: no-cache\r\nConnection: keep-alive\r\n\r\n").await?;

        let mut stream_bytes = upstream_resp.bytes_stream();
        let mut line_buffer = String::new();

        while let Some(chunk_res) = stream_bytes.next().await {
            if let Ok(chunk) = chunk_res {
                let text = String::from_utf8_lossy(&chunk);
                line_buffer.push_str(&text);

                while let Some(pos) = line_buffer.find('\n') {
                    let line = line_buffer[..pos].trim_end_matches('\r').to_string();
                    line_buffer = line_buffer[pos + 1..].to_string();

                    if line.is_empty() {
                        continue;
                    }

                    if let Ok(v) = serde_json::from_str::<Value>(&line) {
                        if let Some(content) = v.pointer("/message/content").and_then(|c| c.as_str()) {
                            if !content.is_empty() {
                                let delta_event = json!({
                                    "type": "response.text.delta",
                                    "delta": content
                                });
                                let sse_out = format!("event: response.text.delta\r\ndata: {}\r\n\r\n", delta_event);
                                client_stream.write_all(sse_out.as_bytes()).await?;
                            }
                        }
                        if v.get("done").and_then(|d| d.as_bool()).unwrap_or(false) {
                            let completed_event = "event: response.completed\r\ndata: {\"status\":\"completed\"}\r\n\r\n";
                            client_stream.write_all(completed_event.as_bytes()).await?;
                        }
                    }
                }
            }
        }

        Ok(())
    }
}

fn find_subsequence(haystack: &[u8], needle: &[u8]) -> Option<usize> {
    haystack.windows(needle.len()).position(|window| window == needle)
}

/// Extract standard OpenAI-format messages from Codex `responses` body input.
fn extract_chat_messages(req: &Value) -> Vec<Value> {
    let mut out = Vec::new();
    if let Some(input) = req.get("input").and_then(|i| i.as_array()) {
        for item in input {
            let role = item.get("role").and_then(|r| r.as_str()).unwrap_or("user");
            let mut text_parts = Vec::new();

            if let Some(content_str) = item.get("content").and_then(|c| c.as_str()) {
                text_parts.push(content_str.to_string());
            } else if let Some(content_arr) = item.get("content").and_then(|c| c.as_array()) {
                for c in content_arr {
                    if let Some(text) = c.get("text").and_then(|t| t.as_str()) {
                        text_parts.push(text.to_string());
                    }
                }
            }

            out.push(json!({
                "role": role,
                "content": text_parts.join("\n")
            }));
        }
    }
    if out.is_empty() {
        out.push(json!({
            "role": "user",
            "content": "Hello"
        }));
    }
    out
}

/// Extract system string + messages array for Anthropic.
fn extract_anthropic_messages(req: &Value) -> (Option<String>, Vec<Value>) {
    let all = extract_chat_messages(req);
    let mut system_lines = Vec::new();
    let mut messages = Vec::new();

    for msg in all {
        let role = msg.get("role").and_then(|r| r.as_str()).unwrap_or("user");
        let content = msg.get("content").and_then(|c| c.as_str()).unwrap_or("");
        if role == "system" {
            system_lines.push(content.to_string());
        } else {
            messages.push(json!({
                "role": if role == "assistant" { "assistant" } else { "user" },
                "content": content
            }));
        }
    }

    let sys = if system_lines.is_empty() {
        None
    } else {
        Some(system_lines.join("\n\n"))
    };

    (sys, messages)
}
