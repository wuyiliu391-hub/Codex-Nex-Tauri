//! Provider adapters implementation

pub mod openai;
pub mod ollama;

use std::fmt::Debug;

use crate::{provider_api::{ModelProvider, ModelResponseChunk}, models::TurnItem};

/// Configuration for provider instantiation
#[derive(Debug, Clone)]
pub struct ProviderConfig {
    pub provider_type: ProviderType,
    pub base_url: String,
    pub api_key: Option<String>,
    pub model: String,
}

#[derive(Debug, Clone)]
pub enum ProviderType {
    OpenAI,
    Ollama,
}

/// Factory function to create provider instances
pub fn create_provider(config: ProviderConfig) -> Box<dyn ModelProvider> {
    match config.provider_type {
        ProviderType::OpenAI => Box::new(openai::OpenAIProvider {
            base_url: config.base_url,
            api_key: config.api_key,
            model: config.model,
        }),
        ProviderType::Ollama => Box::new(ollama::OllamaProvider {
            base_url: config.base_url,
            api_key: config.api_key,
            model: config.model,
        }),
    }
}
