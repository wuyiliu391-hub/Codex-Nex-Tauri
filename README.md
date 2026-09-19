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

两个 workflow，全部使用官方/社区成熟 action，无手写脚本：

| Workflow | 触发 | 作用 |
|---|---|---|
| `ci.yml` | push / PR | `checks`（门禁）+ `build`（打包验证） |
| `generate-lockfile.yml` | **仅手动** | 一次性生成 `Cargo.lock`（见下） |

### ci.yml 的 job

| Job | 内容 |
|---|---|
| `checks` | 前端 `typecheck` + `build`；`cargo test --lib`（**门禁**）；`fmt`/`clippy`（仅报告） |
| `build` | `tauri-apps/tauri-action@v1` 执行完整打包（仅构建，不发布） |

### 使用的 action

| action | 用途 |
|---|---|
| `tauri-apps/tauri-action@v1` | **官方** action：安装 Tauri CLI、执行 `tauri build`、产出打包产物 |
| `dtolnay/rust-toolchain@master` | Rust 工具链（官方指南推荐），钉死 `1.98.1` |
| `mozilla-actions/sccache-action@v0.0.11` | 编译缓存：未变的 crate 跳过 rustc |
| `Swatinem/rust-cache@v2` | 依赖缓存：`~/.cargo/registry` + `target/` |
| `actions/setup-node@v4` | Node 22 + npm 缓存 |
| `actions/checkout@v4` | 检出代码 |

### 缓存：两层，互补而非替代

| 层 | 缓存对象 | 效果 |
|---|---|---|
| `sccache` | 单个编译单元（按源文件内容哈希） | 源码未变 → **跳过编译** |
| `rust-cache` | `~/.cargo/registry` + `target/` | 依赖 → **跳过下载** |

sccache 永远看不到 `cargo fetch`，rust-cache 不缓存编译结果，所以两者都需要。

**sccache 有三个必须配对的开关**（依据 [mozilla/sccache 官方文档](https://github.com/mozilla/sccache/blob/main/docs/GHA.md)）：

```yaml
SCCACHE_GHA_ENABLED: "on"     # 用 GHA 缓存作存储后端（值是 on，不是 true）
RUSTC_WRAPPER: sccache        # 让 rustc 走 sccache
# 以及必须导出这两个 token，否则后端无法鉴权：
#   ACTIONS_RESULTS_URL
#   ACTIONS_RUNTIME_TOKEN
```

**任一缺失，sccache 会正常安装但静默不缓存任何东西。**

### 三个容易踩的坑（均已修正）

**1. `rust-cache` 的 `workspaces` 必须指向 `src-tauri`**

```yaml
workspaces: "./src-tauri -> target"
```

本项目不是 Tauri 应用在仓库根的结构（而是 `frontend/` + `src-tauri/`）。
官方文档明确要求这种布局必须指定路径——写成 `.` 会缓存错误的目录且**静默失效**。

**2. 前端构建交给 `beforeBuildCommand`**

```json
"beforeBuildCommand": "npm --prefix ../frontend run build"
```

原先是空字符串，导致 `tauri build` **不会构建前端**，而 `generate_context!` 又需要
`frontend/dist` 存在——构建必然失败。现在由 Tauri CLI 统一负责，本地与 CI 走同一条路径。

**3. `projectPath` 不能设为 `src-tauri`**

官方定义是"**包含 `src-tauri/` 的目录**"，即本仓库根。设成 `src-tauri` 会让 action
去找 `src-tauri/src-tauri/`。

### Cargo.lock

依赖锁定，依据 [Cargo 官方 FAQ](https://doc.rust-lang.org/cargo/faq.html#why-have-cargolock-in-version-control)：
`cargo new` **默认就把 `Cargo.lock` 纳入版本控制**，用途是让构建可复现，官方明确列出其收益之一是
**"Ensuring CI only fails due to new commits and not external factors"**——正是我们遇到的问题。

**当前状态：尚未生成**（本机无 Rust 工具链，无法运行 `cargo generate-lockfile`）。

生成方式：Actions → **generate-lockfile** → Run workflow → 下载 `Cargo.lock` artifact →
提交到**仓库根目录**（不是 `src-tauri/`）。

`ci.yml` 会自动检测：存在则所有 cargo 命令加 `--locked`（严格模式，版本不一致立即报错）；
不存在则**发出醒目警告**但不阻断，让流水线在过渡期仍可用。

### 已知限制

- **`fmt` / `clippy` 不阻断构建**：本仓库从未跑过 `cargo fmt`（作者本机无 Rust
  工具链），直接设为门禁会让 CI 永久变红。它们仍输出到日志，便于有工具链的贡献者
  修正后再提升为门禁。**真正的破坏由 `cargo test --lib` 拦截**（内核 30 个测试）。
- **仅 Windows**：官方模板支持 matrix（macOS/Linux），本产品是 Windows 优先，暂不添加
  未经验证的平台条目。

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
