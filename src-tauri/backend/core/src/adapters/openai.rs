//! OpenAI Chat Completions adapter with streaming support.

use std::{pin::Pin, sync::Arc};
use tokio::{sync::mpsc, stream::Stream};
use tokio_stream::StreamExt;
use reqwest::{Client, header:: HeaderMap};
use serde::{Deserialize, Serialize};
use tracing::*;

use crate::{provider_api::{ModelProvider, ModelResponseChunk, ModelError, ErrorKind}, adapters::ProviderConfig};

#[derive(Debug, Clone)]
pub struct OpenAIProvider {
    pub base_url: String,
    pub api_key: Option<String>,
    pub model: String,
}

impl OpenAIProvider {
    fn client(&self) -> Client {
        Client::new()
    }

    fn build_headers(&self) -> Result<HeaderMap, ModelError> {
        let mut headers = HeaderMap::new();
        headers.insert(
            "Content-Type",
            "application/json".parse().map_err(|e| ModelError {
                kind: ErrorKind::NetworkError(format!("{:?}", e)),
                message: "Failed to parse content-type header".to_string(),
                original_error: None,
            })?,
        );

        if let Some(ref api_key) = self.api_key {
            headers.insert(
                "Authorization",
                format!("Bearer {}", api_key)
                    .parse()
                    .map_err(|e| ModelError {
                        kind: ErrorKind::NetworkError(format!("{:?}", e)),
                        message: "Failed to parse authorization header".to_string(),
                        original_error: None,
                    })?,
            );
        }

        Ok(headers)
    }

    async fn process_sse_line(&self, line: &str) -> Result<Option<ModelResponseChunk>, ModelError> {
        // Skip non-data lines and empty lines
        if !line.starts_with("data: ") || line == "data: [DONE]" {
            return Ok(None);
        }

        let data = line.trim_start_matches("data: ").trim();
        
        #[derive(Debug, Deserialize)]
        struct SSEChunk {
            choices: Vec<ChoiceDelta>,
            usage: Option<TokenUsage>,
        }

        #[derive(Debug, Deserialize)]
        struct ChoiceDelta {
            delta: Delta,
        }

        #[derive(Debug, Deserialize)]
        struct Delta {
            content: Option<String>,
            tool_calls: Option<Vec<ToolCallDelta>>,
        }

        #[derive(Debug, Deserialize)]
        struct ToolCallDelta {
            index: u32,
            function: Option<FunctionCall>,
        }

        #[derive(Debug, Deserialize)]
        struct FunctionCall {
            name: String,
            arguments: String,
        }

        #[derive(Debug, Deserialize)]
        struct TokenUsage {
            prompt_tokens: u32,
            completion_tokens: u32,
            total_tokens: u32,
        }

        match serde_json::from_str::<SSEChunk>(data) {
            Ok(sse) => {
                for choice in sse.choices {
                    if let Some(text) = &choice.delta.content {
                        if !text.is_empty() {
                            return Ok(Some(ModelResponseChunk::Text { text: text.clone() }));
                        }
                    }

                    if let Some(tools) = &choice.delta.tool_calls {
                        for tool in tools {
                            if let Some(func) = &tool.function {
                                // For Phase 3, we'll emit the complete call when received
                                // In full implementation, we'd accumulate arguments incrementally
                                if !func.name.is_empty() && !func.arguments.is_empty() {
                                    if let Ok(args) = serde_json::from_str(&func.arguments) {
                                        return Ok(Some(ModelResponseChunk::ToolCall {
                                            name: func.name.clone(),
                                            arguments: args,
                                        }));
                                    }
                                }
                            }
                        }
                    }
                }

                if let Some(usage) = sse.usage {
                    return Ok(Some(ModelResponseChunk::UsageMetrics {
                        prompt_tokens: usage.prompt_tokens,
                        completion_tokens: usage.completion_tokens,
                        total_tokens: usage.total_tokens,
                    }));
                }

                Ok(None)
            }
            Err(e) => {
                warn!("Failed to parse SSE chunk: {:?}", e);
                Ok(Some(ModelResponseChunk::Error {
                    code: "PARSE_ERROR".to_string(),
                    message: format!("Failed to parse response: {:?}", e),
                    retryable: true,
                }))
            }
        }
    }
}

impl ModelProvider for OpenAIProvider {
    fn request<'a>(
        &'a self,
        _messages: &[crate::models::TurnItem],
        _tools: Option<&[crate::provider_api::ToolDefinition]>,
    ) -> Pin<Box<dyn Stream<Item = Result<ModelResponseChunk, ModelError>> + Send + 'a>> {
        let base_url = self.base_url.clone();
        let api_key = self.api_key.clone();
        let model = self.model.clone();

        Box::pin(async_stream::stream! {
            // Build request URL
            let url = format!("{}/v1/chat/completions", base_url.trim_end_matches('/'));
            
            // Build request body (minimal for Phase 3)
            let body = serde_json::json!({
                "model": model,
                "messages": [{"role": "user", "content": "Hello"}],
                "stream": true,
            });

            // Make HTTP POST request
            let client = Client::new();
            let req = client.post(&url)
                .header("Authorization", format!("Bearer {}", api_key.unwrap_or_default()))
                .json(&body)
                .send()
                .await;

            match req {
                Ok(resp) => {
                    let mut stream = resp.lines();
                    
                    while let Some(line_result) = stream.next().await {
                        match line_result {
                            Ok(line) => {
                                if let Some(chunk) = self.process_sse_line(&line).await? {
                                    yield Ok(chunk);
                                }
                            }
                            Err(e) => {
                                error!("Request failed: {:?}", e);
                                yield Err(ModelError {
                                    kind: ErrorKind::NetworkError(format!("{:?}", e)),
                                    message: "Network error during streaming".to_string(),
                                    original_error: None,
                                });
                                break;
                            }
                        }
                    }
                }
                Err(e) => {
                    error!("Failed to send request: {:?}", e);
                    yield Err(ModelError {
                        kind: ErrorKind::NetworkError(format!("{:?}", e)),
                        message: "Failed to connect to provider".to_string(),
                        original_error: None,
                    });
                }
            }
        })
    }
}
