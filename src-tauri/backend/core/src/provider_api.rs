//! Provider trait and response types for model communication.
//! Defines the abstract interface that all model providers must implement.

use std::pin::Pin;
use tokio_stream::Stream;

/// Model error with classification for retry logic
#[derive(Debug, Clone)]
pub enum ErrorKind {
    NetworkError(String),
    RateLimitExceeded(u64),  // Retry-after seconds
    ModelNotAllowed(String),
    ParseFailure(String),
}

/// Unified model response type
#[derive(Debug, Clone)]
pub enum ModelResponseChunk {
    Text { text: String },
    ToolCall { name: String, arguments: serde_json::Value },
    UsageMetrics { prompt_tokens: u32, completion_tokens: u32, total_tokens: u32 },
    Error { code: String, message: String, retryable: bool },
}

/// Abstract provider interface
pub trait ModelProvider: Send + Sync {
    /// Request model response stream
    fn request(
        &self,
        messages: &[crate::models::TurnItem],
        tools: Option<&[crate::provider_api::ToolDefinition]>,
    ) -> Pin<Box<dyn Stream<Item = Result<ModelResponseChunk, ModelError>> + Send>>;
}

#[derive(Debug, Clone)]
pub struct ModelError {
    pub kind: ErrorKind,
    pub message: String,
    pub original_error: Option<String>,
}

impl From<tokio::sync::mpsc::error::SendError<()>> for ModelError {
    fn from(_: tokio::sync::mpsc::error::SendError<()>) -> Self {
        Self {
            kind: ErrorKind::NetworkError("Channel closed".to_string()),
            message: "Communication channel failed".to_string(),
            original_error: None,
        }
    }
}

/// Tool definition for function calling
#[derive(Debug, Clone)]
pub struct ToolDefinition {
    pub name: String,
    pub description: String,
    pub parameters: serde_json::Value,
}
