---
feature: ci-workflows
status: delivered
updated: 2026-09-17
---

# CI split into three independent workflows

## What changed

`.github/workflows/build-windows.yml` (one monolithic job) is replaced by three
independently triggered workflows that do not block each other:

| Workflow | Trigger | Purpose |
|----------|---------|---------|
| `build-fast.yml` | push / PR to main | Daily iteration — usable installer, fastest wall-clock |
| `build-release.yml` | tags `v*` / manual | Formal release — fully optimised + long-retained installers |
| `lint-check.yml` | push / PR to main | Frontend static checks + `cargo fmt --check` |

## Fast-build specifics (build-fast.yml)

- Checkout uses **`submodules: recursive`, `fetch-depth: 1`**.
- Built with the new **`ci-fast`** cargo profile: `opt-level = 2`, `lto = false`,
  `codegen-units = 256`, `strip = "symbols"`, `debug = false`.
- **`cargo tauri build --profile ci-fast`** — output lands in `target/ci-fast/`.
- No tests, no lint, no clippy: compile + bundle only.
- Artifacts are named per pipeline: **`Codex-fast-exe` / `Codex-fast-installers`**
  (7-day retention) vs release's `Codex-release-exe` / `Codex-release-installers`
  (90-day retention), so the two never collide in the artifacts list.

## Cache reuse

Both build workflows pass the **same `shared-key: tauri-win`** to
`Swatinem/rust-cache`, so a fast build warms the cache a release build then
reuses (and vice-versa).

## Why `ci-fast` lives in the root Cargo.toml

`src-tauri` declares `workspace = ".."`, so cargo ignores `[profile.*]` blocks in
`src-tauri/Cargo.toml` and reads profiles from the **workspace root** only. The
profile is therefore defined in the root `Cargo.toml`.

## Not in this change

The engine still defaults to the sidecar subprocess (`default = []`). Switching
the default to the in-process backend is a separate, higher-risk change handled
in its own commit.
