//! Builds the active provider from the shell's persisted configuration.
//!
//! This is the bridge between the L1 store (`state.rs`, which owns
//! `shell-state.json`) and the L2 kernel (which only knows the
//! `ModelProvider` trait). Keeping it separate means:
//!
//!  * the kernel never reads files or settings — it just receives a provider
//!  * the store's shape can change without touching provider code
//!  * the fallback rule lives in exactly one place (see `build`)
//!
//! ## The fallback rule
//!
//! When no usable provider is configured, the kernel runs `EchoProvider`.
//! That is deliberate: the app stays usable and the echo provider discloses
//! itself in the stream, so a user never mistakes its output for a model's.
//! The alternative — refusing to start a turn — is worse for a first run.

use std::sync::Arc;

use super::http_provider::{HttpProvider, HttpProviderConfig, WireProtocol};
use super::provider::{EchoProvider, ModelProvider};

/// Outcome of resolving the configured provider.
pub enum Resolved {
    /// A real HTTP provider is ready.
    Http(Arc<dyn ModelProvider>),
    /// No usable configuration; the offline probe is in use.
    Echo { reason: String },
}

impl Resolved {
    pub fn provider(self) -> Arc<dyn ModelProvider> {
        match self {
            Resolved::Http(p) => p,
            Resolved::Echo { reason } => {
                tracing::warn!(reason = %reason, "using echo provider");
                Arc::new(EchoProvider::new())
            }
        }
    }

    pub fn is_echo(&self) -> bool {
        matches!(self, Resolved::Echo { .. })
    }
}

/// Raw values pulled out of the shell store.
///
/// A plain struct rather than a reference to the store so this module stays
/// testable without a Tauri app handle.
#[derive(Debug, Clone, Default)]
pub struct ProviderInputs {
    /// Id of the provider the user selected (`settings.active_provider_id`).
    pub active_provider_id: String,
    /// Model id (`settings.active_model`).
    pub active_model: String,
    /// provider id -> base URL.
    pub endpoints: std::collections::HashMap<String, String>,
    /// provider id -> protocol string.
    pub protocols: std::collections::HashMap<String, String>,
    /// provider id -> API key.
    pub secrets: std::collections::HashMap<String, String>,
}

/// Build the provider the configuration describes.
///
/// Returns `Resolved::Echo` with an explanatory reason for every case that
/// cannot produce a real provider, so the caller can log *why* rather than
/// leaving the user to guess.
pub fn build(inputs: &ProviderInputs) -> Resolved {
    if inputs.active_provider_id.trim().is_empty() {
        return Resolved::Echo {
            reason: "no provider selected in settings".into(),
        };
    }

    let id = inputs.active_provider_id.trim();

    let Some(base_url) = inputs.endpoints.get(id).map(|s| s.trim()).filter(|s| !s.is_empty())
    else {
        return Resolved::Echo {
            reason: format!("provider '{id}' has no base URL configured"),
        };
    };

    if inputs.active_model.trim().is_empty() {
        return Resolved::Echo {
            reason: format!("provider '{id}' has no model selected"),
        };
    }

    let protocol_raw = inputs
        .protocols
        .get(id)
        .map(String::as_str)
        .unwrap_or("openai_chat");
    let protocol = WireProtocol::parse(protocol_raw);

    let api_key = inputs.secrets.get(id).cloned().unwrap_or_default();

    // A missing key is only fatal for providers that require one. Ollama runs
    // locally without auth, and some self-hosted gateways are open, so an empty
    // key is allowed through and the endpoint decides.
    let config = HttpProviderConfig {
        id: id.to_string(),
        base_url: base_url.to_string(),
        protocol,
        api_key,
        model: inputs.active_model.trim().to_string(),
        system: None,
        temperature: None,
    };

    match HttpProvider::new(config) {
        Ok(provider) => {
            tracing::info!(
                provider = %id,
                protocol = provider.protocol().as_str(),
                endpoint = %provider.endpoint(),
                "HTTP provider ready"
            );
            Resolved::Http(Arc::new(provider))
        }
        Err(err) => Resolved::Echo {
            reason: format!("provider '{id}' is misconfigured: {err}"),
        },
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::collections::HashMap;

    fn inputs() -> ProviderInputs {
        let mut endpoints = HashMap::new();
        endpoints.insert("openai".to_string(), "https://api.openai.com/v1".to_string());
        let mut protocols = HashMap::new();
        protocols.insert("openai".to_string(), "openai_chat".to_string());
        let mut secrets = HashMap::new();
        secrets.insert("openai".to_string(), "sk-test".to_string());
        ProviderInputs {
            active_provider_id: "openai".into(),
            active_model: "gpt-4o".into(),
            endpoints,
            protocols,
            secrets,
        }
    }

    #[test]
    fn complete_configuration_yields_an_http_provider() {
        let r = build(&inputs());
        assert!(!r.is_echo(), "a fully configured provider must not fall back");
        let p = r.provider();
        assert!(!p.is_placeholder());
    }

    #[test]
    fn no_selection_falls_back_with_a_reason() {
        let mut i = inputs();
        i.active_provider_id = String::new();
        match build(&i) {
            Resolved::Echo { reason } => assert!(reason.contains("no provider selected"), "{reason}"),
            _ => panic!("expected echo fallback"),
        }
    }

    #[test]
    fn missing_base_url_falls_back() {
        let mut i = inputs();
        i.endpoints.clear();
        assert!(build(&i).is_echo());
    }

    #[test]
    fn blank_base_url_falls_back() {
        let mut i = inputs();
        i.endpoints.insert("openai".into(), "   ".into());
        assert!(build(&i).is_echo());
    }

    #[test]
    fn missing_model_falls_back() {
        let mut i = inputs();
        i.active_model = "  ".into();
        assert!(build(&i).is_echo());
    }

    #[test]
    fn invalid_base_url_falls_back_rather_than_panicking() {
        let mut i = inputs();
        i.endpoints.insert("openai".into(), "api.openai.com".into());
        match build(&i) {
            Resolved::Echo { reason } => assert!(reason.contains("misconfigured"), "{reason}"),
            _ => panic!("expected echo fallback"),
        }
    }

    #[test]
    fn ollama_without_a_key_still_builds() {
        // Local Ollama needs no credential; an empty key must not block it.
        let mut i = inputs();
        i.protocols.insert("openai".into(), "ollama".into());
        i.endpoints.insert("openai".into(), "http://127.0.0.1:11434".into());
        i.secrets.clear();
        assert!(!build(&i).is_echo(), "keyless local provider must be allowed");
    }

    #[test]
    fn unknown_protocol_string_defaults_to_openai_chat() {
        let mut i = inputs();
        i.protocols.insert("openai".into(), "something-new".into());
        // Should still build; the protocol parse is lenient by design.
        assert!(!build(&i).is_echo());
    }

    #[test]
    fn protocol_defaults_when_absent_from_the_map() {
        let mut i = inputs();
        i.protocols.clear();
        assert!(!build(&i).is_echo(), "absent protocol should default, not fail");
    }
}
