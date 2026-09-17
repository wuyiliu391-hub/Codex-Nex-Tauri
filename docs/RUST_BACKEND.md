# Rust Backend Integration — official `codex-app-server` v0.154.0

This document is the source of truth for how Codex-Tauri embeds the official
OpenAI Codex Rust engine (`C:\Users\Administrator\Desktop\codex-rust-v0.154.0\codex-rs`).

## Decision (2026-09-17 revision): in-process is now the default

The official `codex-rs` sources live **in this repository** under
`src/backend/` and are members of the root workspace, so the shell can link
them directly instead of shipping/pointing at an external `codex-app-server.exe`.

As of this revision **`default = ["in-process"]`**: the engine runs inside the
Tauri process and no external binary is required. Opt out with
`--no-default-features` to fall back to the sidecar.

The earlier "sidecar only" decision was reversed deliberately; the trade-off
(compile time, coupling to core changes) is accepted in exchange for removing
the external binary and getting the full in-process event stream.

### Event forwarding adapter

The in-process runtime exposes events via `InProcessClientHandle::next_event()`
as `InProcessServerEvent` values. `sidecar.rs` pumps them into the same
`broadcast::Sender<ServerMessage>` the sidecar used, by serializing each event
to JSON and re-parsing with `protocol::parse_server_message`. Because
`ServerNotification` serializes to `{ "method", "params" }` and `ServerRequest`
to `{ "method", "id", "params" }`, both land on the existing parser branches —
so `events.rs` and the whole `codex:*` → `agent:*` frontend chain are unchanged.

### Mode A — Sidecar binary (opt-in fallback)

Selected with `--no-default-features`. Spawns `codex-app-server.exe` and
speaks JSON-RPC over WebSocket (`ws://127.0.0.1:17457`). Kept because it needs
no backend build time and remains useful for shell-only builds.

---

## Mode A — Sidecar binary (default, required for CI)

### How official app-server is started

From `app-server/src/main.rs`:

| CLI flag | Default | Notes |
|----------|---------|-------|
| `--listen URL` | `stdio://` | Supported: `stdio://`, `unix://`, `unix://PATH`, `ws://IP:PORT`, `off` |
| `--session-source SOURCE` | `vscode` | ⚠️ **Not present in the shipped 0.154.0-alpha.6.2 binary** — passing it aborts startup. Probed at runtime; only forwarded when `--help` advertises it. |
| `--strict-config` | false | Reject unknown config.toml fields. |
| `--remote-control` | false | Hidden; enables remote-control without persistence. |

`AppServerTransport` (`app-server-transport/src/transport/mod.rs`):

```text
DEFAULT_LISTEN_URL = "stdio://"
```

Official Desktop uses **stdio spawn** (pipes on the child process). That is
the lowest-latency and most secure transport (no open TCP port).

### Transport recommendation for Codex-Tauri

| Option | Pros | Cons | Status |
|--------|------|------|--------|
| **stdio://** | Official default; no port; works with multi-instance | Needs a stdio JSON-RPC client (new code in `client.rs`) | Documented, not default yet |
| **ws://127.0.0.1:17457** | Existing `CodexClient` already speaks WS; trivial to debug | Loopback port; port collisions | **Current default** |
| unix:// | N/A on Windows | — | Not used |

**Recommendation:** keep **WebSocket on 17457** for the current shell
(works with the existing EngineHandle / CodexClient). Follow-up work: add
a stdio transport behind `settings.app_server_listen = "stdio://"` that
spawns with pipes and reuses the same JSON-RPC framing. Do not block the
desktop on that.

### Binary resolution + content-addressed install (mirrors official Desktop)

Official Desktop copies `codex.exe` into:

```
%LOCALAPPDATA%\OpenAI\Codex\bin\<content-hash>\
```

Codex-Tauri mirrors that layout under its own app dir:

```
%LOCALAPPDATA%\CodexDesktop\bin\<fnv1a64-of-file-bytes>\codex-app-server.exe
```

Resolution order (implemented in `src/codex/sidecar.rs`):

1. `CODEX_APP_SERVER` environment variable (absolute path)
2. `settings.app_server_binary` (user-configured absolute path)
3. Previously installed hash-dir under `%LOCALAPPDATA%\CodexDesktop\bin\`
4. Bundled resource / dev `src-tauri/binaries/codex-app-server-*.exe`
5. Bare `codex-app-server.exe` on `PATH`

If a source path (1/2/4) differs from the installed hash dir, the file is
**copied** into a new hash dir before spawn. The old hash dirs are left in
place (official also keeps prior versions for rollback).

### Spawn argv

The binary ships in two shapes and `sidecar.rs` **probes which one it is** by
running `<bin> app-server --help` and `<bin> --help` (see
`probe_invocation`). Do not assume from the filename — the official multi-call
`codex.exe` is routinely dropped in under the standalone filename.

```
# standalone codex-app-server.exe
codex-app-server.exe --listen ws://127.0.0.1:17457

# multi-call codex.exe (what the official desktop installs)
codex.exe app-server --listen ws://127.0.0.1:17457
```

`settings.app_server_listen` overrides the listen URL when non-empty.

> **Correction (2026-09-17, measured on `codex-cli 0.154.0-alpha.6.2`).**
> The earlier claim that the shipped binary accepts `--session-source` is
> **wrong**. `codex.exe app-server --session-source …` exits immediately with
> `error: unexpected argument '--session-source' found`, so nothing ever binds
> the port and every RPC fails with `os error 10061` (connection refused).
> The flag exists in the source tree this doc was written against, but not in
> the released alpha. `probe_invocation` now reads the `--help` text and only
> passes `--session-source` when the build actually advertises it.

### Building the sidecar

```powershell
# scripts/build-sidecar.ps1  (requires the official tree + Rust toolchain)
.\scripts\build-sidecar.ps1
# or manually:
cd ..\codex-rust-v0.154.0\codex-rs
cargo build -p codex-app-server --release
copy target\release\codex-app-server.exe `
  ..\Codex-Tauri\src-tauri\binaries\codex-app-server-x86_64-pc-windows-msvc.exe
```

CI: the main `build-windows` job is **shell-only** and must keep compiling
without the official tree. An optional `build-sidecar` job (workflow_dispatch
or when `CODEX_RUST_PATH` is available) produces the sidecar artifact.

### In-process feature is OFF by default

`Cargo.toml` documents an optional path dependency:

```toml
# codex-app-server-client = { path = ".../codex-rs/app-server-client", optional = true }
[features]
default = []
# in-process = ["dep:codex-app-server-client"]
```

Enable only on machines that have the full official tree. Cloud CI never
enables it, so shell-only builds stay green.

---

## Mode B — In-process (`codex-app-server-client`)

Official crates:

| Crate | Role |
|-------|------|
| `codex-app-server` | Runtime (`MessageProcessor`, transports, `in_process`) |
| `codex-app-server-client` | Facade: `InProcessAppServerClient` / `RemoteAppServerClient` |
| `codex-app-server-protocol` | Wire types (`ClientRequest`, `ServerNotification`, …) |
| `codex-core` | Agent loop, tools, config |
| `codex-protocol` | Core protocol / session store types |

`codex-app-server-client::InProcessAppServerClient::start`:

- takes `InProcessClientStartArgs` (config, session_source, client_name/version)
- runs `initialize` / `initialized` handshake internally
- exposes typed `ClientRequest` + ordered `AppServerEvent` stream

**Mark as optional.** Pulling this crate pulls the entire workspace. Keep
the feature off by default; do not copy crates into Codex-Tauri.

When the feature is enabled later:

```rust
#[cfg(feature = "in-process")]
// EngineHandle::start uses InProcessAppServerClient instead of spawn+WS.
```

---

## Handshake (required)

Every connection must complete:

1. Client → server request:
   ```json
   {
     "id": "initialize",
     "method": "initialize",
     "params": {
       "clientInfo": {
         "name": "codex-desktop-tauri",
         "title": "Codex Desktop (Tauri)",
         "version": "0.1.0"
       },
       "capabilities": { "experimentalApi": true }
     }
   }
   ```
2. Server responds with `{ userAgent, codexHome, platformFamily, platformOs }`.
3. Client → server notification: `{"method":"initialized"}` (no params field).

Without step 3 the server rejects most subsequent methods (`Already not
initialized` / connection-scoped gate).

`CodexClient::connect` performs this handshake automatically.

---

## Method names (v0.154.0)

Authoritative source: `app-server-protocol/src/protocol/common.rs`
(`client_request_definitions!`, `server_request_definitions!`,
`server_notification_definitions!`).

### Client → server (requests)

| Purpose | Method |
|---------|--------|
| Handshake | `initialize` |
| Create thread | `thread/start` |
| List threads | `thread/list` (response: `{ data: Thread[], nextCursor }`) |
| Read thread | `thread/read` |
| Resume / fork / delete / archive / unarchive | `thread/resume`, `thread/fork`, `thread/delete`, `thread/archive`, `thread/unarchive` |
| Timeline | `thread/timeline/list` (**not** `thread/timeline`) |
| Compact | `thread/compact/start` |
| Start turn | `turn/start` — params `{ threadId, input: UserInput[] }`, **not** `{ input: { items } }` |
| Steer / interrupt | `turn/steer`, `turn/interrupt` |
| Config | `config/read`, `config/value/write`, `config/batchWrite` (**not** `config/get` / `config/update`) |
| Models | `model/list` |
| Account | `account/read` (deprecated alias: `getAuthStatus`) |
| MCP status | `mcpServerStatus/list` (**not** `mcp/listServers`) |
| MCP reload | `config/mcpServer/reload` |
| Skills | `skills/list` |
| Plugins | `plugin/list`, `plugin/install`, `plugin/uninstall` (**no** `plugin/setEnabled`) |
| Hooks | `hooks/list` |
| One-off shell | `command/exec` (**not** `shell/open`) | argv `command: [bin, ...]` + client `processId` for TTY streaming |
| Write shell stdin | `command/exec/write` | `{ processId, deltaBase64 }` or `{ processId, closeStdin: true }` |
| Terminate shell | `command/exec/terminate` | `{ processId }` |

### Client → server (notification)

| Purpose | Method |
|---------|--------|
| Handshake complete | `initialized` |

### Server → client (requests — reply with JSON-RPC response, not a new method)

Turn/start approvals use **v2** methods. Reply to the **server request id**
with a result object; there is no `approval/respond` client method.

| Purpose | Method | Result body |
|---------|--------|-------------|
| Exec approval | `item/commandExecution/requestApproval` | `{ "decision": "accept" \| "decline" \| "cancel" \| "acceptForSession" }` |
| File change approval | `item/fileChange/requestApproval` | `{ "decision": "accept" \| "decline" \| "cancel" \| "acceptForSession" }` |
| Permissions | `item/permissions/requestApproval` | decision object |
| User input | `item/tool/requestUserInput` | answers object |
| MCP elicitation | `mcpServer/elicitation/request` | elicitation response |

Legacy (v1 turns only, not used by `turn/start`): `execCommandApproval`,
`applyPatchApproval`.

### Server → client (notifications)

High-value names for the event bridge:

```
error
thread/started, thread/status/changed, thread/archived, thread/deleted,
thread/unarchived, thread/closed, thread/name/updated, thread/tokenUsage/updated
turn/started, turn/completed, turn/diff/updated, turn/plan/updated
item/started, item/completed
item/agentMessage/delta
item/commandExecution/outputDelta
item/fileChange/outputDelta, item/fileChange/patchUpdated
item/mcpToolCall/progress
serverRequest/resolved
skills/changed
config/warnings
```

Emitted as Tauri events `codex:{method with / replaced by -}` (dots are
rejected by plugin:event validation), e.g.
`codex:turn-completed`, `codex:item-agentMessage-delta`.

---

## Frontend mapping notes

`thread/list` returns `{ data: [...], nextCursor, backwardsCursor }` — **not**
`{ threads: [...] }`. `bridge.js::extractSessions` therefore also accepts
`resp.data`. Same for `mcpServerStatus/list` → `{ data: [...] }`.

`GetState` composites local shell state + fail-soft engine calls. See
`FRONTEND_ENGINE_MAP.md`.

---

## Prebuilt binary requirement

A working desktop **requires a prebuilt** engine binary
(target `x86_64-pc-windows-msvc`) matching v0.154.0. Either shape works:

1. Drop it at `src-tauri/binaries/codex-app-server-x86_64-pc-windows-msvc.exe`, **or**
2. Set `CODEX_APP_SERVER` / `settings.app_server_binary` to an absolute path, **or**
3. Put `codex-app-server.exe` on `PATH`.

**Where to get it without building anything.** The official Windows desktop
already ships a suitable multi-call binary — no `cargo` needed:

```
%LOCALAPPDATA%\OpenAI\Codex\bin\<content-hash>\codex.exe
%USERPROFILE%\.codex\plugins\.plugin-appserver\codex.exe
```

Verified on this machine: `codex-cli 0.154.0-alpha.6.2`, ~284 MB, and
`codex.exe app-server --listen ws://127.0.0.1:17457` binds the port in ~250 ms.
Copy it to the path in (1) — the filename does not need to match the real
shape, because `probe_invocation` detects the subcommand requirement at runtime.

Without a binary the shell still boots; `engine_status.connected == false` and
engine-backed UI degrades to empty lists. Startup also logs an explicit
`no codex-app-server binary resolved` warning instead of failing silently.

---

## Constraints checklist

- [x] Do not copy official crates into Codex-Tauri
- [x] Path dependency only behind an optional feature (off by default)
- [x] Shell-only CI still compiles (no official tree needed)
- [x] Official tree is read-only
- [x] Windows paths / `%LOCALAPPDATA%` install layout
