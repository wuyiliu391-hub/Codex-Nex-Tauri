# Codex-Tauri 架构分层

> **一句话定位**  
> 用 **Tauri v2** 写的 Codex 桌面壳：前端完整交互 → 壳层 **产品级 Tauri IPC** → **官方 app-server 协议**（默认 **预编译 sidecar**）。  
> 不是「把官方桌面 UI 搬进 Tauri」的像素克隆，而是 **同一引擎协议上的自有桌面产品**。

文档版本与代码对齐：`rust-v0.154.0` 引擎 / React 前端 / shell-only CI。

---

## 1. 分层总览

```text
┌─────────────────────────────────────────────────────────────────┐
│  L4  Presentation — 展示层                                       │
│      React UI + 旧 Wails 基线 CSS/DOM（class 契约）               │
│      只负责：布局、组件、文案、用户操作入口                        │
└────────────────────────────┬────────────────────────────────────┘
                             │  invoke / listen（Tauri IPC）
┌────────────────────────────▼────────────────────────────────────┐
│  L3  Shell API — 产品 API 层（唯一前端依赖面）                   │
│      src-tauri #[tauri::command] + 事件桥                        │
│      本地 store（设置/宠物/日历/连接器…）                         │
│      引擎 RPC 包装（会话/审批/config…）                          │
│      缺口在此补齐，不在前端造假                                   │
└────────────────────────────┬────────────────────────────────────┘
                             │  JSON-RPC（JSONL）
┌────────────────────────────▼────────────────────────────────────┐
│  L2  Engine Client — 协议客户端层                                │
│      initialize → initialized 握手                               │
│      request/response + server→client request 回包               │
│      notification → Tauri emit（codex:*）                        │
└────────────────────────────┬────────────────────────────────────┘
                             │
┌────────────────────────────▼────────────────────────────────────┐
│  L1  Engine Host — 引擎托管层（可切换）                          │
│      [产品默认] Official sidecar：                               │
│        openai/codex release exe → src-tauri/binaries/           │
│      [引擎实验] in-process：链 src/backend（--features）          │
└────────────────────────────┬────────────────────────────────────┘
                             │
┌────────────────────────────▼────────────────────────────────────┐
│  L0  Official Engine — 官方引擎契约                              │
│      app-server protocol（Thread / Turn / 审批 / 事件）          │
│      experimentalApi: true（本项目已开启）                       │
│      真相来源：codex app-server generate-ts / json-schema        │
└─────────────────────────────────────────────────────────────────┘
```

**产品 API = L3。**  
前端永远不直接假设「exe 会暴露所有桌面能力」。

---

## 2. 目录 → 分层映射

| 路径 | 层 | 职责 |
|------|----|------|
| `frontend/app/**` | L4 | React 组件、状态、事件桥、外观应用 |
| `frontend/src/styles/**` | L4 | 旧 Wails/官方皮肤 CSS（token + 页面样式） |
| `frontend/src/js/i18n*.js` | L4 | 多语言词典；`t()` 由壳设置同步语言 |
| `frontend/src/protocol/**` | L2/L3 辅助 | 生成的通知/请求方法表（可与官方 schema 差分） |
| `src-tauri/src/lib.rs` | L3 | invoke_handler 注册（产品命令清单） |
| `src-tauri/src/commands/**` | L3 | 本地 store + 引擎转发实现 |
| `src-tauri/src/codex/client.rs` | L2 | WS/JSON-RPC 客户端与握手 |
| `src-tauri/src/codex/sidecar.rs` | L1/L2 | 进程托管、事件泵、二进制解析 |
| `src-tauri/src/codex/events.rs` | L2 | ServerMessage → `codex:*` Tauri 事件 |
| `src-tauri/binaries/` | L1 | 官方 `codex-app-server-*.exe`（gitignore） |
| `src/backend/**` | L0 源码树 | 官方 codex-rust；**仅** in-process feature 使用 |
| `docs/ARCHITECTURE.md` | — | 本文 |
| `docs/RUST_BACKEND.md` | L1/L2 | 传输、方法名、握手、审批回包 |
| `docs/official-ui/APPSERVER-METHOD-INVENTORY-*.md` | L0/L3 | 官方方法面 vs 项目协议差分 |
| `.github/workflows/*` | 交付 | shell-only CI + 官方引擎下载 |
| `scripts/diff-official-appserver-schema.mjs` | 工具 | 官方 generate-ts 与项目协议差分 |

历史文档 `MIGRATION.md` 记录早期 sidecar 构想，**日常产品路径以本文为准**。

---

## 3. 职责边界（硬约束）

| 允许 | 禁止 |
|------|------|
| 前端只 `invoke` **L3 已注册命令** / `listen` **codex:*** | 前端假点击、空壳按钮、写死成功 |
| L3 用 RPC 转发官方已有能力 | 在 UI 里再实现一份 Agent 业务逻辑 |
| L3 用本地 store 做官方没有的桌面能力 | 为了「看起来像官方」伪造引擎数据 |
| L0 协议缺口在 L3 补 command | 随意改 `codex-core` Agent 循环 |
| UI 保持旧 DOM/class/CSS 契约 | 随意发明 class 或改 DOM 层级 |
| 引擎版本变更时替换 release 二进制 / 选择性升级源码 | 逆向/篡改官方 exe「强行开接口」 |
| `experimentalApi: true` 使用官方实验方法 | 在未生成 schema 前手猜 RPC 名 |

---

## 4. 两条运行模式

### A. 产品模式（默认、CI）

```text
cargo tauri build -- --no-default-features
# default features = []
# 引擎 = 官方 release:
#   github.com/openai/codex/releases/tag/rust-v0.154.0
#   codex-app-server-x86_64-pc-windows-msvc.exe
#   → src-tauri/binaries/
```

- **编译面**：`src-tauri` 壳 + 前端，不编 `src/backend`  
- **适合**：日常迭代、出安装包、跑通完整 UI IPC  

### B. 引擎实验模式（可选）

```text
cargo build --features in-process
# 或 cargo tauri build -- --features in-process
```

- **编译面**：壳 + 官方源码闭包（重）  
- **适合**：改适配层、对协议行为做进程内验证  
- **不是**「前端接口是否完整」的前提——完整度在 L3  

---

## 5. 核心数据流

### 5.1 用户操作 → 引擎

```text
按钮 / 表单 (L4)
  → invoke("send_message" | "list_sessions" | …)  (L3)
    → EngineHandle::rpc(JSON-RPC)                   (L2)
      → sidecar exe / in-process                    (L1)
        → official app-server                       (L0)
```

### 5.2 引擎事件 → UI

```text
app-server notification / server request     (L0)
  → broadcast ServerMessage                  (L1/L2)
    → events.rs emit codex:turn-* / approval (L2)
      → bridge/events.ts onNotification      (L4)
        → turnStore / ApprovalHost → UI      (L4)
```

### 5.3 桌面独有能力（无官方 RPC）

```text
宠物 / 日历 / cinema / 连接器 / 定时任务 / PR …
  → 仅 L3 本地 store（shell-state.json）
  → 禁止伪装成引擎 RPC 成功
```

---

## 6. 产品 API 与官方协议的关系

| 概念 | 定义 |
|------|------|
| **产品 API** | `src-tauri` 注册的 Tauri command + Tauri 事件；前端唯一契约 |
| **官方协议** | app-server JSON-RPC（Thread/Turn/审批/事件 + experimental） |
| **关系** | 产品 API ⊇ f(官方协议) ∪ 本地能力；官方协议不必被 UI 全量暴露 |

**官方 0.154.0 方法面摘要**（详见 inventory 文档）：

- Schema 抽出约 **195** 个方法  
- 项目协议已点名约 **130**  
- **约 65** 个 official-only（account/plugin/share、fs/*、threadSection、review、windowsSandbox 等）  
- 逐步接入方式：**L3 真实转发**，而不是前端直连猜方法名  

生成与差分：

```text
codex app-server generate-ts --out ./schemas
codex app-server generate-json-schema --out ./schemas
node scripts/diff-official-appserver-schema.mjs
```

---

## 7. 前端与视觉基线

| 项 | 约定 |
|----|------|
| DOM / class | 对齐旧 Wails / vanilla（`home.css`、`settings.css`…） |
| 主题 / 字号 | `preferences` → `appearance.ts` 写回 `html` class 与 `--text-*` |
| 字体 | OpenAI Sans（`tokens` / `official-tokens`） |
| i18n | 词典在 `frontend/src/js/i18n*.js`；语言由 L3 settings 同步 |
| Design Token | 暂不替换为「官方逆向 token 全量重做」；沿用现有 CSS 变量层 |

UI 目标：**旧基线可辨识 + 真实 IPC**，不是营销级像素对齐。

---

## 8. 交付与 CI

| Workflow | 作用 |
|----------|------|
| `lint-check` | 前端静态检查 + typecheck；`cargo fmt --check`（rustc 钉死） |
| `build-fast` | 下载官方 app-server → 壳 `cargo tauri build -- --no-default-features` → 产物 artifact |
| `build-release` | 同上策略 + 正式打包（tag） |

缓存栈（可选优化，非架构本质）：

- 钉死 `rustc 1.98.1`  
- Swatinem rust-cache + sccache GHA  
- 官方引擎二进制按 release tag 缓存  

---

## 9. 安全与升级

| 主题 | 策略 |
|------|------|
| 引擎版本 | 钉 `rust-v0.154.0` 一类 tag；升级时同步 schema 差分与 L3 转发 |
| 二进制来源 | 仅官方 GitHub Releases；校验体积/可执行；不入库（gitignore） |
| 密钥 | provider API key 走壳层存储 / 环境注入，不进前端 |
| 审批 | server request 必须回包（accept/decline/…），避免 turn 挂死 |
| 逆向官方 exe | **禁止**作为开发路径 |

---

## 10. 开发者快速地图

| 我想改… | 去哪一层 / 文件 |
|---------|----------------|
| 按钮样式 / 布局 | `frontend/app/**` + `frontend/src/styles/**`（保持 class） |
| 按钮点下去做什么 | 该 TSX 的 `invoke("…")` → `src-tauri/src/commands/**` |
| 新「官方没有」的功能 | 先加 L3 command + 本地 store，再接 UI |
| 新「官方已有」的功能 | 查 inventory / `generate-ts` → L3 转发 → UI |
| 会话流样式 | `blocks/registry.tsx` + `home.css`（`.message-row` / `.proc-line`） |
| 引擎连不上 | `sidecar.rs` 二进制解析、`client.rs` 握手、`events.rs` |
| 协议方法名 | `docs/RUST_BACKEND.md` + `docs/official-ui/APPSERVER-METHOD-INVENTORY-*` |
| 本地深编引擎 | `--features in-process`（接受编译时间） |

---

## 11. 成功标准（架构是否「清晰」的验收）

1. 新同学能在 **10 分钟** 内说出 L0–L4 各自职责  
2. 任一 UI 控件能追溯到 **唯一** 的 L3 command  
3. CI 默认构建 **不编** `src/backend` 仍能出可用壳 + 引擎 sidecar  
4. 协议争议以 **官方 generate-ts** 为准，不以博客/群聊为准  
5. 仓库中不再出现「假接口 / 空 batchWrite / 未监听 CustomEvent」作为交付路径  

---

## 12. 相关文档

| 文档 | 内容 |
|------|------|
| [README.md](./README.md) | 项目入口 |
| [MIGRATION.md](./MIGRATION.md) | 历史迁移方案（sidecar 构想期） |
| [docs/RUST_BACKEND.md](./docs/RUST_BACKEND.md) | 引擎集成细节 |
| [docs/official-ui/APPSERVER-METHOD-INVENTORY-0.154.0.md](./docs/official-ui/APPSERVER-METHOD-INVENTORY-0.154.0.md) | 官方方法面清单 |
| [docs/compose/change-notes/](./docs/compose/change-notes/) | 变更记录 |
