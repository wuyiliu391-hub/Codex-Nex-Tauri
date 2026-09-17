# Sidecar launch fix + real provider probe

**Date:** 2026-09-17
**Scope:** engine boot path / provider settings
**Branch:** main
**Trigger:** 截图报错 `connect codex-app-server: IO error: 由于目标计算机积极拒绝，无法连接。(os error 10061)`

## Root cause

Three independent faults stacked on the same code path, so fixing only one would
not have restored the engine:

1. **No binary.** All five resolution branches in `resolve_sidecar_source`
   returned nothing, so `if bin.exists()` was false and the sidecar was never
   spawned. The failure was completely silent.
2. **Wrong argv.** `start()` unconditionally passed `--session-source codex-desktop`.
   The shipped `codex-cli 0.154.0-alpha.6.2` binary **does not have that flag** —
   clap aborts with `error: unexpected argument '--session-source' found`, the
   process dies instantly and nothing binds the port. (The old docs claimed the
   flag existed; it exists in the source tree, not in the release.)
3. **Wrong binary shape.** The official desktop ships a *multi-call* `codex.exe`
   that needs the `app-server` subcommand. `start()` assumed a standalone
   `codex-app-server.exe`.

Plus two defects found while verifying, which would have remained after (1)–(3):

4. **No connect retry.** `EngineHandle::rpc` attempted `CodexClient::connect`
   exactly once, racing the sidecar's startup.
5. **Provider probe was a no-op.** `probe_provider` called engine `model/list`
   with `providerId` — measured: that method **ignores `providerId`** and returns
   a static catalog, so 运行检查 could never fail for the right reason.
   `bridge.js` additionally dropped 7 of 8 arguments, and its parameter *names*
   were misaligned with the caller in `settings.js`.

## Files changed

| File | Action |
|------|--------|
| `src-tauri/binaries/codex-app-server-x86_64-pc-windows-msvc.exe` | **Added** (284 MB, gitignored) — official `codex.exe`, SHA256 `960C111D…51DC` |
| `src-tauri/src/codex/sidecar.rs` | `probe_invocation` + `run_help`; conditional argv; `connect_with_retry`; `sidecar_alive`; explicit no-binary warning; provider env injection |
| `src-tauri/src/commands/engine.rs` | `probe_provider` rewritten as a real HTTP probe; `save_provider` writes official schema only |
| `src-tauri/src/state.rs` | `provider_secrets` store + `provider_env_key()` |
| `src-tauri/Cargo.toml` | `reqwest` (json) for the probe |
| `frontend/src/js/bridge.js` | `ProbeProvider` passthrough (correct arg order); `DiscoverProviderModels` reuses the probe |
| `frontend/src/js/settings.js` | Probe result shows model count / missing-model warning |
| `frontend/src/js/i18n-pages.js` | 2 new keys (en+zh); corrected the false "local secret vault" copy |
| `docs/RUST_BACKEND.md` | Corrected the `--session-source` claim; documented both binary shapes |
| `docs/compose/change-notes/sidecar-launch-and-provider-probe.md` | This note |

## What changed

### sidecar.rs — CLI shape probing

- `probe_invocation(bin)` runs `<bin> app-server --help` then `<bin> --help`
  (~218 ms / 42 ms measured) and returns `{ prefix, session_source }`.
  `prefix` is `["app-server"]` for the multi-call binary, empty for standalone.
  `session_source` is true only when the help text actually advertises the flag.
- Deliberately a **probe, not a filename check**: the official `codex.exe` is
  dropped in under the standalone filename, so the name cannot be trusted.
- Fallback when probing fails: filename heuristic + omit `--session-source`.
- Startup now logs an explicit warning when no binary resolves, instead of
  silently booting a dead engine.

### sidecar.rs — connect retry

- `connect_with_retry` retries up to 40 × 250 ms **only when a live sidecar was
  spawned** (`sidecar_alive()` via `Child::try_wait`). With no sidecar it fails
  fast on the first attempt so `compositeGetState`'s `Promise.allSettled` cannot
  stall the UI for 10 s.

### sidecar.rs — provider secret injection

- Provider API keys are read from `AppState.provider_secrets` and passed to the
  child via `cmd.env(<env_key>, <secret>)`, so `config.toml` only ever holds the
  variable *name*.

### engine.rs — real probe

- `probe_provider(providerId, baseUrl, protocol, apiKey, model)` now talks HTTP
  straight to the gateway: `GET {base}/models` (OpenAI-compatible), with
  protocol fallbacks — `{base}/v1/models` (Anthropic, `x-api-key` +
  `anthropic-version`) and `{base}/api/tags` (Ollama). 20 s timeout.
- Returns `{ ok, endpoint, status, models, modelCount, modelFound, error }`.
  A reachable-but-failing gateway yields `ok: false` + inline `error`, not `Err`,
  so the UI shows it instead of throwing.
- No longer depends on the engine at all — the probe works with the engine down.
- `extract_model_ids` accepts `data[].id`, `models[].name`, or a bare array.

### engine.rs — save_provider

- Writes **only** `name` / `base_url` / `wire_api` / `requires_openai_auth` /
  `env_key`, as individual leaf keys via `config/batchWrite`.
- Stops writing `apiKey`, `models`, `contextWindow`, `maxOutputTokens`,
  `hasApiKey` — none are real config keys, so the key was ignored by the engine
  (provider could never authenticate) *and* written to disk in plaintext.
- Sibling keys are preserved: `experimental_bearer_token` and friends are never
  touched, because we no longer replace the whole `model_providers.<id>` object.
- `wire_api` is pinned to `responses`; 0.154 removed `"chat"`, so the UI's
  protocol choice has no config mapping.

## Intentionally not done

- `--session-source` is not emulated when unsupported. It only affects session
  attribution, and a wrong value is worse than none.
- No stdio transport. Still WebSocket on 17457 (unchanged decision).
- Not migrating an existing plaintext `apiKey` out of `config.toml`. None was
  found on this machine; a migration pass is a separate decision.
- Precedence between `env_key` and an existing `experimental_bearer_token` is
  **unverified**. If a provider already carries a bearer token, adding `env_key`
  may or may not change which one wins — needs a live test.

## Verify

Measured on this machine, no compiler available:

- `codex.exe app-server --listen ws://127.0.0.1:17457` → binds `127.0.0.1:17457`
  in **246 / 250 / 253 ms** (3 cold runs).
- Full JSON-RPC round trip via `scratch/probe-app-server.mjs`: `initialize` →
  `initialized` → `thread/list` (2 threads) → `config/read` (1 provider) →
  `model/list`. **PASS.**
- `codex.exe app-server --session-source x` → `error: unexpected argument` (proof
  of root cause 2).
- `model/list` with `providerId:"custom"` and with `providerId:""` return the
  **identical** static catalog (proof of root cause 5).
- `node --check` on bridge.js / settings.js / i18n-pages.js — PASS.
- `verify-agent-a-hex.cjs` — RESULT: PASS.
- `scripts/smoke-frontend-uia.cjs` — SMOKE OK.

**Not verified (no Rust toolchain locally):** `cargo check`. The Rust edits use
only APIs already present in the codebase (`app.try_state`, `state.save()`,
`Command::env`, `Child::try_wait`, `config/batchWrite` leaf-key writes as already
used by `set_mcp_server_enabled`). **Confirm green CI before stacking anything on
top** — per the standing rule, roll back rather than fix on a red build.
