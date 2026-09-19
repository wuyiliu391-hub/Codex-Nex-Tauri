---
kind: configuration_system
name: Tauri 桌面应用配置系统：本地 JSON 状态 + sidecar 环境变量注入
category: configuration_system
scope:
    - '**'
source_files:
    - src-tauri/tauri.conf.json
    - src-tauri/Cargo.toml
    - src-tauri/src/lib.rs
    - src-tauri/src/state.rs
    - src-tauri/src/commands/settings.rs
    - src-tauri/src/codex/sidecar.rs
    - frontend/vite.config.ts
---

## 1. 使用的系统与工具

本仓库采用 **Tauri 2** 作为桌面壳层，配置系统由三部分构成：
- **Tauri 应用级配置**：`src-tauri/tauri.conf.json`（窗口、安全策略、bundle 资源、插件权限）。
- **用户持久化状态**：Rust 端 `state.rs` 将 Settings / Preferences / Pets / Connectors / Shortcuts / ScheduledTasks 等序列化为 `shell-state.json`，存放于平台配置目录下的 `CodexDesktop`（Windows 下为 `%LOCALAPPDATA%\CodexDesktop`，通过 `dirs::config_dir()` 解析）。
- **Sidecar 运行时配置**：预编译的 `codex-app-server` 二进制通过命令行参数和进程环境变量启动，其连接地址、二进制路径、会话来源等来自设置或环境变量。

前端 Vite 构建配置 (`frontend/vite.config.ts`) 仅用于开发期代理与打包，不参与运行时配置加载。

## 2. 关键文件

- `src-tauri/tauri.conf.json` — Tauri 应用元数据、窗口尺寸、CSP、bundle 资源（嵌入 sidecar 二进制）、插件能力声明。
- `src-tauri/Cargo.toml` — 依赖声明（`tauri-plugin-store`、`tracing-subscriber`、`dirs`、`reqwest` 等），以及 release profile 位于 workspace 根部的注释约束。
- `src-tauri/src/lib.rs` — Tauri `Builder` 初始化入口，注册插件、菜单、命令处理器，启动 `AppState`、`ProtocolAdapter`、`EngineHandle`（sidecar）。
- `src-tauri/src/state.rs` — 所有用户可编辑配置的 Rust 数据结构定义、默认值填充、JSON 序列化/反序列化、原子写入（`.tmp` + `rename`）。
- `src-tauri/src/commands/settings.rs` — 暴露给前端的 `get_settings/save_settings/get_preferences/save_preferences/list_shortcuts/save_shortcuts` 命令。
- `src-tauri/src/codex/sidecar.rs` — sidecar 二进制发现、安装、CLI 探测、进程生命周期管理、环境变量注入。
- `frontend/vite.config.ts` — 开发期 WS 代理目标 `CODEX_APP_SERVER_WS` 环境变量。

## 3. 架构与设计约定

### 3.1 分层加载顺序

| 层级 | 来源 | 用途 | 优先级 |
|---|---|---|---|
| 应用级 | `tauri.conf.json` | 窗口、安全、bundle、插件 | 编译时固定 |
| 用户状态 | `~/.config/CodexDesktop/shell-state.json`（平台相关） | 主题、语言、active_provider_id、terminal_shell、approval_policy、sandbox、app_server_listen/binary 等 | 运行时读写 |
| 环境变量 | `CODEX_APP_SERVER`、`CODEX_PROVIDER_{ID}_API_KEY`、`CODEX_APP_SERVER_WS`、`TRACING_SUBSCRIBER_FILTER` | 覆盖二进制路径、注入 provider 密钥、调试日志级别、开发代理目标 | 最高 |
| Sidecar CLI | `--listen ws://...`、`--session-source codex-desktop` | 控制 engine 监听地址与会话标识 | 启动时传入 |

### 3.2 持久化格式与默认值

- `AppState::load_or_default` 在首次运行或文件缺失时创建 `CodexDesktop` 目录并写入 `shell-state.json`。
- 默认值集中填充：`theme = "light"`、`language = "zh-CN"`、`app_server_listen = "ws://127.0.0.1:17457"`；若 `scheduled_tasks` 为空则注入官方建议任务（每日简报、每周回顾、跟进监控）。
- `Preferences.extra` 使用 `#[serde(flatten)]` 以支持任意扩展的配置段（appearance、voice、browser、git 等），避免新增字段导致旧版本反序列化丢失数据。
- 写操作采用 **临时文件 + rename** 原子替换，防止崩溃导致状态损坏。

### 3.3 敏感信息处理

- Provider API Key **不直接写入 JSON**：`state.rs` 中 `provider_secrets` 是内存中的 `HashMap<providerId, String>`，仅在 sidecar 启动时通过 `cmd.env(name, value)` 注入到子进程环境。
- 环境变量名由 `provider_env_key(provider_id)` 生成：将 provider id 转为大写 ASCII + `_`，形如 `CODEX_PROVIDER_OPENAI_API_KEY`。
- `settings` 中只保存 `env_key` 字符串（即该 env var 的名称），而非密钥本身。

### 3.4 Sidecar 二进制发现链

`resolve_sidecar_source` 按以下顺序查找 `codex-app-server`：
1. `CODEX_APP_SERVER` 环境变量指定的绝对路径。
2. `settings.app_server_binary` 配置项。
3. Tauri resource 目录（打包后 NSIS/MSI 资源）。
4. 与 exe 同级的 `binaries/` 目录。
5. 开发期 `CARGO_MANIFEST_DIR/binaries/`。
6. 上次内容哈希安装的副本（`%LOCALAPPDATA%\CodexDesktop\bin\<hash>`）。
7. PATH。

找到后通过 `install_into_hash_dir` 以 FNV-1a 内容哈希命名目录进行内容寻址复制，保证多版本共存且可回滚。

### 3.5 运行时协议适配

- `lib.rs` 启动 `ProtocolAdapter`（默认端口 `DEFAULT_ADAPTER_PORT`），从 `AppState` 读取已配置的 provider 路由（id、protocol、base_url、api_key）并注入适配器状态。
- 当 `save_settings` 修改 `active_provider_id` 时，立即调用 `adapter_state.set_active(...)` 切换活跃 provider。

### 3.6 日志与调试

- `tracing_subscriber` 通过 `EnvFilter::try_from_default_env()` 读取 `RUST_LOG`/`TRACING_SUBSCRIBER_FILTER` 环境变量，默认过滤为 `info,codex_tauri=debug`。
- 前端开发模式通过 `vite.config.ts` 中的 `CODEX_APP_SERVER_WS` 环境变量将 `/appserver` WebSocket 代理到真实 engine。

## 4. 约定与约束

- **配置文件位置**：用户配置始终位于平台配置目录下的 `CodexDesktop`，文件名固定为 `shell-state.json`，禁止其他模块自行选择路径。
- **新配置字段**：必须添加 `#[serde(default)]`，并在 `load_or_default` 中提供合理默认值；对 `Preferences` 使用 `extra` 扁平化存储。
- **密钥隔离**：任何 provider 的 API Key 不得出现在 JSON 文件中，只能通过 `provider_secrets` 内存态注入环境变量；新增 provider 需同步更新 `provider_env_key` 与前端 `model_providers.{id}.env_key` 字段。
- **二进制覆盖**：生产部署优先使用 Tauri bundle 资源；开发者可通过 `CODEX_APP_SERVER` 指向任意路径的二进制进行调试。
- **Release Profile**：`Cargo.toml` 中明确禁止在 `src-tauri/Cargo.toml` 中添加 `[profile.release]`，因为 Cargo 只在 workspace 根生效；release 配置位于根 `Cargo.toml`，CI 通过 `CARGO_PROFILE_RELEASE_*` 环境变量覆盖。
- **窗口关闭清理**：`on_window_event(CloseRequested)` 中必须先调用 `engine.shutdown()` 再销毁窗口，确保 sidecar 进程被正确终止。
- **WS 代理端口**：sidecar 默认监听 `ws://127.0.0.1:17457`，可通过 `settings.app_server_listen` 覆盖；前端开发代理默认也指向该地址，除非设置 `CODEX_APP_SERVER_WS`。
- **Tauri 插件**：仅启用 `dialog`、`shell`、`fs`、`store` 四个插件，并通过 `capabilities/default.json` 声明最小权限集。