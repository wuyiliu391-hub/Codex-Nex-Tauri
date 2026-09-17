use crate::common::ResponseEvent;
use crate::common::ResponseStream;
use crate::error::ApiError;
use crate::rate_limits::parse_all_rate_limits;
use crate::telemetry::SseTelemetry;
use codex_client::ByteStream;
use codex_client::StreamResponse;
use codex_protocol::models::ContentItem;
use codex_protocol::models::ResponseItem;
use codex_protocol::protocol::TokenUsage;
use codex_protocol::ResponseItemId;
use eventsource_stream::Eventsource;
use futures::StreamExt;
use serde::Deserialize;
use std::collections::HashMap;
use std::collections::HashSet;
use std::sync::Arc;
use std::time::Duration;
use tokio::sync::mpsc;
use tokio::time::Instant;
use tokio::time::timeout;
use tracing::debug;
use tracing::trace;
use uuid::Uuid;

const REQUEST_ID_HEADER: &str = "x-request-id";
const OPENAI_MODEL_HEADER: &str = "openai-model";

#[derive(Debug, Deserialize)]
struct ChatChunk {
    id: Option<String>,
    model: Option<String>,
    #[serde(default)]
    choices: Vec<ChatChoice>,
    #[serde(default)]
    usage: Option<ChatUsage>,
    #[serde(default)]
    error: Option<ChatErrorPayload>,
}

#[derive(Debug, Deserialize)]
struct ChatErrorPayload {
    message: Option<String>,
    #[allow(dead_code)]
    code: Option<String>,
}

#[derive(Debug, Deserialize)]
struct ChatChoice {
    #[allow(dead_code)]
    index: Option<usize>,
    #[serde(default)]
    delta: ChatDelta,
    finish_reason: Option<String>,
}

#[derive(Debug, Default, Deserialize)]
struct ChatDelta {
    #[allow(dead_code)]
    role: Option<String>,
    content: Option<String>,
    reasoning_content: Option<String>,
    reasoning: Option<String>,
    #[serde(default)]
    tool_calls: Option<Vec<ChatToolCallChunk>>,
}

#[derive(Debug, Deserialize)]
struct ChatToolCallChunk {
    index: Option<usize>,
    id: Option<String>,
    #[allow(dead_code)]
    r#type: Option<String>,
    function: Option<ChatFunctionChunk>,
}

#[derive(Debug, Deserialize)]
struct ChatFunctionChunk {
    name: Option<String>,
    arguments: Option<String>,
}

#[derive(Debug, Deserialize)]
struct ChatUsage {
    #[serde(default)]
    prompt_tokens: i64,
    #[serde(default)]
    completion_tokens: i64,
    #[serde(default)]
    total_tokens: i64,
    #[serde(default)]
    prompt_tokens_details: Option<ChatPromptTokensDetails>,
    #[serde(default)]
    completion_tokens_details: Option<ChatCompletionTokensDetails>,
}

#[derive(Debug, Default, Deserialize)]
struct ChatPromptTokensDetails {
    #[serde(default)]
    cached_tokens: i64,
}

#[derive(Debug, Default, Deserialize)]
struct ChatCompletionTokensDetails {
    #[serde(default)]
    reasoning_tokens: i64,
}

pub fn spawn_chat_response_stream(
    stream_response: StreamResponse,
    idle_timeout: Duration,
    telemetry: Option<Arc<dyn SseTelemetry>>,
) -> ResponseStream {
    let rate_limit_snapshots = parse_all_rate_limits(&stream_response.headers);
    let server_model = stream_response
        .headers
        .get(OPENAI_MODEL_HEADER)
        .and_then(|v| v.to_str().ok())
        .map(ToString::to_string);
    let upstream_request_id = stream_response
        .headers
        .get(REQUEST_ID_HEADER)
        .and_then(|v| v.to_str().ok())
        .map(ToString::to_string);

    let (tx_event, rx_event) = mpsc::channel::<Result<ResponseEvent, ApiError>>(1600);
    tokio::spawn(async move {
        if let Some(model) = server_model {
            let _ = tx_event.send(Ok(ResponseEvent::ServerModel(model))).await;
        }
        for snapshot in rate_limit_snapshots {
            let _ = tx_event.send(Ok(ResponseEvent::RateLimits(snapshot))).await;
        }

        process_chat_sse(stream_response.bytes, tx_event, idle_timeout, telemetry).await;
    });

    ResponseStream {
        rx_event,
        upstream_request_id,
    }
}

async fn process_chat_sse(
    stream: ByteStream,
    tx_event: mpsc::Sender<Result<ResponseEvent, ApiError>>,
    idle_timeout: Duration,
    telemetry: Option<Arc<dyn SseTelemetry>>,
) {
    let mut stream = stream.eventsource();
    let mut response_id: Option<String> = None;
    let mut assistant_item_id: Option<String> = None;
    let mut accumulated_assistant_text = String::new();
    let mut active_tool_calls: HashMap<usize, (String, String, String, String)> = HashMap::new();
    let mut emitted_tool_calls: HashSet<usize> = HashSet::new();
    let mut token_usage: Option<TokenUsage> = None;
    let mut last_finish_reason: Option<String> = None;

    loop {
        let start = Instant::now();
        let response = tokio::select! {
            biased;
            _ = tx_event.closed() => return,
            response = timeout(idle_timeout, stream.next()) => response,
        };
        if let Some(t) = telemetry.as_ref() {
            t.on_sse_poll(&response, start.elapsed());
        }

        let sse = match response {
            Ok(Some(Ok(sse))) => sse,
            Ok(Some(Err(e))) => {
                debug!("Chat SSE Error: {e:#}");
                let _ = tx_event.send(Err(ApiError::Stream(e.to_string()))).await;
                return;
            }
            Ok(None) => break,
            Err(_) => {
                let _ = tx_event
                    .send(Err(ApiError::Stream("idle timeout waiting for chat SSE".into())))
                    .await;
                return;
            }
        };

        let trimmed_data = sse.data.trim();
        if trimmed_data == "[DONE]" {
            trace!("Chat SSE received [DONE]");
            break;
        }
        if trimmed_data.is_empty() {
            continue;
        }

        trace!("Chat SSE event: {}", trimmed_data);

        let chunk: ChatChunk = match serde_json::from_str(trimmed_data) {
            Ok(chunk) => chunk,
            Err(e) => {
                // Check if the payload is a top-level error object
                if let Ok(val) = serde_json::from_str::<serde_json::Value>(trimmed_data) {
                    if let Some(err_obj) = val.get("error") {
                        let msg = err_obj
                            .get("message")
                            .and_then(|m| m.as_str())
                            .unwrap_or("unknown error from chat provider");
                        let _ = tx_event.send(Err(ApiError::Stream(msg.to_string()))).await;
                        return;
                    }
                }
                debug!("Failed to parse Chat SSE chunk: {e:#}");
                continue;
            }
        };

        if let Some(err) = chunk.error {
            let msg = err.message.unwrap_or_else(|| "chat provider returned error".to_string());
            let _ = tx_event.send(Err(ApiError::Stream(msg))).await;
            return;
        }

        if let Some(ref id) = chunk.id {
            if response_id.is_none() {
                response_id = Some(id.clone());
                if tx_event
                    .send(Ok(ResponseEvent::Created {
                        response_id: Some(id.clone()),
                    }))
                    .await
                    .is_err()
                {
                    return;
                }
            }
        }

        if let Some(ref model) = chunk.model {
            let _ = tx_event.send(Ok(ResponseEvent::ServerModel(model.clone()))).await;
        }

        for choice in chunk.choices {
            let reasoning = choice
                .delta
                .reasoning_content
                .or(choice.delta.reasoning)
                .filter(|s| !s.is_empty());
            if let Some(reasoning_text) = reasoning {
                if tx_event
                    .send(Ok(ResponseEvent::ReasoningContentDelta {
                        delta: reasoning_text,
                        content_index: 0,
                    }))
                    .await
                    .is_err()
                {
                    return;
                }
            }

            if let Some(text_delta) = choice.delta.content.filter(|s| !s.is_empty()) {
                if assistant_item_id.is_none() {
                    let new_id = ResponseItemId::new("msg");
                    let id_str = new_id.to_string();
                    assistant_item_id = Some(id_str);
                    if tx_event
                        .send(Ok(ResponseEvent::OutputItemAdded(ResponseItem::Message {
                            id: Some(new_id),
                            role: "assistant".to_string(),
                            content: vec![],
                            phase: None,
                            internal_chat_message_metadata_passthrough: None,
                        })))
                        .await
                        .is_err()
                    {
                        return;
                    }
                }

                accumulated_assistant_text.push_str(&text_delta);
                if tx_event
                    .send(Ok(ResponseEvent::OutputTextDelta(text_delta)))
                    .await
                    .is_err()
                {
                    return;
                }
            }

            if let Some(tool_calls) = choice.delta.tool_calls {
                for tc in tool_calls {
                    let idx = tc.index.unwrap_or(0);
                    let entry = active_tool_calls.entry(idx).or_insert_with(|| {
                        let call_id = tc
                            .id
                            .clone()
                            .unwrap_or_else(|| format!("call_{}", Uuid::new_v4()));
                        let name = tc
                            .function
                            .as_ref()
                            .and_then(|f| f.name.clone())
                            .unwrap_or_default();
                        let item_id = ResponseItemId::new("fc").to_string();
                        (item_id, call_id, name, String::new())
                    });

                    if let Some(f) = &tc.function {
                        if let Some(name) = &f.name {
                            if entry.2.is_empty() {
                                entry.2 = name.clone();
                            }
                        }
                    }

                    if !emitted_tool_calls.contains(&idx) {
                        emitted_tool_calls.insert(idx);
                        let (item_id, call_id, name, _) = entry.clone();
                        if tx_event
                            .send(Ok(ResponseEvent::OutputItemAdded(
                                ResponseItem::FunctionCall {
                                    id: Some(ResponseItemId::from_server(item_id)),
                                    name,
                                    namespace: None,
                                    arguments: String::new(),
                                    encrypted_function_args: None,
                                    call_id,
                                    internal_chat_message_metadata_passthrough: None,
                                },
                            )))
                            .await
                            .is_err()
                        {
                            return;
                        }
                    }

                    if let Some(f) = tc.function {
                        if let Some(arg_delta) = f.arguments.filter(|s| !s.is_empty()) {
                            entry.3.push_str(&arg_delta);
                            let item_id = entry.0.clone();
                            let call_id = entry.1.clone();
                            if tx_event
                                .send(Ok(ResponseEvent::ToolCallInputDelta {
                                    item_id,
                                    call_id: Some(call_id),
                                    delta: arg_delta,
                                }))
                                .await
                                .is_err()
                            {
                                return;
                            }
                        }
                    }
                }
            }

            if let Some(reason) = choice.finish_reason {
                last_finish_reason = Some(reason);

                if let Some(item_id) = assistant_item_id.take() {
                    let text = std::mem::take(&mut accumulated_assistant_text);
                    let _ = tx_event
                        .send(Ok(ResponseEvent::OutputItemDone(ResponseItem::Message {
                            id: Some(ResponseItemId::from_server(item_id)),
                            role: "assistant".to_string(),
                            content: vec![ContentItem::OutputText { text }],
                            phase: None,
                            internal_chat_message_metadata_passthrough: None,
                        })))
                        .await;
                }

                for (_, (item_id, call_id, name, arguments)) in active_tool_calls.drain() {
                    let _ = tx_event
                        .send(Ok(ResponseEvent::OutputItemDone(
                            ResponseItem::FunctionCall {
                                id: Some(ResponseItemId::from_server(item_id)),
                                name,
                                namespace: None,
                                arguments,
                                encrypted_function_args: None,
                                call_id,
                                internal_chat_message_metadata_passthrough: None,
                            },
                        )))
                        .await;
                }
            }
        }

        if let Some(usage) = chunk.usage {
            token_usage = Some(TokenUsage {
                input_tokens: usage.prompt_tokens,
                cached_input_tokens: usage
                    .prompt_tokens_details
                    .map(|d| d.cached_tokens)
                    .unwrap_or(0),
                cache_write_input_tokens: 0,
                output_tokens: usage.completion_tokens,
                reasoning_output_tokens: usage
                    .completion_tokens_details
                    .map(|d| d.reasoning_tokens)
                    .unwrap_or(0),
                total_tokens: usage.total_tokens,
                codex_rollout_budget_units: None,
            });
        }
    }

    // Flush any pending unclosed items
    if let Some(item_id) = assistant_item_id.take() {
        let text = std::mem::take(&mut accumulated_assistant_text);
        let _ = tx_event
            .send(Ok(ResponseEvent::OutputItemDone(ResponseItem::Message {
                id: Some(ResponseItemId::from_server(item_id)),
                role: "assistant".to_string(),
                content: vec![ContentItem::OutputText { text }],
                phase: None,
                internal_chat_message_metadata_passthrough: None,
            })))
            .await;
    }

    for (_, (item_id, call_id, name, arguments)) in active_tool_calls.drain() {
        let _ = tx_event
            .send(Ok(ResponseEvent::OutputItemDone(
                ResponseItem::FunctionCall {
                    id: Some(ResponseItemId::from_server(item_id)),
                    name,
                    namespace: None,
                    arguments,
                    encrypted_function_args: None,
                    call_id,
                    internal_chat_message_metadata_passthrough: None,
                },
            )))
            .await;
    }

    let is_length_stop = last_finish_reason.as_deref() == Some("length");
    let _ = tx_event
        .send(Ok(ResponseEvent::Completed {
            response_id: response_id.unwrap_or_else(|| format!("chatcmpl-{}", Uuid::new_v4())),
            token_usage,
            usage_metadata: None,
            end_turn: Some(!is_length_stop),
        }))
        .await;
}
