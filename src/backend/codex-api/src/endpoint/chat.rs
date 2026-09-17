use crate::auth::SharedAuthProvider;
use crate::common::ResponseStream;
use crate::endpoint::session::EndpointSession;
use crate::error::ApiError;
use crate::provider::Provider;
use crate::sse::chat::spawn_chat_response_stream;
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
pub struct ChatApiRequest {
    pub model: String,
    pub messages: Vec<ChatMessage>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub tools: Vec<ChatTool>,
    pub stream: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub stream_options: Option<ChatStreamOptions>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub temperature: Option<f32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub max_tokens: Option<u32>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChatStreamOptions {
    pub include_usage: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChatMessage {
    pub role: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub content: Option<ChatMessageContent>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tool_calls: Option<Vec<ChatToolCall>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tool_call_id: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(untagged)]
pub enum ChatMessageContent {
    Text(String),
    Parts(Vec<ChatMessagePart>),
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum ChatMessagePart {
    Text { text: String },
    ImageUrl { image_url: ChatImageUrl },
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChatImageUrl {
    pub url: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub detail: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChatToolCall {
    pub id: String,
    pub r#type: String,
    pub function: ChatFunctionCall,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChatFunctionCall {
    pub name: String,
    pub arguments: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChatTool {
    pub r#type: String,
    pub function: ChatToolFunction,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChatToolFunction {
    pub name: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub description: Option<String>,
    pub parameters: serde_json::Value,
}

#[derive(Default, Debug, Clone)]
pub struct ChatOptions {
    pub session_id: Option<String>,
    pub thread_id: Option<String>,
    pub extra_headers: HeaderMap,
}

pub struct ChatClient<T: HttpTransport> {
    session: EndpointSession<T>,
    sse_telemetry: Option<Arc<dyn SseTelemetry>>,
    endpoint_path: String,
}

impl<T: HttpTransport> ChatClient<T> {
    pub fn new(transport: T, provider: Provider, auth: SharedAuthProvider) -> Self {
        Self {
            session: EndpointSession::new(transport, provider, auth),
            sse_telemetry: None,
            endpoint_path: "/chat/completions".to_string(),
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
        name = "chat.stream_request",
        level = "info",
        skip_all,
        fields(transport = "chat_completions_http", http.method = "POST", api.path = %self.endpoint_path)
    )]
    pub async fn stream_request(
        &self,
        request: ChatApiRequest,
        options: ChatOptions,
    ) -> Result<ResponseStream, ApiError> {
        let ChatOptions {
            session_id,
            thread_id,
            extra_headers,
        } = options;

        let body = EncodedJsonBody::encode(&request)
            .map_err(|e| ApiError::Stream(format!("failed to encode chat request: {e}")))?;

        let mut headers = extra_headers;
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
                },
            )
            .await?;

        Ok(spawn_chat_response_stream(
            stream_response,
            self.session.provider().stream_idle_timeout,
            self.sse_telemetry.clone(),
        ))
    }
}
