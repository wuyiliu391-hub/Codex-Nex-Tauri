//! Protocol adapter for custom providers — the one asset kept from the
//! sidecar era.
//!
//! `adapter.rs` translates OpenAI Chat / Anthropic Messages / Ollama protocols
//! into the Responses API shape, and it is self-contained (it imports no
//! sibling module), so it survived the move to the in-process kernel.
//!
//! Its role going forward: the self-developed kernel will call a provider over
//! HTTP. Rather than teach the kernel three wire protocols, the adapter keeps
//! normalising them to one internal shape, exactly as it did before.
//!
//! ## Deleted when the kernel replaced the WebSocket sidecar
//!
//!  * `sidecar.rs`  — binary resolution, content-hash install, child process
//!                    supervision, CLI shape probing. All unnecessary: there is
//!                    no external binary any more.
//!  * `client.rs`   — the WebSocket JSON-RPC client and its 3-step handshake.
//!                    The kernel is in-process, so there is no socket.
//!  * `events.rs`   — the `ServerMessage` → `codex:*` Tauri event bridge. The
//!                    kernel emits events directly (`crate::kernel::events`).
//!  * `protocol.rs` — JSON-RPC message types and the official method-name list.
//!                    Its code had zero callers; the method inventory already
//!                    lives in `docs/official-ui/APPSERVER-METHOD-INVENTORY-*.md`
//!                    and the kernel's live constants are in
//!                    `crate::kernel::protocol`.
//!
//! Deleting these removed the entire failure class the sidecar had: no binary
//! to resolve, no port to bind, no unauthenticated loopback listener, no child
//! process to orphan, no 120 s dead-socket hang.

pub mod adapter;

pub use adapter::{AdapterState, ProtocolAdapter, ProviderRoute, DEFAULT_ADAPTER_PORT};
