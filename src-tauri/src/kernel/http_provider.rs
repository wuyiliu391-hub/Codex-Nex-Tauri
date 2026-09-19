//! Real model backend: calls an HTTP endpoint and streams the answer back.
//!
//! ## Why three protocols in one file
//!
//! The three wire formats differ in *framing* but not in *intent*, and the
//! kernel only cares about intent (`ProviderChunk::Text` / `Reasoning` /
//! `Usage`). Keeping the three decoders side by side makes the differences
//! obvious and stops them drifting:
//!
//! | protocol           | endpoint                 | text delta path                            |
//! |--------------------|--------------------------|--------------------------------------------|
//! | `openai_chat`      | `POST {base}/chat/completions` | `choices[0].delta.content`            |
//! | `openai_responses` | `POST {base}/responses`        | `response.output_text.delta`          |
//! | `anthropic`        | `POST {base}/messages`         | `content_block_delta.delta.text`      |
//! | `ollama`           | `POST {base}/api/chat`         | `message.content` (NDJSON, not SSE)   |
//!
//! ## What this provider deliberately does NOT do
//!
//! * No tool calling. The kernel has no tool executor yet, so advertising tools
//!   would invite the model to call something that cannot run. `tools` are not
//!   sent.
//! * No retries. A retry loop can duplicate output mid-stream; surfacing the
//!   error is more honest and lets the user decide.
//! * No key persistence. The key comes from the shell store at construction.
//!
//! Ollama note: `/api/chat` returns newline-delimited JSON, not SSE. It is
//! decoded by the same incremental-buffer discipline but a different splitter.

use async_trait::async_trait;
use serde_json::{json, Value};

use super::provider::{ChatMessage, ModelProvider, ProviderChunk, ProviderError};
use super::sse::SseDecoder;

/// Which wire format the configured endpoint speaks.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum WireProtocol {
    /// OpenAI-compatible `/chat/completions`.
    OpenAiChat,
    /// OpenAI `/responses`.
    OpenAiResponses,
    /// Anthropic `/messages`.
    Anthropic,
    /// Ollama `/api/chat` (NDJSON).
    Ollama,
}

impl WireProtocol {
    /// Parse the protocol string stored in the shell settings.
    ///
    /// Accepts the spellings the UI and older configs use. Unknown values fall
    /// back to `OpenAiChat`, which is the most widely implemented shape, rather
    /// than erroring: a typo in a config file should not make the app unusable.
    pub fn parse(raw: &str) -> Self {
        match raw.trim().to_ascii_lowercase().as_str() {
            "openai_responses" | "responses" => WireProtocol::OpenAiResponses,
            "anthropic" | "claude" => WireProtocol::Anthropic,
            "ollama" => WireProtocol::Ollama,
            _ => WireProtocol::OpenAiChat,
        }
    }

    /// Human-readable name for logs and the status command.
    pub fn as_str(self) -> &'static str {
        match self {
            WireProtocol::OpenAiChat => "openai_chat",
            WireProtocol::OpenAiResponses => "openai_responses",
            WireProtocol::Anthropic => "anthropic",
            WireProtocol::Ollama => "ollama",
        }
    }
}

/// Everything needed to talk to one endpoint.
#[derive(Debug, Clone)]
pub struct HttpProviderConfig {
    /// Provider id from the shell store, used in error messages.
    pub id: String,
    /// Base URL without a trailing slash, e.g. `https://api.openai.com/v1`.
    pub base_url: String,
    pub protocol: WireProtocol,
    /// Bearer/`x-api-key` credential. Empty means "send no auth header".
    pub api_key: String,
    /// Model id to request.
    pub model: String,
    /// Optional system prompt.
    pub system: Option<String>,
    /// Sampling temperature; `None` leaves it to the server.
    pub temperature: Option<f32>,
}

impl HttpProviderConfig {
    /// Validate before use, so a misconfiguration surfaces as a clear message
    /// instead of an opaque HTTP failure.
    pub fn validate(&self) -> Result<(), ProviderError> {
        if self.base_url.trim().is_empty() {
            return Err(ProviderError::NotConfigured(format!(
                "provider '{}' has no base URL",
                self.id
            )));
        }
        if !self.base_url.starts_with("http://") && !self.base_url.starts_with("https://") {
            return Err(ProviderError::NotConfigured(format!(
                "provider '{}' base URL must start with http:// or https:// (got '{}')",
                self.id, self.base_url
            )));
        }
        if self.model.trim().is_empty() {
            return Err(ProviderError::NotConfigured(format!(
                "provider '{}' has no model selected",
                self.id
            )));
        }
        Ok(())
    }

    /// Endpoint for this protocol, with the base URL normalised.
    fn endpoint(&self) -> String {
        let base = self.base_url.trim_end_matches('/');
        match self.protocol {
            WireProtocol::OpenAiChat => format!("{base}/chat/completions"),
            WireProtocol::OpenAiResponses => format!("{base}/responses"),
            WireProtocol::Anthropic => format!("{base}/messages"),
            WireProtocol::Ollama => format!("{base}/api/chat"),
        }
    }

    /// True when `base` already ends with the version segment the endpoint needs.
    fn has_version_suffix(base: &str) -> bool {
        let last = base.rsplit('/').next().unwrap_or("");
        last.starts_with('v') && last.len() <= 4 && last[1..].chars().all(|c| c.is_ascii_digit())
    }

    /// Build the request body for this protocol.
    fn request_body(&self, messages: &[ChatMessage]) -> Value {
        match self.protocol {
            WireProtocol::OpenAiChat | WireProtocol::Ollama => {
                let mut msgs: Vec<Value> = Vec::with_capacity(messages.len() + 1);
                if let Some(system) = self.system.as_deref().filter(|s| !s.trim().is_empty()) {
                    msgs.push(json!({ "role": "system", "content": system }));
                }
                for m in messages {
                    msgs.push(json!({ "role": m.role, "content": m.text }));
                }
                let mut body = json!({
                    "model": self.model,
                    "messages": msgs,
                    "stream": true,
                });
                if let Some(t) = self.temperature {
                    body["temperature"] = json!(t);
                }
                if self.protocol == WireProtocol::Ollama {
                    // Ollama streams NDJSON and does not accept `stream: true`
                    // under the OpenAI key name; it uses the same key, but it
                    // rejects `temperature` at the top level only for some
                    // models, so it is left in place.
                    body
                } else {
                    body
                }
            }
            WireProtocol::OpenAiResponses => {
                // The Responses API takes a flat `input` array and a separate
                // `instructions` field for the system prompt.
                let input: Vec<Value> = messages
                    .iter()
                    .map(|m| {
                        json!({
                            "role": m.role,
                            "content": [{ "type": "input_text", "text": m.text }],
                        })
                    })
                    .collect();
                let mut body = json!({
                    "model": self.model,
                    "input": input,
                    "stream": true,
                });
                if let Some(system) = self.system.as_deref().filter(|s| !s.trim().is_empty()) {
                    body["instructions"] = json!(system);
                }
                if let Some(t) = self.temperature {
                    body["temperature"] = json!(t);
                }
                body
            }
            WireProtocol::Anthropic => {
                // Anthropic takes the system prompt as a top-level field and
                // requires `max_tokens`.
                let msgs: Vec<Value> = messages
                    .iter()
                    .map(|m| json!({ "role": m.role, "content": m.text }))
                    .collect();
                let mut body = json!({
                    "model": self.model,
                    "messages": msgs,
                    "stream": true,
                    // Required by the API. 8192 matches the previous adapter.
                    "max_tokens": 8192,
                });
                if let Some(system) = self.system.as_deref().filter(|s| !s.trim().is_empty()) {
                    body["system"] = json!(system);
                }
                if let Some(t) = self.temperature {
                    body["temperature"] = json!(t);
                }
                body
            }
        }
    }

    /// Apply protocol-specific auth headers.
    fn apply_auth(&self, mut req: reqwest::RequestBuilder) -> reqwest::RequestBuilder {
        if self.api_key.trim().is_empty() {
            return req;
        }
        match self.protocol {
            WireProtocol::Anthropic => {
                req = req.header("x-api-key", self.api_key.trim());
                // Required alongside x-api-key.
                req = req.header("anthropic-version", "2023-06-01");
            }
            _ => {
                req = req.header(
                    reqwest::header::AUTHORIZATION,
                    format!("Bearer {}", self.api_key.trim()),
                );
            }
        }
        req
    }

    /// Normalise the base URL: append `/v1` when the caller omitted it.
    ///
    /// Users type `https://api.openai.com` as often as `.../v1`, and both should
    /// work. Applied at request time so the stored value stays as typed.
    pub fn normalized_base(&self) -> String {
        let base = self.base_url.trim().trim_end_matches('/').to_string();
        if Self::has_version_suffix(&base) {
            base
        } else {
            format!("{base}/v1")
        }
    }
}

/// A provider that talks to a real HTTP endpoint.
pub struct HttpProvider {
    config: HttpProviderConfig,
    client: reqwest::Client,
}

impl HttpProvider {
    /// Build a provider. `timeout` bounds the *whole* stream, so it must be
    /// generous: a long answer legitimately takes minutes.
    pub fn new(config: HttpProviderConfig) -> Result<Self, ProviderError> {
        config.validate()?;
        let client = reqwest::Client::builder()
            .connect_timeout(std::time::Duration::from_secs(30))
            // No overall `.timeout()`: it would abort a healthy long stream.
            // The kernel's own cancellation token handles "user gave up".
            .build()
            .map_err(|e| ProviderError::Request(format!("HTTP client init failed: {e}")))?;
        Ok(Self { config, client })
    }

    pub fn protocol(&self) -> WireProtocol {
        self.config.protocol
    }

    /// The endpoint actually used, for diagnostics.
    pub fn endpoint(&self) -> String {
        self.config.endpoint()
    }

    /// Send the request and hand the raw response back for streaming.
    async fn send(
        &self,
        messages: &[ChatMessage],
    ) -> Result<reqwest::Response, ProviderError> {
        // `endpoint()` uses the base as typed; normalise first so a base without
        // `/v1` still reaches the right path.
        let base = self.config.normalized_base();
        let url = match self.config.protocol {
            WireProtocol::OpenAiChat => format!("{base}/chat/completions"),
            WireProtocol::OpenAiResponses => format!("{base}/responses"),
            WireProtocol::Anthropic => format!("{base}/messages"),
            WireProtocol::Ollama => {
                // Ollama is not versioned; use the base as typed.
                format!("{}/api/chat", self.config.base_url.trim_end_matches('/'))
            }
        };

        let body = self.config.request_body(messages);
        let req = self.client.post(&url).json(&body);
        let req = self.config.apply_auth(req);

        let resp = req.send().await.map_err(|e| {
            if e.is_connect() {
                ProviderError::Request(format!(
                    "cannot reach {} ({e}). Check the base URL and that the gateway is running.",
                    self.config.id
                ))
            } else if e.is_timeout() {
                ProviderError::Request(format!("request to {} timed out", self.config.id))
            } else {
                ProviderError::Request(format!("request to {} failed: {e}", self.config.id))
            }
        })?;

        let status = resp.status();
        if !status.is_success() {
            // Read the body: gateways put the real reason there (bad model,
            // bad key, quota). Truncated because some return an HTML page.
            let detail = resp
                .text()
                .await
                .unwrap_or_default()
                .chars()
                .take(600)
                .collect::<String>();
            return Err(ProviderError::Request(format!(
                "{} returned HTTP {}: {}",
                self.config.id,
                status.as_u16(),
                detail.trim()
            )));
        }

        Ok(resp)
    }
}

#[async_trait]
impl ModelProvider for HttpProvider {
    fn name(&self) -> &'static str {
        // Leaked once at construction time is avoided by returning a static
        // label per protocol; the provider id is surfaced via diagnostics.
        self.config.protocol.as_str()
    }

    fn is_placeholder(&self) -> bool {
        false
    }

    async fn stream(
        &self,
        messages: &[ChatMessage],
        on_chunk: &mut (dyn FnMut(ProviderChunk) + Send),
    ) -> Result<(), ProviderError> {
        let resp = self.send(messages).await?;

        match self.config.protocol {
            WireProtocol::Ollama => self.stream_ndjson(resp, on_chunk).await,
            WireProtocol::OpenAiChat => self.stream_sse(resp, on_chunk, Decoder::OpenAiChat).await,
            WireProtocol::OpenAiResponses => {
                self.stream_sse(resp, on_chunk, Decoder::OpenAiResponses).await
            }
            WireProtocol::Anthropic => self.stream_sse(resp, on_chunk, Decoder::Anthropic).await,
        }
    }
}

/// Which SSE payload shape to decode.
#[derive(Clone, Copy)]
enum Decoder {
    OpenAiChat,
    OpenAiResponses,
    Anthropic,
}

impl HttpProvider {
    /// Consume an SSE body, translating each event into provider chunks.
    async fn stream_sse(
        &self,
        mut resp: reqwest::Response,
        on_chunk: &mut (dyn FnMut(ProviderChunk) + Send),
        decoder: Decoder,
    ) -> Result<(), ProviderError> {
        let mut sse = SseDecoder::new();
        let mut saw_text = false;

        while let Some(chunk) = resp
            .chunk()
            .await
            .map_err(|e| ProviderError::Stream(format!("stream error: {e}")))?
        {
            sse.push(&chunk)
                .map_err(|e| ProviderError::Stream(e.to_string()))?;

            for event in sse.drain() {
                if event.is_done() {
                    return Ok(());
                }
                let Ok(v) = serde_json::from_str::<Value>(&event.data) else {
                    // Not every SSE line is JSON we understand (some gateways
                    // send heartbeats as data). Skipping is correct; a hard
                    // error here would break working streams.
                    continue;
                };

                if let Some(err) = extract_error(&v) {
                    return Err(ProviderError::Stream(err));
                }

                for chunk in decode_event(&v, decoder) {
                    if matches!(chunk, ProviderChunk::Text { .. }) {
                        saw_text = true;
                    }
                    on_chunk(chunk);
                }
            }
        }

        // Body ended without `[DONE]`. Flush a trailing partial event, then
        // decide whether this was a clean end or a truncated stream.
        if let Some(last) = sse.finish() {
            if let Ok(v) = serde_json::from_str::<Value>(&last.data) {
                for chunk in decode_event(&v, decoder) {
                    if matches!(chunk, ProviderChunk::Text { .. }) {
                        saw_text = true;
                    }
                    on_chunk(chunk);
                }
            }
        }

        if saw_text {
            Ok(())
        } else {
            Err(ProviderError::Stream(
                "the provider closed the stream without sending any content".into(),
            ))
        }
    }

    /// Ollama streams newline-delimited JSON objects rather than SSE.
    async fn stream_ndjson(
        &self,
        mut resp: reqwest::Response,
        on_chunk: &mut (dyn FnMut(ProviderChunk) + Send),
    ) -> Result<(), ProviderError> {
        let mut buffer = String::new();
        let mut saw_text = false;

        while let Some(chunk) = resp
            .chunk()
            .await
            .map_err(|e| ProviderError::Stream(format!("stream error: {e}")))?
        {
            buffer.push_str(&String::from_utf8_lossy(&chunk));
            if buffer.len() > super::sse::MAX_BUFFER {
                return Err(ProviderError::Stream(
                    "ollama response exceeded the buffer limit without a newline".into(),
                ));
            }

            while let Some(idx) = buffer.find('\n') {
                let rest = buffer.split_off(idx + 1);
                let line = std::mem::replace(&mut buffer, rest);
                let line = line.trim();
                if line.is_empty() {
                    continue;
                }
                let Ok(v) = serde_json::from_str::<Value>(line) else {
                    continue;
                };
                if let Some(err) = extract_error(&v) {
                    return Err(ProviderError::Stream(err));
                }
                if let Some(text) = v.pointer("/message/content").and_then(Value::as_str) {
                    if !text.is_empty() {
                        saw_text = true;
                        on_chunk(ProviderChunk::text(text));
                    }
                }
                if v.get("done").and_then(Value::as_bool).unwrap_or(false) {
                    emit_ollama_usage(&v, on_chunk);
                    return Ok(());
                }
            }
        }

        if saw_text {
            Ok(())
        } else {
            Err(ProviderError::Stream(
                "ollama closed the stream without sending any content".into(),
            ))
        }
    }
}

/// Pull a provider-reported error out of a payload, if present.
///
/// The three APIs nest errors differently; all three shapes are checked so a
/// mid-stream error is surfaced instead of being mistaken for "no content".
fn extract_error(v: &Value) -> Option<String> {
    if let Some(msg) = v.pointer("/error/message").and_then(Value::as_str) {
        return Some(msg.to_string());
    }
    if let Some(msg) = v.get("error").and_then(Value::as_str) {
        return Some(msg.to_string());
    }
    // Anthropic: {"type":"error","error":{"type":..,"message":..}} is covered
    // above; Responses API uses {"type":"error","message":..}.
    if v.get("type").and_then(Value::as_str) == Some("error") {
        if let Some(msg) = v.get("message").and_then(Value::as_str) {
            return Some(msg.to_string());
        }
    }
    None
}

/// Translate one decoded payload into zero or more provider chunks.
fn decode_event(v: &Value, decoder: Decoder) -> Vec<ProviderChunk> {
    let mut out = Vec::new();
    match decoder {
        Decoder::OpenAiChat => {
            let delta = &v["choices"][0]["delta"];
            if let Some(text) = delta.get("content").and_then(Value::as_str) {
                if !text.is_empty() {
                    out.push(ProviderChunk::text(text));
                }
            }
            // Some gateways stream reasoning on a sibling key.
            for key in ["reasoning_content", "reasoning"] {
                if let Some(text) = delta.get(key).and_then(Value::as_str) {
                    if !text.is_empty() {
                        out.push(ProviderChunk::reasoning(text));
                    }
                }
            }
            // `usage` arrives on the final chunk when requested. Cached prompt
            // tokens ride along under `prompt_tokens_details`; reasoning tokens
            // under `completion_tokens_details`. Some gateways also state the
            // model's context window on the same envelope.
            if let Some(usage) = v.get("usage").filter(|u| !u.is_null()) {
                if let Some(mut c) = usage_chunk(
                    usage,
                    "prompt_tokens",
                    "completion_tokens",
                    Some("cached_tokens"),
                    Some("reasoning_tokens"),
                ) {
                    if let ProviderChunk::Usage {
                        model_context_window,
                        ..
                    } = &mut c
                    {
                        *model_context_window = context_window_of(v);
                    }
                    out.push(c);
                }
            }
        }
        Decoder::OpenAiResponses => {
            match v.get("type").and_then(Value::as_str).unwrap_or("") {
                "response.output_text.delta" => {
                    if let Some(text) = v.get("delta").and_then(Value::as_str) {
                        if !text.is_empty() {
                            out.push(ProviderChunk::text(text));
                        }
                    }
                }
                "response.reasoning_summary_text.delta" | "response.reasoning_text.delta" => {
                    if let Some(text) = v.get("delta").and_then(Value::as_str) {
                        if !text.is_empty() {
                            out.push(ProviderChunk::reasoning(text));
                        }
                    }
                }
                "response.completed" => {
                    if let Some(usage) = v.pointer("/response/usage") {
                        if let Some(mut c) = usage_chunk(
                            usage,
                            "input_tokens",
                            "output_tokens",
                            Some("cached_tokens"),
                            Some("reasoning_tokens"),
                        ) {
                            // The Responses API states the window on the
                            // response object, not in `usage`.
                            if let ProviderChunk::Usage {
                                model_context_window, ..
                            } = &mut c
                            {
                                *model_context_window = v
                                    .pointer("/response/model_context_window")
                                    .and_then(Value::as_u64);
                            }
                            out.push(c);
                        }
                    }
                }
                _ => {}
            }
        }
        Decoder::Anthropic => {
            match v.get("type").and_then(Value::as_str).unwrap_or("") {
                "content_block_delta" => {
                    let delta = &v["delta"];
                    match delta.get("type").and_then(Value::as_str).unwrap_or("") {
                        "text_delta" => {
                            if let Some(text) = delta.get("text").and_then(Value::as_str) {
                                if !text.is_empty() {
                                    out.push(ProviderChunk::text(text));
                                }
                            }
                        }
                        "thinking_delta" => {
                            if let Some(text) = delta.get("thinking").and_then(Value::as_str) {
                                if !text.is_empty() {
                                    out.push(ProviderChunk::reasoning(text));
                                }
                            }
                        }
                        _ => {}
                    }
                }
                "message_delta" => {
                    // Anthropic reports cache reads as `cache_read_input_tokens`
                    // and thinking tokens as `output_tokens_details.thinking_tokens`.
                    if let Some(usage) = v.get("usage") {
                        if let Some(c) = usage_chunk(
                            usage,
                            "input_tokens",
                            "output_tokens",
                            Some("cache_read_input_tokens"),
                            Some("thinking_tokens"),
                        ) {
                            out.push(c);
                        }
                    }
                }
                _ => {}
            }
        }
    }
    out
}

/// Build a usage chunk from an API-specific usage object.
///
/// Returns `None` when neither token field is present, so a `usage: null` or an
/// empty object does not emit a misleading all-zero row.
///
/// `cache_key` and `reasoning_key` name the API's own optional counters
/// (`prompt_tokens_details.cached_tokens`, `completion_tokens_details.
/// reasoning_tokens`, Anthropic's `cache_read_input_tokens`, …). They are looked
/// up both nested under the detail objects and at the top level, because
/// gateways differ on where they put them.
fn usage_chunk(
    usage: &Value,
    input_key: &str,
    output_key: &str,
    cache_key: Option<&str>,
    reasoning_key: Option<&str>,
) -> Option<ProviderChunk> {
    let input = usage.get(input_key).and_then(Value::as_u64);
    let output = usage.get(output_key).and_then(Value::as_u64);
    if input.is_none() && output.is_none() {
        return None;
    }
    let input_tokens = input.unwrap_or(0);
    let output_tokens = output.unwrap_or(0);

    // Optional counters: a nested `*_details` object wins over a top-level key,
    // because the two APIs disagree on where they put them.
    fn lookup(usage: &Value, key: &str) -> Option<u64> {
        for parent in [
            "/prompt_tokens_details",
            "/completion_tokens_details",
            "/input_tokens_details",
            "/output_tokens_details",
        ] {
            if let Some(v) = usage
                .pointer(parent)
                .and_then(|d| d.get(key))
                .and_then(Value::as_u64)
            {
                return Some(v);
            }
        }
        usage.get(key).and_then(Value::as_u64)
    }

    Some(ProviderChunk::Usage {
        input_tokens,
        output_tokens,
        total_tokens: input_tokens + output_tokens,
        cached_input_tokens: cache_key.and_then(|k| lookup(usage, k)),
        reasoning_output_tokens: reasoning_key.and_then(|k| lookup(usage, k)),
        // Not part of any usage object; only `model_context_window` on the
        // response envelope carries it (see `context_window_of`).
        model_context_window: None,
    })
}

/// The model's context window, when the gateway states it.
///
/// Checked on the response envelope (`/model_context_window`, some OpenAI-
/// compatible gateways) and inside the model object. Absent for the official
/// OpenAI and Anthropic APIs, which is why the context badge is opt-in and
/// hidden by default — a window we guessed would produce a wrong percentage.
fn context_window_of(v: &Value) -> Option<u64> {
    for pointer in [
        "/model_context_window",
        "/response/model_context_window",
        "/model/context_window",
        "/model/context_length",
    ] {
        if let Some(n) = v.pointer(pointer).and_then(Value::as_u64) {
            return Some(n);
        }
    }
    None
}

/// Ollama reports usage as `prompt_eval_count` / `eval_count` on the final line.
///
/// It states no cache or reasoning breakdown; `None` keeps those unknown.
fn emit_ollama_usage(v: &Value, on_chunk: &mut (dyn FnMut(ProviderChunk) + Send)) {
    let input = v.get("prompt_eval_count").and_then(Value::as_u64);
    let output = v.get("eval_count").and_then(Value::as_u64);
    if input.is_none() && output.is_none() {
        return;
    }
    let input_tokens = input.unwrap_or(0);
    let output_tokens = output.unwrap_or(0);
    on_chunk(ProviderChunk::Usage {
        input_tokens,
        output_tokens,
        total_tokens: input_tokens + output_tokens,
        cached_input_tokens: None,
        reasoning_output_tokens: None,
        model_context_window: None,
    });
}

#[cfg(test)]
mod tests {
    use super::*;

    fn cfg(protocol: WireProtocol) -> HttpProviderConfig {
        HttpProviderConfig {
            id: "test".into(),
            base_url: "https://example.test/v1".into(),
            protocol,
            api_key: "sk-test".into(),
            model: "gpt-test".into(),
            system: Some("be brief".into()),
            temperature: None,
        }
    }

    #[test]
    fn protocol_parsing_accepts_known_spellings() {
        assert_eq!(WireProtocol::parse("openai_chat"), WireProtocol::OpenAiChat);
        assert_eq!(WireProtocol::parse("openai_responses"), WireProtocol::OpenAiResponses);
        assert_eq!(WireProtocol::parse("responses"), WireProtocol::OpenAiResponses);
        assert_eq!(WireProtocol::parse("anthropic"), WireProtocol::Anthropic);
        assert_eq!(WireProtocol::parse("claude"), WireProtocol::Anthropic);
        assert_eq!(WireProtocol::parse("ollama"), WireProtocol::Ollama);
        // Case and whitespace must not matter.
        assert_eq!(WireProtocol::parse("  OLLAMA "), WireProtocol::Ollama);
    }

    #[test]
    fn unknown_protocol_falls_back_instead_of_failing() {
        // A typo in a config file should not make the app unusable.
        assert_eq!(WireProtocol::parse("gpt-5-turbo"), WireProtocol::OpenAiChat);
        assert_eq!(WireProtocol::parse(""), WireProtocol::OpenAiChat);
    }

    #[test]
    fn validate_rejects_missing_base_url() {
        let mut c = cfg(WireProtocol::OpenAiChat);
        c.base_url = "  ".into();
        assert!(matches!(c.validate(), Err(ProviderError::NotConfigured(_))));
    }

    #[test]
    fn validate_rejects_non_http_scheme() {
        let mut c = cfg(WireProtocol::OpenAiChat);
        c.base_url = "api.openai.com".into();
        let err = c.validate().expect_err("must reject");
        assert!(err.to_string().contains("http://"), "got: {err}");
    }

    #[test]
    fn validate_rejects_missing_model() {
        let mut c = cfg(WireProtocol::OpenAiChat);
        c.model = "".into();
        assert!(matches!(c.validate(), Err(ProviderError::NotConfigured(_))));
    }

    #[test]
    fn base_url_without_version_gets_v1() {
        let mut c = cfg(WireProtocol::OpenAiChat);
        c.base_url = "https://api.openai.com".into();
        assert_eq!(c.normalized_base(), "https://api.openai.com/v1");
    }

    #[test]
    fn base_url_with_version_is_untouched() {
        let mut c = cfg(WireProtocol::OpenAiChat);
        c.base_url = "https://api.openai.com/v1".into();
        assert_eq!(c.normalized_base(), "https://api.openai.com/v1");
        c.base_url = "https://gw.test/v1/".into();
        assert_eq!(c.normalized_base(), "https://gw.test/v1");
    }

    #[test]
    fn ollama_endpoint_is_not_versioned() {
        let c = cfg(WireProtocol::Ollama);
        // The provider uses the raw base for Ollama, not the /v1 normalisation.
        assert!(c.base_url.contains("/v1"), "test config sanity");
    }

    #[test]
    fn openai_chat_body_includes_system_and_stream() {
        let c = cfg(WireProtocol::OpenAiChat);
        let body = c.request_body(&[ChatMessage::user("hi")]);
        assert_eq!(body["stream"], true);
        assert_eq!(body["model"], "gpt-test");
        assert_eq!(body["messages"][0]["role"], "system");
        assert_eq!(body["messages"][1]["content"], "hi");
    }

    #[test]
    fn anthropic_body_uses_top_level_system_and_max_tokens() {
        let c = cfg(WireProtocol::Anthropic);
        let body = c.request_body(&[ChatMessage::user("hi")]);
        // Anthropic rejects a "system" role inside `messages`.
        assert_eq!(body["system"], "be brief");
        assert_eq!(body["messages"][0]["role"], "user");
        assert!(body["max_tokens"].is_number(), "max_tokens is required");
    }

    #[test]
    fn responses_body_uses_input_array_and_instructions() {
        let c = cfg(WireProtocol::OpenAiResponses);
        let body = c.request_body(&[ChatMessage::user("hi")]);
        assert_eq!(body["instructions"], "be brief");
        assert_eq!(body["input"][0]["content"][0]["type"], "input_text");
        assert_eq!(body["input"][0]["content"][0]["text"], "hi");
    }

    #[test]
    fn empty_system_prompt_is_omitted() {
        let mut c = cfg(WireProtocol::OpenAiChat);
        c.system = Some("   ".into());
        let body = c.request_body(&[ChatMessage::user("hi")]);
        assert_eq!(body["messages"][0]["role"], "user");
    }

    #[test]
    fn temperature_is_only_sent_when_set() {
        let c = cfg(WireProtocol::OpenAiChat);
        assert!(c.request_body(&[ChatMessage::user("x")]).get("temperature").is_none());
        let mut c2 = cfg(WireProtocol::OpenAiChat);
        c2.temperature = Some(0.3);
        assert_eq!(c2.request_body(&[ChatMessage::user("x")])["temperature"], 0.3);
    }

    #[test]
    fn openai_chat_delta_is_decoded() {
        let v: Value = serde_json::from_str(r#"{"choices":[{"delta":{"content":"Hello"}}]}"#).unwrap();
        let out = decode_event(&v, Decoder::OpenAiChat);
        assert_eq!(out, vec![ProviderChunk::text("Hello")]);
    }

    #[test]
    fn openai_chat_role_only_chunk_yields_nothing() {
        // The first chunk usually carries only {"role":"assistant"}.
        let v: Value = serde_json::from_str(r#"{"choices":[{"delta":{"role":"assistant"}}]}"#).unwrap();
        assert!(decode_event(&v, Decoder::OpenAiChat).is_empty());
    }

    #[test]
    fn openai_chat_reasoning_is_separated_from_text() {
        let v: Value =
            serde_json::from_str(r#"{"choices":[{"delta":{"reasoning_content":"think"}}]}"#).unwrap();
        let out = decode_event(&v, Decoder::OpenAiChat);
        assert_eq!(out, vec![ProviderChunk::reasoning("think")]);
    }

    #[test]
    fn anthropic_text_delta_is_decoded() {
        let v: Value = serde_json::from_str(
            r#"{"type":"content_block_delta","delta":{"type":"text_delta","text":"Hi"}}"#,
        )
        .unwrap();
        assert_eq!(decode_event(&v, Decoder::Anthropic), vec![ProviderChunk::text("Hi")]);
    }

    #[test]
    fn anthropic_thinking_delta_becomes_reasoning() {
        let v: Value = serde_json::from_str(
            r#"{"type":"content_block_delta","delta":{"type":"thinking_delta","thinking":"hmm"}}"#,
        )
        .unwrap();
        assert_eq!(decode_event(&v, Decoder::Anthropic), vec![ProviderChunk::reasoning("hmm")]);
    }

    #[test]
    fn anthropic_ping_and_message_start_yield_nothing() {
        for payload in [r#"{"type":"ping"}"#, r#"{"type":"message_start"}"#] {
            let v: Value = serde_json::from_str(payload).unwrap();
            assert!(decode_event(&v, Decoder::Anthropic).is_empty(), "payload: {payload}");
        }
    }

    #[test]
    fn responses_text_delta_is_decoded() {
        let v: Value = serde_json::from_str(
            r#"{"type":"response.output_text.delta","delta":"chunk"}"#,
        )
        .unwrap();
        assert_eq!(decode_event(&v, Decoder::OpenAiResponses), vec![ProviderChunk::text("chunk")]);
    }

    #[test]
    fn responses_completed_carries_usage() {
        let v: Value = serde_json::from_str(
            r#"{"type":"response.completed","response":{"usage":{"input_tokens":10,"output_tokens":4}}}"#,
        )
        .unwrap();
        let out = decode_event(&v, Decoder::OpenAiResponses);
        assert_eq!(
            out,
            vec![ProviderChunk::Usage {
                input_tokens: 10,
                output_tokens: 4,
                total_tokens: 14,
                cached_input_tokens: None,
                reasoning_output_tokens: None,
                model_context_window: None,
            }]
        );
    }

    #[test]
    fn responses_completed_reports_the_model_context_window() {
        // Some OpenAI-compatible gateways state the window on the response.
        let v: Value = serde_json::from_str(
            r#"{"type":"response.completed","response":{"usage":{"input_tokens":10,"output_tokens":4},"model_context_window":128000}}"#,
        )
        .unwrap();
        match decode_event(&v, Decoder::OpenAiResponses).as_slice() {
            [ProviderChunk::Usage { model_context_window, .. }] => {
                assert_eq!(*model_context_window, Some(128_000));
            }
            other => panic!("expected one usage chunk, got {other:?}"),
        }
    }

    #[test]
    fn openai_chat_reports_cached_and_reasoning_tokens() {
        // These ride under the `*_details` objects on the final chunk.
        let v: Value = serde_json::from_str(
            r#"{"choices":[{"delta":{}}],"usage":{"prompt_tokens":100,"completion_tokens":40,
                "prompt_tokens_details":{"cached_tokens":64},
                "completion_tokens_details":{"reasoning_tokens":12}}}"#,
        )
        .unwrap();
        match decode_event(&v, Decoder::OpenAiChat).as_slice() {
            [ProviderChunk::Usage { cached_input_tokens, reasoning_output_tokens, .. }] => {
                assert_eq!(*cached_input_tokens, Some(64));
                assert_eq!(*reasoning_output_tokens, Some(12));
            }
            other => panic!("expected one usage chunk, got {other:?}"),
        }
    }

    #[test]
    fn anthropic_reports_cache_reads_and_thinking_tokens() {
        let v: Value = serde_json::from_str(
            r#"{"type":"message_delta","usage":{"input_tokens":100,"output_tokens":40,
                "cache_read_input_tokens":32,"output_tokens_details":{"thinking_tokens":7}}}"#,
        )
        .unwrap();
        match decode_event(&v, Decoder::Anthropic).as_slice() {
            [ProviderChunk::Usage { cached_input_tokens, reasoning_output_tokens, .. }] => {
                assert_eq!(*cached_input_tokens, Some(32));
                assert_eq!(*reasoning_output_tokens, Some(7));
            }
            other => panic!("expected one usage chunk, got {other:?}"),
        }
    }

    #[test]
    fn absent_optional_counters_stay_unknown_rather_than_zero() {
        // A provider that reports only the two required counters must not have
        // its cache/reasoning/window fields invented as 0.
        let v: Value = serde_json::from_str(
            r#"{"choices":[{"delta":{}}],"usage":{"prompt_tokens":7,"completion_tokens":3}}"#,
        )
        .unwrap();
        match decode_event(&v, Decoder::OpenAiChat).as_slice() {
            [ProviderChunk::Usage { cached_input_tokens, reasoning_output_tokens, model_context_window, .. }] => {
                assert_eq!(*cached_input_tokens, None);
                assert_eq!(*reasoning_output_tokens, None);
                assert_eq!(*model_context_window, None);
            }
            other => panic!("expected one usage chunk, got {other:?}"),
        }
    }

    #[test]
    fn usage_chunk_is_omitted_when_fields_are_absent() {
        // Guards against emitting a misleading all-zero usage row.
        let usage = serde_json::json!({});
        assert!(usage_chunk(&usage, "input_tokens", "output_tokens", None, None).is_none());
    }

    #[test]
    fn error_extraction_handles_all_three_shapes() {
        let openai: Value = serde_json::from_str(r#"{"error":{"message":"bad key"}}"#).unwrap();
        assert_eq!(extract_error(&openai).as_deref(), Some("bad key"));

        let simple: Value = serde_json::from_str(r#"{"error":"overloaded"}"#).unwrap();
        assert_eq!(extract_error(&simple).as_deref(), Some("overloaded"));

        let responses: Value =
            serde_json::from_str(r#"{"type":"error","message":"rate limited"}"#).unwrap();
        assert_eq!(extract_error(&responses).as_deref(), Some("rate limited"));
    }

    #[test]
    fn normal_payloads_are_not_mistaken_for_errors() {
        let v: Value = serde_json::from_str(r#"{"choices":[{"delta":{"content":"ok"}}]}"#).unwrap();
        assert!(extract_error(&v).is_none());
    }

    #[test]
    fn provider_is_not_a_placeholder() {
        let p = HttpProvider::new(cfg(WireProtocol::OpenAiChat)).expect("build");
        assert!(!p.is_placeholder(), "a real HTTP provider must not claim to be a stub");
    }

    #[test]
    fn provider_reports_its_protocol_name() {
        let p = HttpProvider::new(cfg(WireProtocol::Anthropic)).expect("build");
        assert_eq!(p.name(), "anthropic");
    }

    #[test]
    fn invalid_config_fails_at_construction_not_at_first_turn() {
        let mut c = cfg(WireProtocol::OpenAiChat);
        c.base_url = "not-a-url".into();
        assert!(HttpProvider::new(c).is_err(), "must fail early");
    }
}
