---
kind: logging_system
name: 基于 tracing + tracing-subscriber 的日志系统
category: logging_system
scope:
    - '**'
source_files:
    - src-tauri/Cargo.toml
    - src-tauri/src/lib.rs
    - src-tauri/src/codex/sidecar.rs
    - src-tauri/src/codex/events.rs
    - src-tauri/src/codex/adapter.rs
---

## 1. 使用的框架与工具

Rust 后端统一采用 `tracing`（crate 版本 `0.1`）作为结构化日志/追踪库，配合 `tracing-subscriber`（版本 `0.3`，启用 `env-filter` feature）完成格式化输出与级别过滤。前端（React/Vite）未发现使用任何日志框架或 `console.*` 封装，仅通过 Tauri IPC 调用 Rust 命令。

## 2. 核心文件

- `src-tauri/Cargo.toml`：声明依赖 `tracing = "0.1"`、`tracing-subscriber = { version = "0.3", features = ["env-filter"] }`。
- `src-tauri/src/lib.rs`：应用启动时初始化全局 subscriber，并集中注册所有 Tauri 命令与插件。
- `src-tauri/src/codex/sidecar.rs`：sidecar 进程生命周期（启动、关闭、事件转发）中大量使用 `tracing::info!` / `warn!` / `error!`。
- `src-tauri/src/codex/events.rs`：事件桥接中使用 `tracing::debug!` / `warn!` / `info!` 记录事件通道状态。
- `src-tauri/src/codex/adapter.rs`：协议适配器使用 `tracing::{error, info, warn}` 导入。

## 3. 架构与约定

### 初始化位置
`lib.rs` 的 `run()` 函数在构建 Tauri `Builder` 之前调用：
```rust
tracing_subscriber::fmt()
    .with_env_filter(
        tracing_subscriber::EnvFilter::try_from_default_env()
            .unwrap_or_else(|_| "info,codex_tauri=debug".into()),
    )
    .init();
```
这是全局唯一初始化点，确保后续所有模块的 `tracing::info!` / `warn!` / `error!` / `debug!` 都能被捕获。

### 日志级别策略
- 默认级别为 `info`，但 crate 名 `codex_tauri` 被显式提升为 `debug`，便于调试该 crate 内部细节而不放大第三方依赖噪音。
- 级别通过环境变量 `RUST_LOG`（由 `EnvFilter::try_from_default_env()` 读取）覆盖；若设置失败则回退到上述默认值。
- 代码中按语义选择级别：启动/关闭流程用 `info!`，错误用 `error!`，可恢复异常用 `warn!`，详细诊断用 `debug!`。

### 结构化字段
所有日志均使用命名参数形式（如 `tracing::warn!(error=%e, path=%bin.display(), "failed to spawn codex-app-server")`），而非字符串拼接。这使输出天然结构化，便于下游收集器解析。

### 输出目标
`tracing_subscriber::fmt()` 默认将日志写入标准错误（stderr）。Tauri 窗口关闭时会触发 sidecar 优雅退出，其日志同样经同一 subscriber 输出，因此整个桌面应用的日志集中在 stderr。

## 4. 约定与约束

- **禁止直接使用 `println!` / `eprintln!`**：仓库中 Rust 代码未出现裸 `println!`/`eprintln!`，所有输出均走 `tracing`，保证结构化与可配置。
- **日志级别不可硬编码**：级别必须通过 `RUST_LOG` 环境变量控制，代码内仅提供默认值，不允许在业务逻辑中修改全局过滤器。
- **按 crate 粒度调优**：默认只对 `codex_tauri` crate 开启 `debug`，其他依赖保持 `info`，避免无关日志污染。
- **前端不直接写日志**：前端通过 Tauri IPC 调用 Rust 命令，所有 I/O 日志集中在后端，前端无需引入日志库。
- **侧边进程共享订阅器**：sidecar 是独立二进制，但主进程通过 `tracing` 记录其生命周期事件，形成统一的观测面。

## 5. 关键文件清单

- `src-tauri/Cargo.toml`（依赖声明）
- `src-tauri/src/lib.rs`（subscriber 初始化）
- `src-tauri/src/codex/sidecar.rs`（sidecar 日志最密集）
- `src-tauri/src/codex/events.rs`（事件桥日志）
- `src-tauri/src/codex/adapter.rs`（协议适配器日志）