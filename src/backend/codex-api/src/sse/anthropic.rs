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
use std::sync::Arc;
use std::time::Duration;
use tokio::sync::mpsc;
use tokio::time::Instant;
use tokio::time::timeout;
use tracing::debug;
use tracing::trace;
use uuid::Uuid;

const REQUEST_ID_HEADER: &str = "x-request-id";

#[derive(Debug, Deserialize)]
#[serde(tag = "type")]
enum AnthropicStreamEvent {
    #[serde(rename = "message_start")]
    MessageStart { message: AnthropicMessagePayload },
    #[serde(rename = "content_block_start")]
    ContentBlockStart {
        index: usize,
        content_block: AnthropicBlockStartPayload,
    },
    #[serde(rename = "content_block_delta")]
    ContentBlockDelta {
        index: usize,
        delta: AnthropicDeltaPayload,
    },
    #[serde(rename = "content_block_stop")]
    ContentBlockStop { index: usize },
    #[serde(rename = "message_delta")]
    MessageDelta {
        delta: AnthropicMessageDeltaPayload,
        #[serde(default)]
        usage: Option<AnthropicUsageDelta>,
    },
    #[serde(rename = "message_stop")]
    MessageStop,
    #[serde(rename = "ping")]
    Ping,
    #[serde(rename = "error")]
    Error { error: AnthropicErrorPayload },
}

#[derive(Debug, Deserialize)]
struct AnthropicMessagePayload {
    id: Option<String>,
    model: Option<String>,
    #[serde(default)]
    usage: Option<AnthropicUsageInitial>,
}

#[derive(Debug, Deserialize)]
struct AnthropicUsageInitial {
    #[serde(default)]
    input_tokens: i64,
    #[serde(default)]
    cache_creation_input_tokens: i64,
    #[serde(default)]
    cache_read_input_tokens: i64,
    #[serde(default)]
    output_tokens: i64,
}

#[derive(Debug, Deserialize)]
struct AnthropicUsageDelta {
    #[serde(default)]
    output_tokens: i64,
}

#[derive(Debug, Deserialize)]
struct AnthropicMessageDeltaPayload {
    stop_reason: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(tag = "type")]
enum AnthropicBlockStartPayload {
    #[serde(rename = "text")]
    Text {
        #[allow(dead_code)]
        text: Option<String>,
    },
    #[serde(rename = "tool_use")]
    ToolUse {
        id: String,
        name: String,
    },
    #[serde(rename = "thinking")]
    Thinking,
}

#[derive(Debug, Deserialize)]
#[serde(tag = "type")]
enum AnthropicDeltaPayload {
    #[serde(rename = "text_delta")]
    TextDelta { text: String },
    #[serde(rename = "input_json_delta")]
    InputJsonDelta { partial_json: String },
    #[serde(rename = "thinking_delta")]
    ThinkingDelta { thinking: String },
}

#[derive(Debug, Deserialize)]
struct AnthropicErrorPayload {
    message: String,
    #[allow(dead_code)]
    r#type: Option<String>,
}

enum ActiveBlock {
    Text {
        item_id: String,
        text: String,
    },
    ToolUse {
        item_id: String,
        call_id: String,
        name: String,
        partial_json: String,
    },
    Thinking,
}

pub fn spawn_anthropic_response_stream(
    stream_response: StreamResponse,
    idle_timeout: Duration,
    telemetry: Option<Arc<dyn SseTelemetry>>,
) -> ResponseStream {
    let rate_limit_snapshots = parse_all_rate_limits(&stream_response.headers);
    let upstream_request_id = stream_response
        .headers
        .get(REQUEST_ID_HEADER)
        .and_then(|v| v.to_str().ok())
        .map(ToString::to_string);

    let (tx_event, rx_event) = mpsc::channel::<Result<ResponseEvent, ApiError>>(1600);
    tokio::spawn(async move {
        for snapshot in rate_limit_snapshots {
            let _ = tx_event.send(Ok(ResponseEvent::RateLimits(snapshot))).await;
        }

        process_anthropic_sse(stream_response.bytes, tx_event, idle_timeout, telemetry).await;
    });

    ResponseStream {
        rx_event,
        upstream_request_id,
    }
}

async fn process_anthropic_sse(
    stream: ByteStream,
    tx_event: mpsc::Sender<Result<ResponseEvent, ApiError>>,
    idle_timeout: Duration,
    telemetry: Option<Arc<dyn SseTelemetry>>,
) {
    let mut stream = stream.eventsource();
    let mut response_id: Option<String> = None;
    let mut input_tokens: i64 = 0;
    let mut output_tokens: i64 = 0;
    let mut cached_tokens: i64 = 0;
    let mut cache_write_tokens: i64 = 0;
    let mut stop_reason: Option<String> = None;
    let mut active_blocks: HashMap<usize, ActiveBlock> = HashMap::new();

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
                debug!("Anthropic SSE Error: {e:#}");
                let _ = tx_event.send(Err(ApiError::Stream(e.to_string()))).await;
                return;
            }
            Ok(None) => break,
            Err(_) => {
                let _ = tx_event
                    .send(Err(ApiError::Stream("idle timeout waiting for Anthropic SSE".into())))
                    .await;
                return;
            }
        };

        let trimmed_data = sse.data.trim();
        if trimmed_data.is_empty() {
            continue;
        }

        trace!("Anthropic SSE raw: {}", trimmed_data);

        let event: AnthropicStreamEvent = match serde_json::from_str(trimmed_data) {
            Ok(ev) => ev,
            Err(e) => {
                // Check if top-level error object
                if let Ok(val) = serde_json::from_str::<serde_json::Value>(trimmed_data) {
                    if let Some(err_obj) = val.get("error") {
                        let msg = err_obj
                            .get("message")
                            .and_then(|m| m.as_str())
                            .unwrap_or("Anthropic provider error");
                        let _ = tx_event.send(Err(ApiError::Stream(msg.to_string()))).await;
                        return;
                    }
                }
                debug!("Failed to parse Anthropic SSE chunk: {e:#}");
                continue;
            }
        };

        match event {
            AnthropicStreamEvent::MessageStart { message } => {
                if let Some(id) = message.id {
                    response_id = Some(id.clone());
                    if tx_event
                        .send(Ok(ResponseEvent::Created {
                            response_id: Some(id),
                        }))
                        .await
                        .is_err()
                    {
                        return;
                    }
                }
                if let Some(model) = message.model {
                    let _ = tx_event.send(Ok(ResponseEvent::ServerModel(model))).await;
                }
                if let Some(usage) = message.usage {
                    input_tokens = usage.input_tokens;
                    output_tokens = usage.output_tokens;
                    cached_tokens = usage.cache_read_input_tokens;
                    cache_write_tokens = usage.cache_creation_input_tokens;
                }
            }
            AnthropicStreamEvent::ContentBlockStart {
                index,
                content_block,
            } => match content_block {
                AnthropicBlockStartPayload::Text { .. } => {
                    let item_id = ResponseItemId::new("msg");
                    let id_str = item_id.to_string();
                    active_blocks.insert(
                        index,
                        ActiveBlock::Text {
                            item_id: id_str,
                            text: String::new(),
                        },
                    );
                    if tx_event
                        .send(Ok(ResponseEvent::OutputItemAdded(ResponseItem::Message {
                            id: Some(item_id),
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
                AnthropicBlockStartPayload::ToolUse { id, name } => {
                    let item_id = ResponseItemId::new("fc");
                    let id_str = item_id.to_string();
                    active_blocks.insert(
                        index,
                        ActiveBlock::ToolUse {
                            item_id: id_str,
                            call_id: id.clone(),
                            name: name.clone(),
                            partial_json: String::new(),
                        },
                    );
                    if tx_event
                        .send(Ok(ResponseEvent::OutputItemAdded(
                            ResponseItem::FunctionCall {
                                id: Some(item_id),
                                name,
                                namespace: None,
                                arguments: String::new(),
                                encrypted_function_args: None,
                                call_id: id,
                                internal_chat_message_metadata_passthrough: None,
                            },
                        )))
                        .await
                        .is_err()
                    {
                        return;
                    }
                }
                AnthropicBlockStartPayload::Thinking => {
                    active_blocks.insert(index, ActiveBlock::Thinking);
                }
            },
            AnthropicStreamEvent::ContentBlockDelta { index, delta } => {
                if let Some(block) = active_blocks.get_mut(&index) {
                    match (block, delta) {
                        (ActiveBlock::Text { text, .. }, AnthropicDeltaPayload::TextDelta { text: delta_text }) => {
                            text.push_str(&delta_text);
                            if tx_event
                                .send(Ok(ResponseEvent::OutputTextDelta(delta_text)))
                                .await
                                .is_err()
                            {
                                return;
                            }
                        }
                        (
                            ActiveBlock::ToolUse {
                                item_id,
                                call_id,
                                partial_json,
                                ..
                            },
                            AnthropicDeltaPayload::InputJsonDelta { partial_json: delta_json },
                        ) => {
                            partial_json.push_str(&delta_json);
                            if tx_event
                                .send(Ok(ResponseEvent::ToolCallInputDelta {
                                    item_id: item_id.clone(),
                                    call_id: Some(call_id.clone()),
                                    delta: delta_json,
                                }))
                                .await
                                .is_err()
                            {
                                return;
                            }
                        }
                        (ActiveBlock::Thinking, AnthropicDeltaPayload::ThinkingDelta { thinking }) => {
                            if tx_event
                                .send(Ok(ResponseEvent::ReasoningContentDelta {
                                    delta: thinking,
                                    content_index: 0,
                                }))
                                .await
                                .is_err()
                            {
                                return;
                            }
                        }
                        _ => {}
                    }
                }
            }
            AnthropicStreamEvent::ContentBlockStop { index } => {
                if let Some(block) = active_blocks.remove(&index) {
                    match block {
                        ActiveBlock::Text { item_id, text } => {
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
                        ActiveBlock::ToolUse {
                            item_id,
                            call_id,
                            name,
                            partial_json,
                        } => {
                            let _ = tx_event
                                .send(Ok(ResponseEvent::OutputItemDone(
                                    ResponseItem::FunctionCall {
                                        id: Some(ResponseItemId::from_server(item_id)),
                                        name,
                                        namespace: None,
                                        arguments: partial_json,
                                        encrypted_function_args: None,
                                        call_id,
                                        internal_chat_message_metadata_passthrough: None,
                                    },
                                )))
                                .await;
                        }
                        ActiveBlock::Thinking => {}
                    }
                }
            }
            AnthropicStreamEvent::MessageDelta { delta, usage } => {
                if let Some(reason) = delta.stop_reason {
                    stop_reason = Some(reason);
                }
                if let Some(u) = usage {
                    output_tokens = u.output_tokens;
                }
            }
            AnthropicStreamEvent::MessageStop => {
                break;
            }
            AnthropicStreamEvent::Ping => {}
            AnthropicStreamEvent::Error { error } => {
                let _ = tx_event.send(Err(ApiError::Stream(error.message))).await;
                return;
            }
        }
    }

    // Flush any unstopped active blocks
    for (_, block) in active_blocks.drain() {
        match block {
            ActiveBlock::Text { item_id, text } => {
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
            ActiveBlock::ToolUse {
                item_id,
                call_id,
                name,
                partial_json,
            } => {
                let _ = tx_event
                    .send(Ok(ResponseEvent::OutputItemDone(
                        ResponseItem::FunctionCall {
                            id: Some(ResponseItemId::from_server(item_id)),
                            name,
                            namespace: None,
                            arguments: partial_json,
                            encrypted_function_args: None,
                            call_id,
                            internal_chat_message_metadata_passthrough: None,
                        },
                    )))
                    .await;
            }
            ActiveBlock::Thinking => {}
        }
    }

    let is_max_tokens = stop_reason.as_deref() == Some("max_tokens");
    let total_tokens = input_tokens + output_tokens;
    let _ = tx_event
        .send(Ok(ResponseEvent::Completed {
            response_id: response_id.unwrap_or_else(|| format!("msg_{}", Uuid::new_v4())),
            token_usage: Some(TokenUsage {
                input_tokens,
                cached_input_tokens: cached_tokens,
                cache_write_input_tokens: cache_write_tokens,
                output_tokens,
                reasoning_output_tokens: 0,
                total_tokens,
                codex_rollout_budget_units: None,
            }),
            usage_metadata: None,
            end_turn: Some(!is_max_tokens),
        }))
        .await;
}
