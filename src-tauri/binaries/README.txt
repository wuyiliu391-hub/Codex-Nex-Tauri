# Placeholder for the official codex-app-server sidecar binary.

# Expected filename (Tauri resource / PATH fallback):
#   codex-app-server-x86_64-pc-windows-msvc.exe
#
# Build from official codex-rust v0.154.0 (read-only tree):
#   .\scripts\build-sidecar.ps1
# or:
#   cd ..\codex-rust-v0.154.0\codex-rs
#   cargo build -p codex-app-server --release
#   copy target\release\codex-app-server.exe `
#     ..\Codex-Tauri\src-tauri\binaries\codex-app-server-x86_64-pc-windows-msvc.exe
#
# At runtime the shell copies the binary into a content-hash dir:
#   %LOCALAPPDATA%\CodexDesktop\bin\<hash>\codex-app-server.exe
# and spawns it with:
#   --listen ws://127.0.0.1:17457 --session-source codex-desktop
#
# Override resolution order:
#   1. CODEX_APP_SERVER env (absolute path)
#   2. settings.app_server_binary
#   3. newest hash-dir install
#   4. this directory (resource / dev)
#   5. PATH
#
# See docs/RUST_BACKEND.md.
