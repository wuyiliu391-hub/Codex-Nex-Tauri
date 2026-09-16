# Codex Tauri — Windows desktop shell

[中文](./README.md) | Architecture notes: [MIGRATION.md](./MIGRATION.md)

Tauri v2 shell + official **codex-app-server** sidecar (codex-rust v0.154.0).

## CI

GitHub Actions workflow `.github/workflows/build-windows.yml` builds on `windows-latest`:

1. `cargo check`
2. `cargo build --release`
3. `cargo tauri build` (bundle optional)
4. Uploads `Codex.exe` / installers as artifacts

Sidecar binary is optional at build time; drop `codex-app-server-x86_64-pc-windows-msvc.exe` into `src-tauri/binaries/` for a full engine build, or ship shell-only and point settings at an external server.

## Local

See [scripts/CLOUD_BUILD.md](./scripts/CLOUD_BUILD.md).
