//! Self-developed kernel for Codex-Tauri.
//!
//! This module tree is OUR OWN implementation. It deliberately does NOT depend
//! on the official `codex-rs` sources or on the prebuilt `codex-app-server`
//! binary. The official project is used only as a *protocol reference*: the
//! method names, notification names and payload shapes below are the frozen
//! contract that the existing React frontend already speaks.
//!
//! Layering (mirrors the product API contract in `docs/ARCHITECTURE.md`):
//!
//! ```text
//!   React UI
//!     │  invoke() / listen("codex:*")
//!     ▼
//!   commands::kernel   (Tauri command layer — the only frontend dependency)
//!     │
//!     ▼
//!   kernel::state      (turn execution, cancellation, counters)
//!     │
//!     ▼
//!   kernel::provider   (model backends)
//!     ├── EchoProvider  offline transport probe
//!     └── HttpProvider  real model calls (OpenAI / Anthropic / Ollama)
//! ```
//!
//! Design rules:
//!  * No subprocess, no socket, no port. Everything runs in-process, so the
//!    cold-start race, the 120 s dead-socket hang, the unauthenticated loopback
//!    listener and the orphaned-child problems cannot occur by construction.
//!  * Every notification we emit is validated against `protocol::notifications`
//!    so the frontend reducer always recognises it.
//!  * Nothing is faked. A provider that does not call a model says so via
//!    `ModelProvider::is_placeholder`, and the kernel surfaces that to the UI.

pub mod events;
pub mod http_provider;
pub mod protocol;
pub mod provider;
pub mod provider_config;
pub mod session;
pub mod sse;
pub mod state;

pub use events::KernelEvent;
pub use http_provider::{HttpProvider, HttpProviderConfig, WireProtocol};
pub use provider::{EchoProvider, ModelProvider, ProviderChunk};
pub use provider_config::{build as build_provider, ProviderInputs, Resolved};
pub use session::{SessionManager, Thread, Turn, TurnStatus};
pub use state::KernelState;
