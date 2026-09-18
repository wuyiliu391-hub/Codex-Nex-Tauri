//! Protocol adapter / gateway for custom model providers.
//!
//! Codex engine 0.154 natively requires `wire_api = "responses"` (calling `/v1/responses`).
//! Many third-party providers only offer OpenAI Chat (`/v1/chat/completions`), Anthropic
//! Messages (`/v1/messages`), or Ollama (`/api/chat`).
//!
//! This module runs a lightweight local HTTP server (default `http://127.0.0.1:17458`) that:
//! 1. Receives standard `POST /v1/responses` requests from the Codex engine.
//! 2. Adapts the request body into the upstream provider's protocol (Chat, Anthropic, or Ollama) —
//!    including the `tools` array and the `function_call` / `function_call_output` history items,
//!    so the model can actually call Codex tools (shell, apply_patch, …).
//! 3. Forwards the request to the upstream target `base_url`.
//! 4. Adapts streaming response chunks back into the **spec-compliant** Responses SSE event
//!    stream the engine expects: `response.created` → `response.output_item.added` →
//!    `response.output_text.delta` → `response.output_item.done` → `response.completed`.

use reqwest::header::{HeaderMap, HeaderValue, AUTHORIZATION, CONTENT_TYPE};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::collections::BTreeMap;
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
        if method == "POST" && (path.starts_with("/v1/responses") || path.starts_with("/responses"))
        {
            let route = self.state.get_active_route();
            if let Some(route) = route {
                self.forward_responses_request(&mut stream, &route, &body_bytes)
                    .await?;
                return Ok(());
            } else {
                let err_body = json!({
                    "error": {
                        "message": "No active provider route configured in Codex adapter",
                        "type": "invalid_request_error"
                    }
                })
                .to_string();
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
                self.forward_anthropic(client_stream, &http_client, route, &codex_req)
                    .await
            }
            "ollama" => {
                self.forward_ollama(client_stream, &http_client, route, &codex_req)
                    .await
            }
            // Default: openai_chat
            _ => {
                self.forward_openai_chat(client_stream, &http_client, route, &codex_req)
                    .await
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
        let model = req
            .get("model")
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
        // Reasoning effort (sidebar "思考等级") passes through for o-series /
        // reasoning-capable gateways; plain chat models ignore or reject it
        // upstream, which surfaces as a normal provider error.
        if let Some(effort) = req.pointer("/reasoning/effort").and_then(|e| e.as_str()) {
            if !effort.is_empty() {
                chat_body["reasoning_effort"] = json!(effort);
            }
        }
        if let Some(tools) = convert_tools_chat(req.get("tools")) {
            chat_body["tools"] = tools;
        }

        let target_url = format!(
            "{}/chat/completions",
            route.target_base_url.trim_end_matches('/')
        );
        let mut req_builder = http_client.post(&target_url).json(&chat_body);

        if !route.api_key.is_empty() {
            req_builder = req_builder.header(AUTHORIZATION, format!("Bearer {}", route.api_key));
        }

        let mut upstream_resp = match req_builder.send().await {
            Ok(r) => r,
            Err(e) => {
                let err_msg = json!({
                    "error": { "message": format!("Upstream error: {e}"), "type": "gateway_error" }
                })
                .to_string();
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

        let mut emitter = ResponsesEmitter::new(client_stream);
        emitter.begin().await?;
        let mut tool_agg = ChatToolAgg::default();
        let mut sse_buffer = String::new();

        while let Ok(Some(chunk)) = upstream_resp.chunk().await {
            let text = String::from_utf8_lossy(&chunk);
            sse_buffer.push_str(&text);

            while let Some(pos) = sse_buffer.find('\n') {
                let line = sse_buffer[..pos].trim_end_matches('\r').to_string();
                sse_buffer = sse_buffer[pos + 1..].to_string();

                if !line.starts_with("data: ") {
                    continue;
                }
                let payload = line.trim_start_matches("data: ").trim();
                if payload == "[DONE]" {
                    sse_buffer.clear();
                    break;
                }
                let Ok(v) = serde_json::from_str::<Value>(payload) else {
                    continue;
                };
                let delta = &v["choices"][0]["delta"];
                if let Some(content) = delta.get("content").and_then(|c| c.as_str()) {
                    if !content.is_empty() {
                        emitter.text_delta(content).await?;
                    }
                }
                if let Some(tcs) = delta.get("tool_calls").and_then(|t| t.as_array()) {
                    tool_agg.feed(tcs);
                }
            }
        }

        // Flush aggregated tool calls as function_call items, then close the turn.
        for (id, name, args) in tool_agg.drain() {
            emitter.function_call(&name, &args, &id).await?;
        }
        emitter.completed().await?;

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
        let model = req
            .get("model")
            .and_then(|m| m.as_str())
            .or(route.default_model.as_deref())
            .unwrap_or("claude-3-5-sonnet-20241022");

        let (system_prompt, messages, tools) = extract_anthropic_messages(req);
        let stream = req.get("stream").and_then(|s| s.as_bool()).unwrap_or(true);

        let mut anthropic_body = json!({
            "model": model,
            "max_tokens": 8192,
            "messages": messages,
            "stream": stream,
        });

        if let Some(sys) = system_prompt {
            anthropic_body["system"] = json!(sys);
        }
        if let Some(tools) = tools {
            anthropic_body["tools"] = tools;
        }

        let target_url = format!(
            "{}/v1/messages",
            route.target_base_url.trim_end_matches('/')
        );
        let mut headers = HeaderMap::new();
        headers.insert(
            "x-api-key",
            HeaderValue::from_str(&route.api_key).unwrap_or(HeaderValue::from_static("")),
        );
        headers.insert("anthropic-version", HeaderValue::from_static("2023-06-01"));
        headers.insert(CONTENT_TYPE, HeaderValue::from_static("application/json"));

        let mut upstream_resp = match http_client
            .post(&target_url)
            .headers(headers)
            .json(&anthropic_body)
            .send()
            .await
        {
            Ok(r) => r,
            Err(e) => {
                let err_msg =
                    json!({ "error": { "message": format!("Anthropic upstream error: {e}") } })
                        .to_string();
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

        let mut emitter = ResponsesEmitter::new(client_stream);
        emitter.begin().await?;
        let mut sse_buffer = String::new();
        // Currently-open Anthropic tool_use block: (tool_use_id, name, args json)
        let mut cur_tool: Option<(String, String, String)> = None;

        while let Ok(Some(chunk)) = upstream_resp.chunk().await {
            let text = String::from_utf8_lossy(&chunk);
            sse_buffer.push_str(&text);

            while let Some(pos) = sse_buffer.find('\n') {
                let line = sse_buffer[..pos].trim_end_matches('\r').to_string();
                sse_buffer = sse_buffer[pos + 1..].to_string();

                if !line.starts_with("data: ") {
                    continue;
                }
                let payload = line.trim_start_matches("data: ").trim();
                let Ok(v) = serde_json::from_str::<Value>(payload) else {
                    continue;
                };
                match v.get("type").and_then(|t| t.as_str()).unwrap_or("") {
                    "content_block_start" => {
                        let cb = &v["content_block"];
                        if cb.get("type").and_then(|t| t.as_str()) == Some("tool_use") {
                            cur_tool = Some((
                                cb.get("id").and_then(|i| i.as_str()).unwrap_or("").to_string(),
                                cb.get("name").and_then(|n| n.as_str()).unwrap_or("").to_string(),
                                String::new(),
                            ));
                        }
                    }
                    "content_block_delta" => {
                        let d = &v["delta"];
                        match d.get("type").and_then(|t| t.as_str()).unwrap_or("") {
                            "text_delta" => {
                                if let Some(t) = d.get("text").and_then(|t| t.as_str()) {
                                    if !t.is_empty() {
                                        emitter.text_delta(t).await?;
                                    }
                                }
                            }
                            "input_json_delta" => {
                                if let Some(p) = d.get("partial_json").and_then(|p| p.as_str()) {
                                    if let Some(tool) = cur_tool.as_mut() {
                                        tool.2.push_str(p);
                                    }
                                }
                            }
                            _ => {}
                        }
                    }
                    "content_block_stop" => {
                        if let Some((id, name, args)) = cur_tool.take() {
                            emitter.function_call(&name, &args, &id).await?;
                        }
                    }
                    "message_stop" => {
                        sse_buffer.clear();
                        break;
                    }
                    _ => {}
                }
            }
        }

        if let Some((id, name, args)) = cur_tool.take() {
            emitter.function_call(&name, &args, &id).await?;
        }
        emitter.completed().await?;

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
        let model = req
            .get("model")
            .and_then(|m| m.as_str())
            .or(route.default_model.as_deref())
            .unwrap_or("llama3");

        let messages = extract_chat_messages(req);
        let mut ollama_body = json!({
            "model": model,
            "messages": messages,
            "stream": true,
        });
        if let Some(tools) = convert_tools_chat(req.get("tools")) {
            ollama_body["tools"] = tools;
        }

        let target_url = format!("{}/api/chat", route.target_base_url.trim_end_matches('/'));
        let mut req_builder = http_client.post(&target_url).json(&ollama_body);

        if !route.api_key.is_empty() {
            req_builder = req_builder.header(AUTHORIZATION, format!("Bearer {}", route.api_key));
        }

        let mut upstream_resp = match req_builder.send().await {
            Ok(r) => r,
            Err(e) => {
                let err_msg =
                    json!({ "error": { "message": format!("Ollama upstream error: {e}") } })
                        .to_string();
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

        let mut emitter = ResponsesEmitter::new(client_stream);
        emitter.begin().await?;
        let mut line_buffer = String::new();
        let mut call_seq: u64 = 0;

        while let Ok(Some(chunk)) = upstream_resp.chunk().await {
            let text = String::from_utf8_lossy(&chunk);
            line_buffer.push_str(&text);

            while let Some(pos) = line_buffer.find('\n') {
                let line = line_buffer[..pos].trim_end_matches('\r').to_string();
                line_buffer = line_buffer[pos + 1..].to_string();

                if line.is_empty() {
                    continue;
                }
                let Ok(v) = serde_json::from_str::<Value>(&line) else {
                    continue;
                };
                let message = &v["message"];
                if let Some(content) = message.get("content").and_then(|c| c.as_str()) {
                    if !content.is_empty() {
                        emitter.text_delta(content).await?;
                    }
                }
                if let Some(tcs) = message.get("tool_calls").and_then(|t| t.as_array()) {
                    for tc in tcs {
                        call_seq += 1;
                        let name = tc
                            .pointer("/function/name")
                            .and_then(|n| n.as_str())
                            .unwrap_or("")
                            .to_string();
                        let args = match tc.pointer("/function/arguments") {
                            Some(Value::String(s)) => s.clone(),
                            Some(other) => other.to_string(),
                            None => "{}".to_string(),
                        };
                        let call_id = format!("call_{call_seq}");
                        emitter.function_call(&name, &args, &call_id).await?;
                    }
                }
                if v.get("done").and_then(|d| d.as_bool()).unwrap_or(false) {
                    line_buffer.clear();
                    break;
                }
            }
        }

        emitter.completed().await?;

        Ok(())
    }
}

// ── Responses SSE emitter ────────────────────────────────────────────────────

/// Emits the spec-shaped Responses event stream back to the Codex engine and
/// tracks the open assistant message so deltas / done items stay consistent.
struct ResponsesEmitter<'a> {
    stream: &'a mut TcpStream,
    output_index: u64,
    msg_open: bool,
    msg_text: String,
}

impl<'a> ResponsesEmitter<'a> {
    fn new(stream: &'a mut TcpStream) -> Self {
        Self {
            stream,
            output_index: 0,
            msg_open: false,
            msg_text: String::new(),
        }
    }

    async fn send(&mut self, body: &Value) -> anyhow::Result<()> {
        let kind = body.get("type").and_then(|t| t.as_str()).unwrap_or("");
        let frame = format!("event: {kind}\r\ndata: {body}\r\n\r\n");
        self.stream.write_all(frame.as_bytes()).await?;
        Ok(())
    }

    async fn begin(&mut self) -> anyhow::Result<()> {
        self.send(&json!({
            "type": "response.created",
            "response": { "id": "resp_adapter" }
        }))
        .await
    }

    async fn text_delta(&mut self, delta: &str) -> anyhow::Result<()> {
        if !self.msg_open {
            self.msg_open = true;
            self.msg_text.clear();
            let idx = self.output_index;
            self.send(&json!({
                "type": "response.output_item.added",
                "output_index": idx,
                "item": { "type": "message", "role": "assistant", "id": format!("msg_{idx}") }
            }))
            .await?;
        }
        self.msg_text.push_str(delta);
        let item_id = format!("msg_{}", self.output_index);
        self.send(&json!({
            "type": "response.output_text.delta",
            "item_id": item_id,
            "delta": delta
        }))
        .await
    }

    async fn close_msg(&mut self) -> anyhow::Result<()> {
        if !self.msg_open {
            return Ok(());
        }
        let idx = self.output_index;
        let text = std::mem::take(&mut self.msg_text);
        self.msg_open = false;
        self.send(&json!({
            "type": "response.output_item.done",
            "output_index": idx,
            "item": {
                "type": "message",
                "role": "assistant",
                "id": format!("msg_{idx}"),
                "content": [{ "type": "output_text", "text": text }]
            }
        }))
        .await?;
        self.output_index += 1;
        Ok(())
    }

    async fn function_call(&mut self, name: &str, args: &str, call_id: &str) -> anyhow::Result<()> {
        self.close_msg().await?;
        let idx = self.output_index;
        self.send(&json!({
            "type": "response.output_item.added",
            "output_index": idx,
            "item": {
                "type": "function_call",
                "id": format!("fc_{idx}"),
                "name": name,
                "call_id": call_id,
                "arguments": ""
            }
        }))
        .await?;
        self.send(&json!({
            "type": "response.output_item.done",
            "output_index": idx,
            "item": {
                "type": "function_call",
                "id": format!("fc_{idx}"),
                "name": name,
                "call_id": call_id,
                "arguments": args,
                "status": "completed"
            }
        }))
        .await?;
        self.output_index += 1;
        Ok(())
    }

    async fn completed(&mut self) -> anyhow::Result<()> {
        self.close_msg().await?;
        self.send(&json!({
            "type": "response.completed",
            "response": { "id": "resp_adapter" }
        }))
        .await
    }
}

// ── Upstream stream aggregation ──────────────────────────────────────────────

/// Aggregates incremental `delta.tool_calls` entries from an OpenAI Chat SSE
/// stream into complete function calls keyed by their index.
#[derive(Default)]
struct ChatToolAgg {
    calls: BTreeMap<u64, (String, String, String)>, // index -> (id, name, args)
}

impl ChatToolAgg {
    fn feed(&mut self, entries: &[Value]) {
        for tc in entries {
            let idx = tc
                .get("index")
                .and_then(|v| v.as_u64())
                .unwrap_or(self.calls.len() as u64);
            let entry = self
                .calls
                .entry(idx)
                .or_insert_with(|| (String::new(), String::new(), String::new()));
            if let Some(id) = tc.get("id").and_then(|v| v.as_str()) {
                if !id.is_empty() {
                    entry.0 = id.to_string();
                }
            }
            if let Some(f) = tc.get("function") {
                if let Some(n) = f.get("name").and_then(|v| v.as_str()) {
                    if !n.is_empty() {
                        entry.1 = n.to_string();
                    }
                }
                match f.get("arguments") {
                    Some(Value::String(s)) => entry.2.push_str(s),
                    Some(other) => entry.2.push_str(&other.to_string()),
                    None => {}
                }
            }
        }
    }

    fn drain(self) -> Vec<(String, String, String)> {
        self.calls.into_values().collect()
    }
}

// ── Request conversion helpers ───────────────────────────────────────────────

fn find_subsequence(haystack: &[u8], needle: &[u8]) -> Option<usize> {
    haystack
        .windows(needle.len())
        .position(|window| window == needle)
}

/// Flatten a message `content` (string or array of `{type,text}` parts) into text.
fn content_text_of(content: &Value) -> String {
    match content {
        Value::String(s) => s.clone(),
        Value::Array(arr) => {
            let mut parts = Vec::new();
            for c in arr {
                if let Some(t) = c.get("text").and_then(|v| v.as_str()) {
                    parts.push(t.to_string());
                }
            }
            parts.join("\n")
        }
        _ => String::new(),
    }
}

/// Convert the request's responses-format `tools` array into OpenAI Chat tools.
/// Non-function tools (local_shell, web_search, …) are dropped with a warning.
fn convert_tools_chat(tools: Option<&Value>) -> Option<Value> {
    let arr = tools?.as_array()?;
    let mut out = Vec::new();
    for t in arr {
        if t.get("type").and_then(|v| v.as_str()) == Some("function") {
            out.push(json!({
                "type": "function",
                "function": {
                    "name": t.get("name").cloned().unwrap_or(json!("")),
                    "description": t.get("description").cloned().unwrap_or(json!("")),
                    "parameters": t
                        .get("parameters")
                        .cloned()
                        .unwrap_or(json!({"type": "object", "properties": {}})),
                }
            }));
        } else {
            warn!(
                "adapter: dropping non-function tool {:?}",
                t.get("type").and_then(|v| v.as_str())
            );
        }
    }
    if out.is_empty() {
        None
    } else {
        Some(Value::Array(out))
    }
}

/// Convert responses tools into Anthropic tool definitions (input_schema).
fn convert_tools_anthropic(tools: Option<&Value>) -> Option<Value> {
    let arr = tools?.as_array()?;
    let mut out = Vec::new();
    for t in arr {
        if t.get("type").and_then(|v| v.as_str()) == Some("function") {
            out.push(json!({
                "name": t.get("name").cloned().unwrap_or(json!("")),
                "description": t.get("description").cloned().unwrap_or(json!("")),
                "input_schema": t
                    .get("parameters")
                    .cloned()
                    .unwrap_or(json!({"type": "object", "properties": {}})),
            }));
        }
    }
    if out.is_empty() {
        None
    } else {
        Some(Value::Array(out))
    }
}

/// Extract standard OpenAI-format messages from the Codex `responses` body,
/// translating the tool round-trip:
/// - `function_call` items -> assistant messages carrying `tool_calls`
///   (consecutive calls merge into one message, as chat requires)
/// - `function_call_output` items -> `role: "tool"` messages
fn extract_chat_messages(req: &Value) -> Vec<Value> {
    let mut out: Vec<Value> = Vec::new();
    let mut pending_calls: Vec<Value> = Vec::new();

    if let Some(instr) = req.get("instructions").and_then(|v| v.as_str()) {
        if !instr.is_empty() {
            out.push(json!({ "role": "system", "content": instr }));
        }
    }

    if let Some(input) = req.get("input").and_then(|i| i.as_array()) {
        for item in input {
            let itype = item.get("type").and_then(|t| t.as_str()).unwrap_or("");
            match itype {
                "function_call" => {
                    let call_id = item
                        .get("call_id")
                        .or_else(|| item.get("id"))
                        .cloned()
                        .unwrap_or(json!(format!("call_{}", pending_calls.len())));
                    pending_calls.push(json!({
                        "id": call_id,
                        "type": "function",
                        "function": {
                            "name": item.get("name").cloned().unwrap_or(json!("")),
                            "arguments": item.get("arguments").cloned().unwrap_or(json!("{}")),
                        }
                    }));
                }
                "function_call_output" => {
                    if !pending_calls.is_empty() {
                        out.push(json!({ "role": "assistant", "tool_calls": pending_calls }));
                        pending_calls = Vec::new();
                    }
                    let call_id = item.get("call_id").cloned().unwrap_or(json!(""));
                    let output = match item.get("output") {
                        Some(Value::String(s)) => json!(s),
                        Some(other) => other.clone(),
                        None => json!(""),
                    };
                    out.push(json!({
                        "role": "tool",
                        "tool_call_id": call_id,
                        "content": output
                    }));
                }
                "reasoning" => {}
                _ => {
                    if !pending_calls.is_empty() {
                        out.push(json!({ "role": "assistant", "tool_calls": pending_calls }));
                        pending_calls = Vec::new();
                    }
                    let role = item
                        .get("role")
                        .and_then(|r| r.as_str())
                        .unwrap_or("user");
                    let text = content_text_of(item.get("content").unwrap_or(&Value::Null));
                    if text.is_empty() && itype != "message" {
                        continue;
                    }
                    out.push(json!({ "role": role, "content": text }));
                }
            }
        }
    }
    if !pending_calls.is_empty() {
        out.push(json!({ "role": "assistant", "tool_calls": pending_calls }));
    }
    if out.is_empty() {
        out.push(json!({ "role": "user", "content": "Hello" }));
    }
    out
}

/// Append content blocks for one side of the conversation, merging into the
/// trailing message when it belongs to the same role.
fn push_blocks(messages: &mut Vec<(bool, Vec<Value>)>, assistant: bool, blocks: Vec<Value>) {
    if blocks.is_empty() {
        return;
    }
    if let Some(last) = messages.last_mut() {
        if last.0 == assistant {
            last.1.extend(blocks);
            return;
        }
    }
    messages.push((assistant, blocks));
}

/// Extract system string + messages array + tools for Anthropic, translating
/// the tool round-trip into `tool_use` / `tool_result` content blocks.
fn extract_anthropic_messages(req: &Value) -> (Option<String>, Vec<Value>, Option<Value>) {
    let mut system_lines: Vec<String> = Vec::new();
    if let Some(instr) = req.get("instructions").and_then(|v| v.as_str()) {
        if !instr.is_empty() {
            system_lines.push(instr.to_string());
        }
    }

    // Anthropic requires strict user/assistant alternation, so blocks for the
    // same side are merged into one message as they arrive.
    let mut messages: Vec<(bool, Vec<Value>)> = Vec::new();

    if let Some(input) = req.get("input").and_then(|i| i.as_array()) {
        for item in input {
            let itype = item.get("type").and_then(|t| t.as_str()).unwrap_or("");
            match itype {
                "function_call" => {
                    let input_val = serde_json::from_str::<Value>(
                        item.get("arguments").and_then(|v| v.as_str()).unwrap_or("{}"),
                    )
                    .unwrap_or(json!({}));
                    let call_id = item
                        .get("call_id")
                        .or_else(|| item.get("id"))
                        .cloned()
                        .unwrap_or(json!("call_0"));
                    push_blocks(
                        &mut messages,
                        true,
                        vec![json!({
                            "type": "tool_use",
                            "id": call_id,
                            "name": item.get("name").cloned().unwrap_or(json!("")),
                            "input": input_val,
                        })],
                    );
                }
                "function_call_output" => {
                    let out_text = match item.get("output") {
                        Some(Value::String(s)) => s.clone(),
                        Some(other) => other.to_string(),
                        None => String::new(),
                    };
                    let call_id = item.get("call_id").cloned().unwrap_or(json!(""));
                    push_blocks(
                        &mut messages,
                        false,
                        vec![json!({
                            "type": "tool_result",
                            "tool_use_id": call_id,
                            "content": out_text,
                        })],
                    );
                }
                "reasoning" => {}
                _ => {
                    let role = item
                        .get("role")
                        .and_then(|r| r.as_str())
                        .unwrap_or("user");
                    let text = content_text_of(item.get("content").unwrap_or(&Value::Null));
                    if role == "system" {
                        if !text.is_empty() {
                            system_lines.push(text);
                        }
                        continue;
                    }
                    if text.is_empty() {
                        continue;
                    }
                    push_blocks(
                        &mut messages,
                        role == "assistant",
                        vec![json!({ "type": "text", "text": text })],
                    );
                }
            }
        }
    }

    let messages_json = messages
        .into_iter()
        .map(|(assistant, blocks)| {
            json!({
                "role": if assistant { "assistant" } else { "user" },
                "content": blocks
            })
        })
        .collect();

    let sys = if system_lines.is_empty() {
        None
    } else {
        Some(system_lines.join("\n\n"))
    };

    (sys, messages_json, convert_tools_anthropic(req.get("tools")))
}
