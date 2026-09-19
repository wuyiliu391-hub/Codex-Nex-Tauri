//! Tauri Bridge - Integration layer between core backend and Tauri commands/events.

pub mod commands;
pub mod events;
pub mod event_sink;

// Re-export for easy access from parent module
pub use commands::*;
pub use events::*;
pub use event_sink::*;

// Re-export core types for convenience
pub use codex_core::{AgentCommand, AgentLoop, AgentLoopHandle};
