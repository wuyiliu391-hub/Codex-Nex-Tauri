# Codex-Tauri

Tauri v2 桌面端 + **自研进程内内核**。单一可执行文件，无外部引擎、无子进程、无本地端口。

```
React UI  ──Tauri IPC──►  src-tauri 命令层  ──►  kernel（进程内）
                                                    │
  桌面能力（宠物/日历/设置/连接器）──────────────────┘
  走本地 store（shell-state.json）
```

## 为什么是自研内核

早期版本把官方 `codex-app-server.exe`（307 MB）作为 sidecar 子进程启动，经
WebSocket JSON-RPC 通信。该架构有一类**结构性故障**，无法靠打补丁消除：

| 故障 | 原因 |
|---|---|
| 冷启动双连接竞态 | 两个并发调用各自建连，输家的连接与在途请求被丢弃 |
| 死连接挂满 120 秒 | reader 退出后不清空 pending 表，调用方只能等超时 |
| 审批请求黑洞 | 部分 server request 发出后前端无监听，turn 永久挂死 |
| 引擎崩溃无感知 | 无存活监控，不重启也不通知 UI |
| 回环端口无鉴权 | 17457 端口任意本机进程可连 |
| 子进程成为孤儿 | 从任务管理器强杀宿主时，引擎进程残留 |

自研内核改为**进程内**执行，上述六项**在结构上不再存在**：没有二进制要解析，
没有端口要绑定，没有子进程要托管。

## 分层

| 层 | 位置 | 职责 |
|---|---|---|
| L4 展示 | `frontend/app/**` | React 组件、状态、事件桥 |
| L3 产品 API | `src-tauri/src/commands/**` | Tauri 命令；前端**唯一**依赖面 |
| L2 内核 | `src-tauri/src/kernel/**` | 协议、会话、turn 执行、事件 |
| L1 本地能力 | `src-tauri/src/state.rs` | 宠物/日历/设置等本地 store |

**硬规则**：前端只调用 L3 已注册的命令；内核不伪造成功；未实现的能力返回显式
的 `not-wired` 结果，而不是空列表或假的 `ok: true`。

## 内核模块

| 文件 | 行数 | 职责 |
|---|---|---|
| `kernel/protocol.rs` | 155 | 与前端冻结的契约：方法名/通知名常量 + `codex:{method}` 通道转换 |
| `kernel/session.rs` | 470 | 内存 thread/turn 状态机；强制每线程同时只有一个 turn |
| `kernel/provider.rs` | 316 | `ModelProvider` trait + `EchoProvider`（离线确定性后端） |
| `kernel/events.rs` | 305 | 唯一构造通道名的地方；每个方法都有测试断言存在于前端表中 |
| `kernel/state.rs` | 637 | turn 执行：分离任务 + `CancellationToken`，中断可靠 |

`kernel/protocol.rs` 的通道转换规则必须与前端
`frontend/app/bridge/events.ts::tauriEventName` 逐字符一致——这是整个集成里最
脆弱的一环，两侧不一致会导致 UI 静默收不到任何事件。

## 当前状态

| 能力 | 状态 |
|---|---|
| 会话/线程管理（内存） | ✅ 已实现 |
| turn 执行 + 流式事件 | ✅ 已实现 |
| 中断 | ✅ 已实现（协作式取消） |
| 真实模型调用 | ⛔ 待实现（当前为 `EchoProvider`） |
| 持久化 | ⛔ 待实现（重启即失） |
| 工具执行 / sandbox | ⛔ 待实现 |
| 审批流 | ⛔ 待实现（`EchoProvider` 不触发审批） |
| MCP / 插件 | ⛔ 仅存储配置，不加载 |

`EchoProvider` 是**传输探针**，不是假模型：它如实声明自己
（`is_placeholder()`），并在每个 turn 结束时发出 `warning` 告知用户"这是回声
而非模型回复"。它的用途是让传输层在不受网络、密钥、配额干扰的情况下被验证。

## 构建

```bash
# 前端
cd frontend
npm ci
npm run typecheck
npm run build

# 桌面端（需要 Rust + Tauri CLI）
cargo tauri build --manifest-path src-tauri/Cargo.toml
```

## CI

单个 workflow（`.github/workflows/ci.yml`），两个 job：

| Job | 运行环境 | 内容 |
|---|---|---|
| `frontend` | ubuntu-latest | `npm ci` → `typecheck` → `build`，产出 `dist` 工件 |
| `rust` | windows-latest | `cargo fmt` / `clippy`（仅报告）→ `cargo test --lib`（**门禁**） |

### 缓存：两层，缺一不可

| 层 | 工具 | 缓存对象 | 效果 |
|---|---|---|---|
| 1 | `mozilla-actions/sccache-action@v0.0.11` | 单个编译单元（按源文件内容哈希） | 源码未变 → **跳过编译** |
| 2 | `Swatinem/rust-cache@v2` | `~/.cargo/registry` + `target/` | 依赖 → **跳过下载** |

**为什么需要两层**：sccache 让未变的 crate 跳过*编译*，rust-cache 让依赖跳过*下载*。
sccache 永远看不到 `cargo fetch`，rust-cache 不缓存编译结果——两者互补而非替代。

sccache 需要两个环境变量才生效（缺一不可）：

```yaml
SCCACHE_GHA_ENABLED: "true"   # 用 GitHub Actions 缓存作存储后端
RUSTC_WRAPPER: sccache        # 让 rustc 走 sccache
```

### 已知限制

- **`Cargo.lock` 未入库**：依赖版本无法锁定。两层缓存都无法解决这个问题——一次
  全新的依赖解析可能选到不同版本，从而使两层缓存同时失效。这是"上次失败、下次
  重新拉依赖"的根本原因。
- **`fmt` / `clippy` 不阻断构建**：本仓库从未跑过 `cargo fmt`（作者本机无 Rust
  工具链），直接设为门禁会让 CI 永久变红。它们仍会输出到日志，便于有工具链的
  贡献者修正后再提升为门禁。**真正的破坏由 `cargo test --lib` 拦截**（内核 30 个测试）。

## 目录

| 路径 | 说明 |
|---|---|
| `frontend/app/**` | React 应用（组件、状态、事件桥） |
| `frontend/src/protocol/**` | 协议方法表（前端契约的来源） |
| `frontend/src/js/**` | 遗留 vanilla 层（i18n、默认值、宠物数据），仍被 React 引用 |
| `src-tauri/src/kernel/**` | 自研内核 |
| `src-tauri/src/commands/**` | Tauri 命令层 |
| `src-tauri/src/codex/adapter.rs` | 供应商协议转换器（Chat/Anthropic/Ollama → Responses） |
| `docs/` | 架构说明、供应商配置、官方 UI 逆向语料 |
| `scripts/` | UIA 逆向工具（`uia-*.ps1` / `capture-*.ps1`），与构建无关 |
