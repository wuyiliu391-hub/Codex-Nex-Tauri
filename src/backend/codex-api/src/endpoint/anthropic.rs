use crate::auth::SharedAuthProvider;
use crate::common::ResponseStream;
use crate::endpoint::session::EndpointSession;
use crate::error::ApiError;
use crate::provider::Provider;
use crate::sse::anthropic::spawn_anthropic_response_stream;
use crate::telemetry::SseTelemetry;
use codex_client::EncodedJsonBody;
use codex_client::HttpTransport;
use codex_client::RequestTelemetry;
use http::HeaderMap;
use http::HeaderValue;
use http::Method;
use serde::Deserialize;
use serde::Serialize;
use std::sync::Arc;
use tracing::instrument;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AnthropicApiRequest {
    pub model: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub system: Option<String>,
    pub messages: Vec<AnthropicMessage>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub tools: Vec<AnthropicTool>,
    pub max_tokens: u32,
    pub stream: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub temperature: Option<f32>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AnthropicMessage {
    pub role: String,
    pub content: AnthropicContent,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(untagged)]
pub enum AnthropicContent {
    Text(String),
    Blocks(Vec<AnthropicBlock>),
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum AnthropicBlock {
    Text {
        text: String,
    },
    Image {
        source: AnthropicImageSource,
    },
    ToolUse {
        id: String,
        name: String,
        input: serde_json::Value,
    },
    ToolResult {
        tool_use_id: String,
        content: String,
    },
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AnthropicImageSource {
    pub r#type: String,
    pub media_type: String,
    pub data: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AnthropicTool {
    pub name: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub description: Option<String>,
    pub input_schema: serde_json::Value,
}

#[derive(Default, Debug, Clone)]
pub struct AnthropicOptions {
    pub session_id: Option<String>,
    pub thread_id: Option<String>,
    pub extra_headers: HeaderMap,
}

pub struct AnthropicClient<T: HttpTransport> {
    session: EndpointSession<T>,
    sse_telemetry: Option<Arc<dyn SseTelemetry>>,
    endpoint_path: String,
}

impl<T: HttpTransport> AnthropicClient<T> {
    pub fn new(transport: T, provider: Provider, auth: SharedAuthProvider) -> Self {
        Self {
            session: EndpointSession::new(transport, provider, auth),
            sse_telemetry: None,
            endpoint_path: "/messages".to_string(),
        }
    }

    pub fn with_endpoint(mut self, endpoint: impl Into<String>) -> Self {
        self.endpoint_path = endpoint.into();
        self
    }

    pub fn with_telemetry(
        self,
        request: Option<Arc<dyn RequestTelemetry>>,
        sse: Option<Arc<dyn SseTelemetry>>,
    ) -> Self {
        Self {
            session: self.session.with_request_telemetry(request),
            sse_telemetry: sse,
            endpoint_path: self.endpoint_path,
        }
    }

    #[instrument(
        name = "anthropic.stream_request",
        level = "info",
        skip_all,
        fields(transport = "anthropic_messages_http", http.method = "POST", api.path = %self.endpoint_path)
    )]
    pub async fn stream_request(
        &self,
        request: AnthropicApiRequest,
        options: AnthropicOptions,
    ) -> Result<ResponseStream, ApiError> {
        let AnthropicOptions {
            session_id,
            thread_id,
            extra_headers,
        } = options;

        let body = EncodedJsonBody::encode(&request)
            .map_err(|e| ApiError::Stream(format!("failed to encode anthropic request: {e}")))?;

        let mut headers = extra_headers;
        headers.insert(
            "anthropic-version",
            HeaderValue::from_static("2023-06-01"),
        );
        headers.insert(
            "anthropic-beta",
            HeaderValue::from_static("prompt-caching-2024-07-31"),
        );

        if let Some(ref thread_id) = thread_id {
            if let Ok(v) = HeaderValue::from_str(thread_id) {
                headers.insert("x-client-request-id", v);
            }
        }
        if let Some(ref session_id) = session_id {
            if let Ok(v) = HeaderValue::from_str(session_id) {
                headers.insert("x-session-id", v);
            }
        }

        let stream_response = self
            .session
            .stream_encoded_json_with(
                Method::POST,
                &self.endpoint_path,
                headers,
                Some(body),
                |req| {
                    req.headers.insert(
                        http::header::ACCEPT,
                        HeaderValue::from_static("text/event-stream"),
                    );
                    if !req.headers.contains_key("x-api-key") {
                        if let Some(auth_val) = req.headers.get(http::header::AUTHORIZATION) {
                            if let Ok(auth_str) = auth_val.to_str() {
                                if let Some(token) = auth_str.strip_prefix("Bearer ") {
                                    if let Ok(val) = HeaderValue::from_str(token.trim()) {
                                        req.headers.insert("x-api-key", val);
                                    }
                                }
                            }
                        }
                    }
                },
            )
            .await?;

        Ok(spawn_anthropic_response_stream(
            stream_response,
            self.session.provider().stream_idle_timeout,
            self.sse_telemetry.clone(),
        ))
    }
}
