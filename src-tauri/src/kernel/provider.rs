//! Model provider abstraction for the self-developed kernel.
//!
//! A provider turns a conversation into a stream of output chunks. The kernel
//! does not care how the provider produces them; today only `EchoProvider`
//! exists, and a real HTTP/SSE provider will implement the same trait.
//!
//! ## Why an echo provider ships first
//!
//! The previous backend failed at the transport layer, not the model layer.
//! Proving `invoke -> kernel -> notification -> UI` end-to-end needs a provider
//! that cannot fail for unrelated reasons (no network, no API key, no quota,
//! no rate limit). `EchoProvider` is that probe.
//!
//! It is NOT a fake model and NOT a fake success: it produces genuinely
//! derived output (it echoes the user's own text), it is documented as a
//! placeholder, and `ProviderChunk::is_placeholder` marks the produced items so
//! the UI can label them honestly. Nothing pretends an API call happened.

use async_trait::async_trait;
use serde::{Deserialize, Serialize};

/// One chunk of provider output.
///
/// Kept deliberately close to the wire shape the frontend already consumes
/// (`item/agentMessage/delta` with a `delta` field, and `item/reasoning/textDelta`
/// for reasoning), so the kernel's translation layer stays thin.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum ProviderChunk {
    /// A piece of the user-visible answer.
    Text { delta: String },
    /// A piece of reasoning/thinking output, rendered as its own block.
    Reasoning { delta: String },
    /// Token accounting, emitted once near the end of a turn.
    ///
    /// `cached_input_tokens` / `reasoning_output_tokens` / `model_context_window`
    /// are optional because no wire protocol reports all three: OpenAI-style
    /// usage carries cached prompt tokens, Anthropic reports cache reads, and
    /// the context window is a property of the *model*, which only some gateways
    /// echo back. Each stays `None` when the provider did not state it, so the
    /// UI can tell "zero" from "unknown" — the context-usage badge renders only
    /// when `model_context_window` is present and positive.
    Usage {
        input_tokens: u64,
        output_tokens: u64,
        total_tokens: u64,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        cached_input_tokens: Option<u64>,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        reasoning_output_tokens: Option<u64>,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        model_context_window: Option<u64>,
    },
    /// The provider failed mid-stream. `retryable` lets the kernel decide
    /// whether to surface it as a warning or fail the turn outright.
    Error {
        message: String,
        retryable: bool,
    },
}

impl ProviderChunk {
    pub fn text(delta: impl Into<String>) -> Self {
        ProviderChunk::Text {
            delta: delta.into(),
        }
    }

    pub fn reasoning(delta: impl Into<String>) -> Self {
        ProviderChunk::Reasoning {
            delta: delta.into(),
        }
    }
}

/// A message in the conversation handed to a provider.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ChatMessage {
    /// `user` or `assistant`.
    pub role: String,
    pub text: String,
}

impl ChatMessage {
    pub fn user(text: impl Into<String>) -> Self {
        Self {
            role: "user".into(),
            text: text.into(),
        }
    }

    pub fn assistant(text: impl Into<String>) -> Self {
        Self {
            role: "assistant".into(),
            text: text.into(),
        }
    }
}

/// Provider errors. Kept separate from `SessionError` so a provider swap cannot
/// change session-layer semantics.
#[derive(Debug, thiserror::Error)]
pub enum ProviderError {
    #[error("provider is not configured: {0}")]
    NotConfigured(String),
    #[error("provider request failed: {0}")]
    Request(String),
    #[error("provider stream ended unexpectedly: {0}")]
    Stream(String),
}

/// A streaming model backend.
///
/// `stream` is called once per turn and yields chunks until the answer is
/// complete. Implementations must be `Send + Sync` because a turn runs on a
/// background task while other commands continue to be served.
#[async_trait]
pub trait ModelProvider: Send + Sync {
    /// Human-readable provider name, surfaced in logs and diagnostics.
    fn name(&self) -> &'static str;

    /// True when this provider does not call a real model. The kernel records
    /// this on produced items so the UI never implies a real completion.
    fn is_placeholder(&self) -> bool {
        false
    }

    /// Produce the assistant's answer for `messages`, calling `on_chunk` for
    /// every chunk as it becomes available.
    ///
    /// Taking a callback rather than returning a `Stream` keeps the trait free
    /// of a specific stream crate and makes the provider trivially testable.
    /// The kernel decides how to turn callbacks into Tauri events.
    async fn stream(
        &self,
        messages: &[ChatMessage],
        on_chunk: &mut (dyn FnMut(ProviderChunk) + Send),
    ) -> Result<(), ProviderError>;
}

/// Deterministic offline provider used to validate the transport.
///
/// Emits a short reasoning line followed by the user's own text, split into
/// word-sized deltas so the streaming path is genuinely exercised (a single
/// chunk would not catch delta-accumulation bugs).
pub struct EchoProvider {
    /// Delay between chunks. Tests set this to zero.
    chunk_delay: std::time::Duration,
}

impl Default for EchoProvider {
    fn default() -> Self {
        Self::new()
    }
}

impl EchoProvider {
    pub fn new() -> Self {
        Self {
            chunk_delay: std::time::Duration::from_millis(18),
        }
    }

    /// Zero-delay variant for tests and for fast smoke runs.
    pub fn immediate() -> Self {
        Self {
            chunk_delay: std::time::Duration::ZERO,
        }
    }
}

#[async_trait]
impl ModelProvider for EchoProvider {
    fn name(&self) -> &'static str {
        "echo"
    }

    fn is_placeholder(&self) -> bool {
        true
    }

    async fn stream(
        &self,
        messages: &[ChatMessage],
        on_chunk: &mut (dyn FnMut(ProviderChunk) + Send),
    ) -> Result<(), ProviderError> {
        let last_user = messages
            .iter()
            .rev()
            .find(|m| m.role == "user")
            .map(|m| m.text.as_str())
            .unwrap_or("");

        if last_user.trim().is_empty() {
            on_chunk(ProviderChunk::Error {
                message: "empty input".into(),
                retryable: false,
            });
            return Err(ProviderError::Request("empty input".into()));
        }

        on_chunk(ProviderChunk::reasoning(
            "Echo provider active — no model call was made. ",
        ));

        // Split on whitespace but keep it, so the reassembled text is identical
        // to the input. This is what makes delta accumulation observable.
        let mut pieces: Vec<String> = Vec::new();
        let mut current = String::new();
        for ch in last_user.chars() {
            current.push(ch);
            if ch.is_whitespace() {
                pieces.push(std::mem::take(&mut current));
            }
        }
        if !current.is_empty() {
            pieces.push(current);
        }

        for piece in pieces {
            if !self.chunk_delay.is_zero() {
                tokio::time::sleep(self.chunk_delay).await;
            }
            on_chunk(ProviderChunk::text(piece));
        }

        on_chunk(ProviderChunk::Usage {
            input_tokens: approx_tokens(last_user),
            output_tokens: approx_tokens(last_user),
            total_tokens: approx_tokens(last_user) * 2,
            // The echo provider has no model behind it, so it cannot know any of
            // these. Reporting `None` keeps the context badge hidden instead of
            // showing a percentage derived from a made-up window.
            cached_input_tokens: None,
            reasoning_output_tokens: None,
            model_context_window: None,
        });

        Ok(())
    }
}

/// Rough token estimate (~4 chars/token) so the usage path is exercised without
/// a tokenizer. Documented as approximate wherever it is surfaced.
fn approx_tokens(text: &str) -> u64 {
    (text.chars().count() as u64).div_ceil(4).max(1)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn collect(p: &EchoProvider, text: &str) -> Vec<ProviderChunk> {
        let mut out = Vec::new();
        let msgs = vec![ChatMessage::user(text)];
        let rt = tokio::runtime::Builder::new_current_thread()
            .enable_all()
            .build()
            .expect("runtime");
        rt.block_on(async {
            let mut sink = |c: ProviderChunk| out.push(c);
            p.stream(&msgs, &mut sink).await.expect("stream ok");
        });
        out
    }

    #[test]
    fn echo_reassembles_the_input_exactly() {
        let p = EchoProvider::immediate();
        let input = "hello world from the kernel";
        let chunks = collect(&p, input);
        let text: String = chunks
            .iter()
            .filter_map(|c| match c {
                ProviderChunk::Text { delta } => Some(delta.as_str()),
                _ => None,
            })
            .collect();
        assert_eq!(text, input, "deltas must reassemble to the original text");
    }

    #[test]
    fn emits_reasoning_then_usage() {
        let p = EchoProvider::immediate();
        let chunks = collect(&p, "abc def");
        assert!(
            matches!(chunks.first(), Some(ProviderChunk::Reasoning { .. })),
            "first chunk should be reasoning, got {:?}",
            chunks.first()
        );
        assert!(
            matches!(chunks.last(), Some(ProviderChunk::Usage { .. })),
            "last chunk should be usage, got {:?}",
            chunks.last()
        );
    }

    #[test]
    fn empty_input_is_an_error_not_a_silent_success() {
        let p = EchoProvider::immediate();
        let msgs = vec![ChatMessage::user("   ")];
        let rt = tokio::runtime::Builder::new_current_thread()
            .enable_all()
            .build()
            .expect("runtime");
        let result = rt.block_on(async {
            let mut sink = |_c: ProviderChunk| {};
            p.stream(&msgs, &mut sink).await
        });
        assert!(
            matches!(result, Err(ProviderError::Request(_))),
            "empty input must fail loudly, got {result:?}"
        );
    }

    #[test]
    fn placeholder_is_declared() {
        assert!(EchoProvider::immediate().is_placeholder());
    }

    #[test]
    fn multiline_input_is_preserved() {
        let p = EchoProvider::immediate();
        let input = "line one\nline two\n";
        let chunks = collect(&p, input);
        let text: String = chunks
            .iter()
            .filter_map(|c| match c {
                ProviderChunk::Text { delta } => Some(delta.as_str()),
                _ => None,
            })
            .collect();
        assert_eq!(text, input);
    }
}
