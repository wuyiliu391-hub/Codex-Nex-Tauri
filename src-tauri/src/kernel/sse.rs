//! Server-Sent Events decoding, shared by every HTTP provider.
//!
//! SSE framing is easy to get subtly wrong, so it lives in one place with its
//! own tests rather than being re-implemented per protocol.
//!
//! ## The framing rules that matter
//!
//! A response body arrives as arbitrary byte chunks that do NOT align with
//! event boundaries: one chunk may hold three events, or half of one. The
//! decoder therefore buffers until it sees a complete line, which is the same
//! discipline the deleted `adapter.rs` used (and the reason its `sse_buffer`
//! was flagged as unbounded — see `MAX_BUFFER` below).
//!
//! Per the SSE spec (https://html.spec.whatwg.org/multipage/server-sent-events.html):
//!  * events are separated by a blank line
//!  * `data:` may repeat, and the payload is the lines joined with `\n`
//!  * a line starting with `:` is a comment (used as a keep-alive)
//!  * the field name is followed by an optional single space
//!
//! We only need `data:` and `[DONE]`, but comments are skipped correctly so
//! keep-alives do not produce parse errors.

/// Cap on the un-parsed buffer. A provider that never sends a newline would
/// otherwise grow this without bound. 1 MiB is far above any legitimate single
/// event (a large tool-call argument blob is the realistic worst case).
pub const MAX_BUFFER: usize = 1024 * 1024;

/// One decoded SSE event.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct SseEvent {
    /// `None` when the stream sent no `event:` field.
    pub event: Option<String>,
    /// Payload with multi-line `data:` joined by `\n`.
    pub data: String,
}

impl SseEvent {
    /// True for the OpenAI-style end-of-stream sentinel.
    pub fn is_done(&self) -> bool {
        self.data.trim() == "[DONE]"
    }
}

/// Error from SSE decoding.
#[derive(Debug, thiserror::Error, PartialEq, Eq)]
pub enum SseError {
    #[error("SSE buffer exceeded {MAX_BUFFER} bytes without a complete line")]
    BufferOverflow,
}

/// Incremental SSE decoder.
///
/// Feed it raw bytes as they arrive; drain complete events with
/// [`SseDecoder::drain`]. Partial lines stay buffered across calls, which is
/// what makes it safe against arbitrary chunk boundaries.
#[derive(Debug, Default)]
pub struct SseDecoder {
    buffer: String,
    /// Accumulates `data:` lines for the event currently being built.
    data_lines: Vec<String>,
    /// `event:` field for the event currently being built.
    current_event: Option<String>,
}

impl SseDecoder {
    pub fn new() -> Self {
        Self::default()
    }

    /// Feed a raw chunk. Invalid UTF-8 is replaced rather than rejected: a
    /// provider that splits a multi-byte character across chunks must not kill
    /// the turn.
    pub fn push(&mut self, bytes: &[u8]) -> Result<(), SseError> {
        self.buffer.push_str(&String::from_utf8_lossy(bytes));
        if self.buffer.len() > MAX_BUFFER {
            return Err(SseError::BufferOverflow);
        }
        Ok(())
    }

    /// Feed a string directly (used by tests and by providers that already
    /// decoded the body).
    pub fn push_str(&mut self, text: &str) -> Result<(), SseError> {
        self.push(text.as_bytes())
    }

    /// Extract every complete event currently buffered.
    ///
    /// A trailing partial line stays in the buffer for the next `push`.
    pub fn drain(&mut self) -> Vec<SseEvent> {
        let mut out = Vec::new();

        while let Some(idx) = self.buffer.find('\n') {
            // `split_off` keeps the remainder without copying the head twice.
            let rest = self.buffer.split_off(idx + 1);
            let line = std::mem::replace(&mut self.buffer, rest);
            let line = line.trim_end_matches(['\n', '\r']).to_string();

            if line.is_empty() {
                // Blank line terminates the event.
                if let Some(event) = self.take_event() {
                    out.push(event);
                }
                continue;
            }

            // `:` prefix is a comment (keep-alive). Skip without terminating.
            if line.starts_with(':') {
                continue;
            }

            let (field, value) = match line.split_once(':') {
                Some((f, v)) => (f, v.strip_prefix(' ').unwrap_or(v)),
                // A line with no colon is a field with an empty value.
                None => (line.as_str(), ""),
            };

            match field {
                "data" => self.data_lines.push(value.to_string()),
                "event" => self.current_event = Some(value.to_string()),
                // `id` / `retry` are not needed for model streams.
                _ => {}
            }
        }

        out
    }

    /// Flush an event that was not terminated by a trailing blank line.
    ///
    /// Some gateways end the body right after the last `data:` line. Call this
    /// once the stream is exhausted so the final event is not lost.
    pub fn finish(&mut self) -> Option<SseEvent> {
        if !self.buffer.is_empty() {
            let line = std::mem::take(&mut self.buffer);
            let line = line.trim_end_matches(['\n', '\r']).to_string();
            if let Some((field, value)) = line.split_once(':') {
                let value = value.strip_prefix(' ').unwrap_or(value);
                if field == "data" {
                    self.data_lines.push(value.to_string());
                }
            }
        }
        self.take_event()
    }

    /// Build the pending event, if any, and reset per-event state.
    fn take_event(&mut self) -> Option<SseEvent> {
        if self.data_lines.is_empty() && self.current_event.is_none() {
            return None;
        }
        let data = std::mem::take(&mut self.data_lines).join("\n");
        let event = self.current_event.take();
        Some(SseEvent { event, data })
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn events(chunks: &[&str]) -> Vec<SseEvent> {
        let mut d = SseDecoder::new();
        let mut out = Vec::new();
        for c in chunks {
            d.push_str(c).expect("push");
            out.extend(d.drain());
        }
        if let Some(last) = d.finish() {
            out.push(last);
        }
        out
    }

    #[test]
    fn single_event_in_one_chunk() {
        let out = events(&["data: hello\n\n"]);
        assert_eq!(out.len(), 1);
        assert_eq!(out[0].data, "hello");
    }

    #[test]
    fn multiple_events_in_one_chunk() {
        let out = events(&["data: one\n\ndata: two\n\n"]);
        assert_eq!(out.len(), 2);
        assert_eq!(out[0].data, "one");
        assert_eq!(out[1].data, "two");
    }

    #[test]
    fn event_split_across_chunks_is_reassembled() {
        // The realistic case: chunk boundaries do not align with events.
        let out = events(&["da", "ta: spl", "it\n", "\n"]);
        assert_eq!(out.len(), 1);
        assert_eq!(out[0].data, "split");
    }

    #[test]
    fn crlf_line_endings_are_accepted() {
        let out = events(&["data: crlf\r\n\r\n"]);
        assert_eq!(out.len(), 1);
        assert_eq!(out[0].data, "crlf");
    }

    #[test]
    fn multiline_data_is_joined_with_newline() {
        let out = events(&["data: line1\ndata: line2\n\n"]);
        assert_eq!(out.len(), 1);
        assert_eq!(out[0].data, "line1\nline2");
    }

    #[test]
    fn comments_are_skipped_without_terminating_the_event() {
        // A keep-alive between two data lines must not split the event.
        let out = events(&["data: a\n: keep-alive\ndata: b\n\n"]);
        assert_eq!(out.len(), 1);
        assert_eq!(out[0].data, "a\nb");
    }

    #[test]
    fn event_field_is_captured() {
        let out = events(&["event: delta\ndata: x\n\n"]);
        assert_eq!(out.len(), 1);
        assert_eq!(out[0].event.as_deref(), Some("delta"));
        assert_eq!(out[0].data, "x");
    }

    #[test]
    fn done_sentinel_is_recognised() {
        let out = events(&["data: [DONE]\n\n"]);
        assert_eq!(out.len(), 1);
        assert!(out[0].is_done());
    }

    #[test]
    fn value_without_leading_space_is_accepted() {
        // The spec makes the space after `:` optional.
        let out = events(&["data:nospace\n\n"]);
        assert_eq!(out.len(), 1);
        assert_eq!(out[0].data, "nospace");
    }

    #[test]
    fn json_payload_survives_round_trip() {
        let payload = r#"{"choices":[{"delta":{"content":"hi"}}]}"#;
        let out = events(&[&format!("data: {payload}\n\n")]);
        assert_eq!(out.len(), 1);
        let v: serde_json::Value = serde_json::from_str(&out[0].data).expect("valid json");
        assert_eq!(v["choices"][0]["delta"]["content"], "hi");
    }

    #[test]
    fn final_event_without_trailing_blank_line_is_flushed() {
        let mut d = SseDecoder::new();
        d.push_str("data: last").expect("push");
        assert!(d.drain().is_empty(), "no blank line yet, so nothing complete");
        let last = d.finish().expect("finish yields the pending event");
        assert_eq!(last.data, "last");
    }

    #[test]
    fn buffer_overflow_is_reported_not_ignored() {
        let mut d = SseDecoder::new();
        // No newline anywhere, so nothing can be drained.
        let big = "x".repeat(MAX_BUFFER + 1);
        let err = d.push_str(&big).expect_err("must report overflow");
        assert_eq!(err, SseError::BufferOverflow);
    }

    #[test]
    fn empty_input_yields_no_events() {
        let out = events(&["", "\n", "\n\n"]);
        assert!(out.is_empty(), "blank lines alone are not an event: {out:?}");
    }
}
