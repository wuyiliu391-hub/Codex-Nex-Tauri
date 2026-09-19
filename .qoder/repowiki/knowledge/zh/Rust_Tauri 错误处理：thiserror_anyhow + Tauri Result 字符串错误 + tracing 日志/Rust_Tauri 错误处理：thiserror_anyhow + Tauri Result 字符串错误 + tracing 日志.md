---
kind: error_handling
name: Rust/Tauri 错误处理：thiserror/anyhow + Tauri Result 字符串错误 + tracing 日志
category: error_handling
scope:
    - '**'
source_files:
    - src-tauri/Cargo.toml
    - src-tauri/src/lib.rs
    - src-tauri/src/state.rs
    - src-tauri/src/codex/sidecar.rs
    - src-tauri/src/codex/client.rs
    - src-tauri/src/codex/protocol.rs
    - src-tauri/src/commands/fs.rs
    - src-tauri/src/commands/engine.rs
---

## 1. 使用的系统与模式

该仓库是一个基于 Tauri 2 的 Rust 桌面应用，错误处理围绕以下核心组件展开：
- **`thiserror`**（`src-tauri/Cargo.toml` 声明）：用于定义领域错误类型。
- **`anyhow`**（`src-tauri/Cargo.toml` 声明）：用于包装底层 I/O、网络等不可恢复错误，并在上层以 `anyhow::Result` 传播。
- **Tauri 命令返回 `Result<T, String>`**：所有通过 `#[tauri::command]` 暴露给前端的函数统一使用 `String` 作为错误类型，由 Tauri 自动序列化为 JSON-RPC 错误返回前端。
- **`tracing` + `tracing-subscriber`**：在 `lib.rs` 启动时初始化结构化日志，错误路径通过 `tracing::error!` / `tracing::warn!` 记录，而非抛到 UI。
- **无 panic/recover 策略**：代码中未出现 `panic!` 或 `std::panic::catch_unwind`；进程级崩溃仅由 `run(...).expect("...")` 触发。

## 2. 关键文件与位置

| 文件 | 职责 |
|---|---|
| `src-tauri/src/lib.rs` | 应用入口，初始化 tracing，注册 Tauri 插件、菜单、invoke handler，窗口关闭时优雅停止 sidecar |
| `src-tauri/src/state.rs` | 本地状态持久化，`save()` 使用临时文件+rename 原子写入，失败走 `anyhow::Result` |
| `src-tauri/src/codex/sidecar.rs` | sidecar 生命周期管理，连接重试、CLI 探测、二进制安装；错误以 `tracing::warn!` 降级 |
| `src-tauri/src/codex/client.rs` | WebSocket JSON-RPC 客户端，带超时（initialize 10s、请求 120s）、广播通知、pending map |
| `src-tauri/src/codex/protocol.rs` | 协议常量与 `RpcError { code, message, data }` 结构体，解析 server→client 消息 |
| `src-tauri/src/commands/fs.rs` | 文件系统命令，使用 `sanitize_join` 防御路径穿越，返回 `Result<Vec<FileEntry>, String>` |
| `src-tauri/src/commands/engine.rs` | 引擎 RPC 转发层，统一封装为 `rpc()` 并返回 `Result<Value, String>` |
| `src-tauri/Cargo.toml` | 依赖声明：`thiserror = "1"`, `anyhow = "1"`, `tracing`, `tracing-subscriber` |

## 3. 架构与约定

### 3.1 Tauri 命令的错误契约
所有 `#[tauri::command]` 函数返回 `Result<T, String>`。错误以纯字符串形式序列化后返回前端，例如：
- `fs.rs` 中的 `path traversal rejected`、`cwd is not a directory`、`file exceeds 1MiB read cap`、`path escapes workspace`。
- `engine.rs` 中的 `engine not connected`。
- `sidecar.rs` 中的 `connect codex-app-server: ... os error 10061`。

这种设计使前端可以统一用 try/catch 捕获错误并展示给用户，无需解析特定错误码。

### 3.2 异步错误与超时
`CodexClient::request` 使用 `tokio::time::timeout(REQUEST_TIMEOUT, rx)` 将超时转换为 `Err("rpc timeout")`；`perform_initialize` 使用 `INITIALIZE_TIMEOUT` 并将 `RpcError.code/message` 包装为 anyhow 错误。`EngineHandle::connect_with_retry` 对侧边车启动进行最多 40 次 × 250ms 的重试，仅在最后一次失败时返回错误。

### 3.3 健壮性降级而非崩溃
- sidecar 无法 spawn 时记录 `tracing::warn!(error=%e, ...)` 并继续运行（引擎保持断开），而不是 panic。
- 二进制解析失败时回退到文件名启发式并记录 warn。
- 事件订阅者 lagged 时记录 `tracing::warn!(skipped = n, ...)` 而非丢弃后续事件。
- 窗口关闭事件中调用 `engine.shutdown()` 再 `api.prevent_close()`，确保资源释放。

### 3.4 安全相关错误
`fs.rs` 中的 `sanitize_join` 显式拒绝包含 `..` 的路径，并在 canonicalize 后验证路径仍在根目录下，防止工作区逃逸。

### 3.5 持久化错误
`AppState::save` 采用 write-to-temp + rename 的原子写入模式，任何中间步骤失败都会返回 `anyhow::Result`，调用方可选择忽略（如设置保存失败不影响 UI）。

## 4. 约定与约束

- **命令层统一错误类型**：所有 Tauri 命令返回 `Result<T, String>`，禁止直接 `panic!` 或向上传播 `anyhow`。
- **外部依赖错误下沉**：I/O、网络、子进程错误通过 `map_err(|e| e.to_string())` 转为字符串错误，由 Tauri 框架统一处理。
- **日志优先于异常**：非致命错误（sidecar 启动失败、二进制缺失、订阅 lag）一律通过 `tracing::warn!` 记录，不中断流程。
- **严格超时保护**：所有远程 RPC 调用均带超时，避免 UI 永久挂起。
- **进程级唯一 panic 点**：仅 `lib.rs` 末尾 `.run(...).expect("error while running Codex Tauri application")` 会终止进程，其余错误均被消化或上报。
- **协议错误结构化**：与官方 app-server 交互的错误统一映射为 `RpcError { code, message, data }`，便于前后端对齐。

## 5. 未覆盖之处

- 未发现自定义 `thiserror` 枚举定义（可能尚未使用此error类型，或集中在其他模块）。
- 前端（React/Vite）部分未在本轮分析范围内，但后端错误已通过 Tauri 的 `Result<T, String>` 契约传递到前端 catch 分支。
- 未观察到全局 `panic` hook 或 `unhandledrejection` 处理器。