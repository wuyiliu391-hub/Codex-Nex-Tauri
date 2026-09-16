# Codex-Nex → Codex-Tauri 迁移方案

> 目标：去掉 Go + Wails，后端换成官方 `codex-rust`（v0.154.0），壳换成 Tauri v2。
> 本机无 Rust 工具链：只做代码转换与骨架落地，语法/编译/打包全部交给云端。

## 1. 架构决策

### 选定方案：Tauri Shell + codex-app-server Sidecar

```
┌──────────────────────────────────────────────────────────┐
│ Frontend (Vanilla JS，沿用 Codex-Nex UI)                 │
│  bridge.js → Tauri invoke/listen（替换 window.go.main） │
└───────────────────────────┬──────────────────────────────┘
                            │ Tauri IPC
┌───────────────────────────▼──────────────────────────────┐
│ Tauri Rust Shell (src-tauri)                             │
│  - 无边框窗 / 主题 / 宠物 / 日历 / cinema / UI 配置     │
│  - commands: 本地状态 + 转发 app-server RPC              │
│  - event_bridge: ServerNotification → window.emit        │
└───────────────────────────┬──────────────────────────────┘
                            │ WebSocket (JSON-RPC)
                            │ 或 feature=in-process 时进程内
┌───────────────────────────▼──────────────────────────────┐
│ codex-app-server (官方 sidecar 二进制)                   │
│  thread / turn / mcp / plugins / skills / exec / config  │
└───────────────────────────┬──────────────────────────────┘
                            │
┌───────────────────────────▼──────────────────────────────┐
│ codex-core + 官方 crate 生态（Agent 引擎）               │
└──────────────────────────────────────────────────────────┘
```

### 为什么不直接把整个 workspace 链进 Tauri

官方 `codex-rs` 是 100+ crate monorepo。全量 path 依赖会让 Tauri 构建：

- 编译时间爆炸、云端缓存难做
- 任意官方 crate 破坏性变更都会炸壳
- 版本升级要重编整个 app

Sidecar 把 **Agent 引擎版本** 和 **桌面壳版本** 解耦：

- 引擎：替换 `codex-app-server` 二进制即可升级
- 壳：只依赖 JSON-RPC 协议（`codex-app-server-protocol` 可选生成的 TS/JSON）
- 备选：`feature = "in-process"` 时用 `codex-app-server-client` 同进程嵌入

### 为何不重写 Agent

Codex-Nex 的 `internal/agent`、`tools`、`llm`、`mcp` 在官方 Rust 里都有对应物且更完整。重写等于给 OpenAI 白打工。**只保留 Codex-Nex 独有、官方没有的桌面能力。**

## 2. 职责切分

| 能力 | 原 Go 位置 | 新归属 |
|------|-----------|--------|
| Agent 循环 / 工具执行 | `internal/agent`, `tools` | **codex-app-server** |
| LLM 协议 / 多提供商 | `internal/llm` | **codex-app-server**（model-provider） |
| MCP | `internal/mcp` | **codex-app-server** |
| Skills | `internal/skill` | **codex-app-server** |
| Plugins marketplace | `internal/plugin` | **codex-app-server** |
| Hooks | `internal/hooks` | **codex-app-server** |
| Secrets vault | `internal/secrets` | 官方 keyring / config auth |
| Session 持久化 | `internal/store` | 官方 rollout / thread-store |
| PTY / Shell | `internal/pty` | app-server command_exec |
| SSH | `internal/ssh` | 暂缓：Tauri 本地模块或后续扩展 |
| LSP | `internal/lsp` | app-server 或后续 |
| Browser CDP | `internal/browser` | app-server / 后续 |
| Git UI 状态 | `internal/git` | app-server git processor |
| 定时任务 UI | `internal/scheduler` + App | **Tauri 本地**（cron） |
| 桌面宠物 | frontend `pet.js` + store | **Tauri 本地 store** |
| 日历 / Cinema / Connector | `internal/calendar` 等 | **Tauri 本地 store** |
| 文件树侧栏 | `file_api.go` | **Tauri 本地**（读工作区） |
| Review 事件 | `review_api.go` | 转发 app-server review 或本地 JSONL |
| 无边框窗 / 主题 | Wails | **Tauri window** |
| i18n 文案 | frontend | 前端沿用 |

## 3. IPC 映射（Wails → Tauri）

前端统一经 `frontend/src/js/bridge.js`：

```js
// 旧: window.go.main.App.GetState()
// 新: invoke("get_state")
```

### 3.1 本地 Tauri 命令（不经过 app-server）

| 旧方法 | 新 command | 说明 |
|--------|------------|------|
| GetState | `get_state` | 聚合本地 UI 快照 + 引擎状态 |
| GetSettings / SaveSettings | `get_settings` / `save_settings` | 壳配置 JSON |
| GetPreferences / SavePreferences | `get_preferences` / `save_preferences` | |
| ListPets / SavePets / WakePet / TuckPet / CreateCustomPet | `pets_*` | |
| ListCalendarEvents / SaveCalendarEvent / DeleteCalendarEvent | `calendar_*` | |
| ListCinema* / SaveCinema* / EnqueueCinemaRender | `cinema_*` | |
| ListConnectors / SaveConnector / DeleteConnector / TestConnector | `connectors_*` | |
| ListFiles / ReadFile / WriteFile | `fs_list` / `fs_read` / `fs_write` | 工作区文件 |
| PickProjectFolder / PickAttachmentFiles | `dialog_*` | Tauri dialog |
| ListShortcuts / SaveShortcuts | `shortcuts_*` | |
| CheckDependencies | `check_dependencies` | 探测 codex-app-server、rg 等 |

### 3.2 转发到 app-server 的命令

| 旧方法 | app-server method | 备注 |
|--------|-------------------|------|
| NewSession | `thread/start` | |
| ListSessions / ListArchivedSessions | `thread/list` | |
| GetSession | `thread/read` | |
| DeleteSession / DeleteArchivedSession | `thread/delete` | |
| ArchiveSession / UnarchiveSession | `thread/archive` 等 | |
| SendMessage / SendMessageWithAttachments | `turn/start` | |
| InterruptSession | `turn/interrupt` | |
| CompactSession | app-server compact | |
| ResolveApproval | 审批响应 | Exec/ApplyPatch approval |
| ListProviders / SaveProvider / ProbeProvider | model provider / config | |
| DiscoverProviderModels | models list/probe | |
| ListMCPServers / SaveMCPServer / TestMCPConnection / SetMCPServerEnabled | `mcp/*` | |
| ListSkills / ReloadSkills / SetSkillEnabled / GetSkillDetail | skills | |
| ListPlugins* / InstallPlugin* / UninstallPlugin / SetPluginEnabled | plugins | |
| OpenShell / WriteShell / ReadShell / CloseShell | command_exec / process_exec | |
| OpenManagedBrowser / Browser* | browser | |
| LSP* | LSP | |
| GitStatus / GitLog / GitBranchList | git processor | |
| GetRuntimeEvents | thread events / timeline | |
| ListAgentTools | tools list | |
| CreateSnapshot / RestoreSnapshot / ListSnapshots / DeleteSnapshot | snapshot | |
| SendTestNotification | notify | |

### 3.3 事件桥

| 旧 | 新 |
|----|----|
| Wails `EventsEmit("agent:...")` | Tauri `app.emit("agent:...")` |
| Wails `EventsOn` | 前端 `listen("agent:...")` |

事件源：sidecar WebSocket 上的 `ServerNotification` / `ServerRequest`（审批弹窗）→ 统一映射为 `codex:event` / `codex:approval`。

## 4. 目录结构

```
Codex-Tauri/
├── MIGRATION.md
├── README.md
├── frontend/                 # 从 Codex-Nex 拷贝并改 bridge
│   └── src/
│       ├── index.html
│       ├── js/bridge.js      # Wails 替代层
│       └── ...
├── src-tauri/
│   ├── Cargo.toml
│   ├── tauri.conf.json
│   ├── capabilities/
│   └── src/
│       ├── main.rs
│       ├── lib.rs
│       ├── state.rs          # 本地 UI store（设置/宠物/日历…）
│       ├── codex/
│       │   ├── mod.rs
│       │   ├── sidecar.rs    # 启停 codex-app-server
│       │   ├── client.rs     # WebSocket JSON-RPC 客户端
│       │   ├── events.rs     # 通知 → Tauri emit
│       │   └── protocol.rs   # 方法名常量与 DTO
│       └── commands/
│           ├── mod.rs
│           ├── app_state.rs
│           ├── pets.rs
│           ├── calendar.rs
│           ├── cinema.rs
│           ├── connectors.rs
│           ├── fs.rs
│           ├── settings.rs
│           └── engine.rs     # 转发 thread/turn/mcp/...
└── scripts/
    ├── build.ps1
    └── CLOUD_BUILD.md
```

## 5. 阶段计划

| 阶段 | 内容 | 状态 |
|------|------|------|
| P0 | 架构定稿 + 骨架 + bridge | **本轮交付** |
| P1 | sidecar 启停 + initialize + thread/start/list/read + turn/start | 代码已落，云端验证 |
| P2 | 审批流、MCP、skills、plugins 命令面 | 骨架 + 映射表 |
| P3 | 宠物/日历/cinema/定时任务本地化 | 骨架 |
| P4 | 前端全量替换 `window.go`、删 Wails 绑定 | bridge + 迁移脚本 |
| P5 | 云端 CI：rustc + tauri build | CLOUD_BUILD.md |

## 6. 版本与依赖策略

- `codex-rust`：**sidecar 二进制**固定 v0.154.0，从官方 release 或本地 `codex-rs` 构建产物拷入 `src-tauri/binaries/`
- 可选 crate：`codex-app-server-protocol` 仅当需要强类型时 path/git 引用；默认 JSON 透传降低耦合
- Tauri：v2
- 前端：无构建器，ES module，与现网一致

## 7. 明确不做的（本轮）

- 不把 100+ 官方 crate 复制进本仓库
- 不重写 Agent/工具/MCP
- 不在本机跑 `cargo check`
- 不一次搬完全部 150+ 个 Go App 方法实现——先通主路径 + 完整 command 壳

## 8. 云端验证清单

见 `scripts/CLOUD_BUILD.md`。
