//! Mock provider for testing Phase 1 flow.
//! Returns predefined text chunks instead of real API calls.

use std::pin::Pin;
use tokio_stream::Stream;

use crate::{provider_api::{ModelProvider, ModelResponseChunk, ModelError, ErrorKind}, models::TurnItem};

pub struct MockModelProvider {
    response_chunks: Vec<String>,
}

impl MockModelProvider {
    pub fn new() -> Self {
        Self {
            response_chunks: vec![
                "Hello".to_string(),
                ", World!".to_string(),
                " This is a test response.".to_string(),
            ],
        }
    }
}

impl Default for MockModelProvider {
    fn default() -> Self { Self::new() }
}

impl ModelProvider for MockModelProvider {
    fn request(
        &self,
        _messages: &[TurnItem],
        _tools: Option<&[crate::provider_api::ToolDefinition]>,
    ) -> Pin<Box<dyn Stream<Item = Result<ModelResponseChunk, ModelError>> + Send>> {
        use futures::stream;
        
        let chunks = self.response_chunks.clone();
        Box::pin(stream::iter(chunks.into_iter().map(|text| {
            Ok(ModelResponseChunk::Text { text })
        })))
    }
}
