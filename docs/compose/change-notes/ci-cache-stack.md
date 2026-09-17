---
feature: ci-cache-stack
status: ready-local
updated: 2026-09-17
---

# CI cache stack (community strongest, local only — not pushed)

## Applied to build-fast.yml + build-release.yml

| Layer | Implementation |
|-------|----------------|
| Pin rustc | `dtolnay/rust-toolchain@master` + `toolchain: 1.98.1` (both workflows) |
| Swatinem rust-cache | `workspaces: . -> target`, `shared-key: tauri-win`, `cache-targets: true`, `cache-workspace-crates: true`, `cache-on-failure: true`, `cache-bin: true`, `add-job-id-key: false`, `prefix-key: v0-rust`; extra `key: release-fast` / `release-full` |
| Debuginfo off | `CARGO_PROFILE_RELEASE_DEBUG=0`, `CARGO_PROFILE_DEV_DEBUG=0` (+ fast profile opt/LTO/codegen env) |
| sccache GHA | `mozilla/sccache-action@v0.0.9`, sccache `0.18.0`, `RUSTC_WRAPPER=sccache`, `SCCACHE_GHA_ENABLED=on`, `SCCACHE_GHA_RW_MODE=READ_WRITE`; github-script exports `ACTIONS_RESULTS_URL` + `ACTIONS_RUNTIME_TOKEN` |
| Observability | post-build `sccache --show-stats` + `rust-cache cache-hit` echo |

## Expected semantics

- rust-cache: `~/.cargo` registry + `target/` deps + local `codex-*` workspace member artifacts
- sccache: per-rustc-invocation cache in GHA backend; **does not cache final link** (`bin`/proc-macro)
- Changing backend sources still recompiles those crates + downstream (Cargo model)
- First run after this change may miss once (new env/key material); subsequent hits should reuse

## Status

Committed locally only. **Not pushed** per task instruction.
