---
feature: in-process-engine
status: delivered
updated: 2026-09-17
---

# In-process Codex engine is now the default

## What changed

`src-tauri/Cargo.toml`: **`default = ["in-process"]`**. The official codex-rs
sources under `src/backend/` (already workspace members) now compile into the
Tauri process. **No external `codex-app-server.exe` is required.** Opt out with
`--no-default-features` to restore the sidecar path.

This deliberately reverses the 2026-09-17 `1649ca9` revert, which had made
shell-only the default "pre-v1". The trade-off (backend compile time, coupling to
core changes) is accepted per the project owner's direction.

## Event-forwarding adapter (the core new code)

The in-process runtime exposes events via `InProcessClientHandle::next_event()`
as `InProcessServerEvent` values. The old `spawn_event_pump` was a **no-op**
(only a comment), so switching the default without this would have left the UI
receiving zero events.

`sidecar.rs` now:

1. Splits the started handle: `sender()` stays in `InProcessEngine` for
   request/response; the handle (owning the event receiver) moves into a pump task.
2. `spawn_event_pump` forwards each event into the **same**
   `broadcast::Sender<ServerMessage>` the sidecar used.
3. `event_to_server_message` serializes each event to JSON and re-parses it with
   `protocol::parse_server_message`. Because `ServerNotification` serializes to
   `{ "method", "params" }` and `ServerRequest` to `{ "method", "id", "params" }`,
   both hit the existing parser branches — so `events.rs` and the whole
   `codex:*` → `agent:*` frontend chain are **unchanged**.
4. `Lagged` events are logged, not forwarded (transport health marker).

## Startup / shutdown

- The backend still starts on a background task so `EngineHandle::start` stays
  non-blocking. `rpc` now **waits up to ~4s** for the runtime to appear before
  failing, so an early RPC does not race startup.
- With the feature on, the sidecar spawn block is compiled out entirely.
- `shutdown` signals the pump via a oneshot, then the pump awaits
  `handle.shutdown()`.
- `initialize_meta` returns `None` in-process (the runtime performs the
  handshake internally without surfacing it); the frontend treats it as optional.

## Gated code

Sidecar-only helpers (`client_clone`, `store_client`, `listen_url`,
`sidecar_alive`, `connect_with_retry`) and the binary-resolution functions are
`#[cfg(not(feature = "in-process"))]` — kept intact for the opt-out path.

## Verification

- `node scripts/check-frontend.mjs` etc: unaffected (frontend untouched).
- **Rust compile is CI-only** (no local cargo). This is the highest-risk change
  so far; it is committed alone so a red CI can be rolled back precisely.

## Not verified

Whether the 100+ crate backend actually links cleanly into the Tauri binary on
windows-latest, and whether the in-process runtime starts without a `config.toml`.
Depends entirely on the next CI run.
