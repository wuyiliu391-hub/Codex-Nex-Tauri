# Rust Backend Integration — official `codex-app-server` (v0.154.0 sidecar)

How Codex-Tauri drives the official OpenAI Codex engine. This document covers
the L1 (engine host) / L2 (engine client) layers from `docs/ARCHITECTURE.md`:
transport, startup, handshake, method names, approvals, and the event bridge.

## Decision (2026-09-18, final): shell-only + prebuilt sidecar

The Tauri shell is the only Rust code we compile. The engine is always the
official prebuilt `codex-app-server` binary (GitHub Releases, tag
`rust-v0.154.0`), spawned as a child process and spoken to over WebSocket
JSON-RPC. It is shipped as a bundled installer resource, never built here.

The earlier **in-process experiment** (vendoring the engine sources into
`src/backend/`, linking them via a cargo feature) is **retired**: the feature
and all path dependencies were removed from `src-tauri/Cargo.toml`, the root
workspace is `members = ["src-tauri"]` only, and no code references it any
more. The vendored tree was deleted from the working branch; it remains
recoverable from git history if the experiment is ever resumed. Do **not**
re-add engine path dependencies to the shell.

Every statement below describes what `src-tauri/src/codex/*` actually does
today.

## How the engine is started

CLI surface of the official binary (from upstream `app-server/src/main.rs`):

| CLI flag | Default | Notes |
|----------|---------|-------|
| `--listen URL` | `stdio://` | Supported: `stdio://`, `unix://`, `unix://PATH`, `ws://IP:PORT`, `off` |
| `--session-source SOURCE` | `vscode` | ⚠️ **Not present in the shipped `codex-cli 0.154.0-alpha.6.2` binary** — passing it aborts startup. Probed at runtime; only forwarded when `--help` advertises it. |
| `--strict-config` | false | Reject unknown `config.toml` fields. |
| `--remote-control` | false | Hidden; enables remote-control without persistence. |

`sidecar.rs` spawns (see *CLI shape probing* below for why two argv shapes
exist):

```text
# standalone codex-app-server.exe
codex-app-server.exe --listen ws://127.0.0.1:17457

# multi-call codex.exe (what the official desktop installs)
codex.exe app-server --listen ws://127.0.0.1:17457

# only when the probed build advertises the flag:
--session-source codex-desktop
```

`settings.app_server_listen` overrides the listen URL when non-empty;
otherwise `DEFAULT_LISTEN_URL = "ws://127.0.0.1:17457"` is used.

Provider API keys are **never written into the engine config**: the shell
stores them in `shell-state.json` (`provider_secrets`) and injects each one
into the child process as the env var named by the provider's `env_key`
(see `state::provider_env_key`, and `docs/provider-setup.md`).

### Transport

| Option | Pros | Cons | Status |
|--------|------|------|--------|
| `ws://127.0.0.1:17457` | `CodexClient` already speaks WS; trivial to debug | Loopback TCP port, unauthenticated — any local process may connect; port collisions | **Current and only transport** |
| `stdio://` | Official desktop default; no port; lower latency | Needs a stdio JSON-RPC client (new code in `client.rs`) | Documented follow-up; **not implemented** |
| `unix://` | — | N/A on Windows (primary target) | Not used |

Follow-up work: add a stdio transport behind `settings.app_server_listen =
"stdio://"` reusing the same JSON-RPC framing. Do not block the desktop on
that. Accepting the loopback-WS risk is a deliberate Windows-first trade-off;
if this ships beyond single-user machines, revisit authentication first.

### Binary resolution + content-addressed install

Implementation: `src-tauri/src/codex/sidecar.rs::resolve_sidecar_source`.
Source lookup order:

1. `CODEX_APP_SERVER` environment variable (absolute path)
2. `settings.app_server_binary` (user-configured absolute path)
3. **Bundled payload / dev drop** — tried before any previous install so an
   updated installer is never shadowed by an older engine left behind:
   `resource_dir()/binaries/…` (NSIS/MSI resource), then files adjacent to
   `current_exe()`, then the dev path `src-tauri/binaries/…`. Candidate
   filenames per directory: `binaries/codex-app-server-x86_64-pc-windows-msvc.exe`,
   `codex-app-server.exe`, `codex-app-server-x86_64-pc-windows-msvc.exe`.
4. Previous content-hash install: newest copy under
   `%LOCALAPPDATA%\CodexDesktop\bin\<hash>\`
5. `PATH` fallback — the bare name `codex-app-server.exe` is spawned as-is.

When a source file is found it is **copied** into
`%LOCALAPPDATA%\CodexDesktop\bin\<fnv1a64-of-file-bytes>\codex-app-server.exe`
before spawn — mirroring the official Desktop layout, content-addressed so
identical bytes dedupe and upgrades land atomically. Two caveats, both known:

* The FNV-1a hash is a **version key, not an integrity check** (the code says
  so; CI does not verify a SHA-256 against an expected value today).
* Old hash dirs are never pruned (the official installer keeps them for
  rollback; ours just accumulates — a one-off cleanup is fine).

If installation into the hash dir fails, the source path is spawned directly.
If nothing resolves, the shell still boots (see *Degradation* below).

### CLI shape probing

`probe_invocation` runs `<bin> app-server --help` then `<bin> --help` to
decide whether the file is a standalone app-server or the official multi-call
`codex.exe`, and whether it accepts `--session-source`. **Do not assume from
the filename** — the multi-call binary is routinely dropped in under the
standalone name. If both probes fail, fall back to a filename heuristic and
omit `--session-source`.

> **Measured correction (2026-09-17).** The claim that the shipped binary
> accepts `--session-source` was wrong: on `codex-cli 0.154.0-alpha.6.2`,
> `codex.exe app-server --session-source …` dies with
> `error: unexpected argument '--session-source' found` — nothing binds the
> port and every RPC fails with `os error 10061`. Hence: pass it only when
> `--help` advertises it.

### Building and packaging

* Local: `scripts/build.ps1` (requires the sidecar in `src-tauri/binaries/`,
  collects installers via `scripts/stage-dist.ps1` into `dist/`).
* CI: `.github/workflows/build-fast.yml` / `build-release.yml` download the
  official exe (cached), then `cargo tauri build -- --no-default-features`
  (`--no-default-features` is a harmless belt-and-braces leftover: the shell
  has no non-default features since the in-process experiment was retired).
* The exe enters installers via `tauri.conf.json` `bundle.resources`
  (`binaries/codex-app-server-x86_64-pc-windows-msvc.exe`), **not** via
  `externalBin`/sidecar mechanism, so `TAURI_SKIP_SIDECAR_CHECK=1` is set
  during the build.
* The workspace has no engine members, so no engine source is ever compiled.

Where to get the exe without building anything (both shapes work because
probing is runtime-based):

```text
# GitHub Releases (what CI uses):
https://github.com/openai/codex/releases/tag/rust-v0.154.0

# or reuse the official desktop's own install (verified on this machine:
# codex-cli 0.154.0-alpha.6.2, ~284 MB, binds 17457 in ~250 ms):
%LOCALAPPDATA%\OpenAI\Codex\bin\<content-hash>\codex.exe
%USERPROFILE%\.codex\plugins\.plugin-appserver\codex.exe
```

## Handshake (required, three steps)

`CodexClient::connect` performs this on every connection (`client.rs`):

1. Request:
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
   (`version` comes from `CARGO_PKG_VERSION` of `src-tauri`.)
2. Server responds with `{ userAgent, codexHome, platformFamily, platformOs }`.
3. Notification `{"method":"initialized"}` — **no params field** (official
   tests assert this). Without step 3 the server rejects most subsequent
   methods.

Timeouts: `initialize` 10 s; ordinary requests 120 s; notification fan-out
uses a `tokio::sync::broadcast` channel (capacity 256) so the event bridge
and other subscribers never steal from the pending-request map.

## Method names (v0.154.0)

The engine's authoritative list lives in the upstream `codex-rs` tag at
`app-server-protocol/src/protocol/common.rs`; regenerate from the official
binary's `app-server generate-ts` / `generate-json-schema` output when in
doubt — never guess RPC names. The shell-side mirror of what we actually
call is `src-tauri/src/codex/protocol.rs` (hand-maintained; keep in sync
with the frontend's generated tables in `frontend/src/protocol/`, which are
CI-checked by `scripts/verify-notification-coverage.mjs`).

### Client → server (requests)

| Purpose | Method |
|---------|--------|
| Handshake | `initialize` |
| Create thread | `thread/start` |
| List threads | `thread/list` (response: `{ data, nextCursor, backwardsCursor }`) |
| Read / resume / fork / delete / archive / unarchive | `thread/read`, `thread/resume`, `thread/fork`, `thread/delete`, `thread/archive`, `thread/unarchive` |
| Timeline | `thread/timeline/list` (**not** `thread/timeline`) |
| Turns / items / loaded threads | `thread/turns/list`, `thread/items/list`, `thread/loaded/list` |
| Rename / compact | `thread/name/set`, `thread/compact/start` |
| In-thread shell | `thread/shellCommand` |
| Start turn | `turn/start` — params `{ threadId, input: UserInput[] }`, **not** `{ input: { items } }` |
| Steer / interrupt | `turn/steer`, `turn/interrupt` |
| Config | `config/read`, `config/value/write`, `config/batchWrite` (**not** `config/get` / `config/update`), `configRequirements/read` |
| Models | `model/list`, `modelProvider/capabilities/read` |
| Account | `account/read` (`getAuthStatus` is a deprecated alias) |
| MCP | `mcpServerStatus/list` (**not** `mcp/listServers`), `config/mcpServer/reload`, `mcpServer/oauth/login`, `mcpServer/tool/call`, `mcpServer/resource/read` |
| Skills | `skills/list`, `skills/config/write` |
| Plugins | `plugin/list`, `plugin/read`, `plugin/search`, `plugin/install`, `plugin/uninstall` (**no** `plugin/setEnabled`) |
| Hooks | `hooks/list` |
| Shell exec | `command/exec` (**not** `shell/open`): argv `command: [bin, …]` + client `processId` for TTY streaming |
| Exec write / resize / terminate | `command/exec/write` (`{ processId, deltaBase64 }` or `{ processId, closeStdin: true }`), `command/exec/resize`, `command/exec/terminate` |
| Filesystem | `fs/readDirectory`, `fs/readFile`, `fs/writeFile`, `fuzzyFileSearch` |
| Misc | `feedback/upload`, `server/diagnostics`, `project/list`, `project/read`, `project/create` |

Note: `project/*`, `plugin/search`, `server/diagnostics` and
`thread/timeline/list` are ours-side names or shell notes — cross-check
`docs/official-ui/APPSERVER-METHOD-INVENTORY-0.154.0.md` before treating any
method as official.

### Client → server (notifications)

| Purpose | Method |
|---------|--------|
| Handshake complete | `initialized` |

### Server → client (requests — reply to the server request id)

`turn/start` approvals use the **v2** methods. Answer with a JSON-RPC
response to the **server request id**; there is no `approval/respond` client
method. `resolve_approval` / `respond_server_request` (in
`commands/engine.rs`) forward the decision; the decision set must come from
the request's own `availableDecisions`, and e.g.
`acceptWithExecpolicyAmendment` requires echoing back the server-provided
amendment payload.

| Purpose | Method | Result body |
|---------|--------|-------------|
| Exec approval | `item/commandExecution/requestApproval` | `{ "decision": "accept" \| "acceptForSession" \| "decline" \| "cancel" \| … }` |
| File change approval | `item/fileChange/requestApproval` | same decision set |
| Permissions | `item/permissions/requestApproval` | decision object |
| User input | `item/tool/requestUserInput` | answers object |
| MCP elicitation | `mcpServer/elicitation/request` | elicitation response |

Legacy (v1 turns only, not used by `turn/start`): `execCommandApproval`,
`applyPatchApproval`.

### Notifications → Tauri events

`events.rs::map_server_message` routes every server message:

* **Notifications** → `codex:{method}`, with both `/` and `.` replaced by
  `-` (dots are rejected by plugin:event validation), e.g.
  `turn/completed` → `codex:turn-completed`,
  `item/agentMessage/delta` → `codex:item-agentMessage-delta`,
  `thread/tokenUsage/updated` → `codex:thread-tokenUsage-updated`.
* **Requests** — approvals → `codex:approval`; user-input / elicitation →
  `codex:user-input`; anything else → `codex:server-request-<sanitized>`.
  ⚠️ Known gap: the frontend bridge currently only listens on
  `codex:approval` / `codex:user-input`; the third-family channels
  (`item/tool/call`, `currentTime/read`, `attestation/generate`,
  `chatgptAuthTokens/refresh`) are emitted but unhandled and will stall the
  turn. Track/fix in `frontend/app/bridge/events.ts`.
* The frontend binds **all** notification methods from the generated table
  (`frontend/src/protocol/notifications.ts`, 83 entries) and the reducer
  surfaces unknown methods as visible warnings — do not re-introduce
  hand-written notification lists.

`serverRequest/resolved` (a notification) tells the UI a pending request was
answered elsewhere; the bridge clears its pending map on it.

## Response-shape gotchas (frontend)

* `thread/list` returns `{ data: [...], nextCursor, backwardsCursor }` —
  **not** `{ threads: [...] }`. Same `{ data: [...] }` shape for
  `mcpServerStatus/list`.
* `thread/start` responses nest the thread under `thread` — the `new_session`
  command flattens it and also keeps `threadStart`.
* `config/read` → model providers arrive as `model_providers` map;
  `list_providers` normalizes it to `{ providers: [] }`.
* Settings save is a **dual write**: shell store (`save_settings`) plus
  `config/batchWrite` with `{ edits: [{ keyPath, value, mergeStrategy }],
  reloadUserConfig }` — **not** `{ writes }`.

## Degradation without an engine binary

The shell boots normally: `engine_status.connected == false`, `initialize`
result `null`, engine-backed views show empty lists, and startup logs an
explicit `no codex-app-server binary resolved` warning (plus the suggested
remedies: drop the exe into `src-tauri/binaries/`, set `CODEX_APP_SERVER`,
or set `settings.app_server_binary`). Desktop-only features (pets, calendar,
scheduled tasks, plugin market, …) keep working — they are local store
commands, never disguised engine calls.

## Known limitations (tracked)

* In-flight requests are not failed fast when the WS reader dies; callers
  wait out the 120 s timeout. Pending-map draining belongs in `client.rs`.
* No liveness monitor for the child process: a crashed engine is not respawned
  and no `engine:down` event reaches the UI until the next lazy reconnect.
* Two concurrent `rpc()` calls on a cold start can race and double-connect;
  the loser's connection (and any in-flight server requests on it) is
  dropped.
* `ws://` has no auth token (see *Transport*).
* No SHA-256 pinning for the downloaded/installed exe anywhere yet.

## Constraints checklist

- [x] No engine source is compiled by this repo; the vendored `src/backend`
      experiment is retired (git history only)
- [x] Shell-only CI build; engine exe arrives by download, bundled as an
      installer resource
- [x] Transport + handshake exactly as the official tests define
- [x] RPC names traceable to `protocol.rs` ↔ generated `src/protocol/*` ↔
      official method inventory; no hand-guessed names
- [x] Server requests always replyable (accept/decline/…) to avoid stalled
      turns — third-family channels are the known remaining hole
- [x] API keys stay in the shell store, injected via env; never in
      `config.toml`, never in the frontend
