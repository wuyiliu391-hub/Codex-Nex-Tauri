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
//!   kernel::session    (thread + turn state machine, in-memory)
//!     │
//!     ▼
//!   kernel::provider   (model backends: echo today, HTTP/SSE later)
//! ```
//!
//! Design rules:
//!  * No subprocess, no socket, no port. Everything runs in-process, so the
//!    cold-start race, the 120 s dead-socket hang, the unauthenticated loopback
//!    listener and the orphaned-child problems cannot occur by construction.
//!  * Every notification we emit is validated against `protocol::notifications`
//!    so the frontend reducer always recognises it.
//!  * Nothing is faked. The echo provider is explicitly named and explicitly
//!    marked as a placeholder in its own docs — it is a transport probe, not a
//!    pretend model.

pub mod events;
pub mod protocol;
pub mod provider;
pub mod session;
pub mod state;

pub use events::KernelEvent;
pub use provider::{EchoProvider, ModelProvider, ProviderChunk};
pub use session::{SessionManager, Thread, Turn, TurnStatus};
pub use state::KernelState;
