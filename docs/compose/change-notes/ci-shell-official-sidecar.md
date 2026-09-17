---
feature: ci-shell-official-sidecar
status: delivered-local
updated: 2026-09-17
---

# CI: shell-only + official prebuilt app-server sidecar

## Why

Official `codex.exe` / app-server RPC is not a full desktop API. Complete UI
still requires **shell-layer Tauri commands** (local store + RPC wrappers).
Deep product integration does **not** require compiling `src/backend` on every
push — that is only needed for in-process engine work.

`openai/codex` release `rust-v0.154.0` ships
`codex-app-server-x86_64-pc-windows-msvc.exe` (~230MB).

## What changed

| File | Change |
|------|--------|
| `build-fast.yml` | Download/cache official engine; `cargo tauri build --no-default-features`; Swatinem key `sidecar-shell`; timeout 30m |
| `build-release.yml` | Same sidecar strategy |
| `src-tauri/Cargo.toml` | Document dual hosting (default in-process vs CI sidecar) |

## Runtime path (unchanged code)

`resolve_sidecar_source` already prefers:

1. `CODEX_APP_SERVER` env  
2. `settings.app_server_binary`  
3. content-hash install under LocalAppData  
4. **`src-tauri/binaries/codex-app-server-x86_64-pc-windows-msvc.exe`** ← CI drop  
5. PATH  

Spawn probe: standalone exe → `--listen`; multi-call → `app-server --listen`.

## Effect

- CI no longer compiles ~100+ backend crates on every push  
- Frontend IPC stays on shell commands (pets/settings/sessions/…)  
- Engine = official release binary, protocol-compatible with `rust-v0.154.0`  
- `in-process` remains available for local/engine-core work (`default` feature)

## Not in this change

- Shipping the 230MB engine inside NSIS/MSI `bundle.resources` (still empty)  
- Rewriting frontend against raw RPC (shell API is the product API)  
- Push/CI verify is operator-controlled for this session state
