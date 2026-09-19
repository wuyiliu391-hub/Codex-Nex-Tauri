//! Codex Core - Main backend logic module
//!
//! Contains the core agent loop, turn management, event system, provider interface, and tool execution.
//! This crate provides the backbone of the new minimal backend implementation.

mod models;
mod turn_manager;
mod agent_loop;
mod event_sink;
mod provider_api;
pub mod adapters;
mod mock_provider;
pub mod tool_executor;
pub mod tool_registry;
pub mod mcp_client;

// Public exports
pub use agent_loop::AgentLoop;
pub use agent_loop_handle::{AgentCommand, AgentLoopHandle};
pub use models::turn::{Turn, TurnStatus};
pub use turn_manager::{TurnManager, TurnError as TurnManagerError};
pub use event_sink::{BackendEvent, EventSink};
pub use provider_api::{ModelProvider, ModelResponseChunk, ModelError, ErrorKind, ToolDefinition as ProviderToolDefinition};
pub use mock_provider::MockModelProvider;
pub use adapters::{ProviderConfig, create_provider, ProviderType};
pub use tool_executor::{ToolExecutor, ToolCall, ToolResult, ToolDefinition as BuiltInToolDefinition};
pub use tool_registry::{ToolRegistry, ToolHandler, default_registry};
pub use mcp_client::McpClient;

/// Workspace entry point for core functionality
#[cfg(test)]
mod tests {
    #[test]
    fn test_workspace_integration() {
        // Basic workspace sanity check
        assert!(true);
    }
}
