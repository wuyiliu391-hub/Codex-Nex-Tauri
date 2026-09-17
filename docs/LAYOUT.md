# 仓库目录布局

根目录只保留 **构建与导航必需** 的入口；大文件、临时产物、历史文档各有归属。

## 根目录（保持精简）

```text
Codex-Tauri/
├── README.md              # 入口
├── Cargo.toml             # workspace 根
├── Cargo.lock
├── .gitignore
├── .github/               # CI workflows
├── docs/                  # 全部文档（含历史）
├── frontend/              # React + 旧 CSS/i18n
├── scripts/               # 构建 / 校验 / 协议生成脚本
├── src/                   # 官方 codex-rust 源码树（workspace 成员）
└── src-tauri/             # Tauri 壳（产品 API / 引擎客户端）
```

**不要**在根目录放：`.exe`、下载包、临时日志、实验脚本、第三方解包目录。

## 分层对应（详见 ARCHITECTURE.md）

| 目录 | 架构层 |
|------|--------|
| `frontend/` | L4 展示 |
| `src-tauri/src/commands` + `lib.rs` | L3 产品 API |
| `src-tauri/src/codex/*` | L2 协议客户端 / 事件 |
| `src-tauri/binaries/` | L1 引擎托管（官方 exe，gitignore） |
| `src/backend/` | L0 官方源码（仅 in-process feature） |

## docs/

```text
docs/
├── ARCHITECTURE.md        # 架构分层（主文档）
├── LAYOUT.md              # 本文件
├── RUST_BACKEND.md        # 引擎集成
├── MIGRATION.md           # 历史迁移（非日常路径）
├── HANDOVER-*.md          # 交接/走查
├── REPORT-*.md            # 调研报告
├── FRONTEND_ENGINE_MAP.md
├── provider-setup.md
├── official-ui/           # 官方 UI/协议清单
├── compose/               # change-notes / specs
├── uia/                   # UIA 走查
└── visual/                # 截图参考
```

## scripts/

| 类别 | 示例 |
|------|------|
| 前端质量 | `check-frontend.mjs`、`verify-notification-coverage.mjs`、`verify-agent-a-hex.cjs` |
| 协议 | `gen-protocol*.py`、`diff-official-appserver-schema.mjs`、`verify-protocol-usage.mjs` |
| 构建/冒烟 | `build.ps1`、`smoke-frontend-uia.cjs`、`verify-boot.mjs` |
| UIA/抓取 | `uia-*.ps1`、`capture-*.ps1`（本地调试） |
| 说明 | `CLOUD_BUILD.md` |

## src-tauri/

```text
src-tauri/
├── Cargo.toml             # default features = []（壳-only）
├── tauri.conf.json
├── capabilities/
├── binaries/              # 官方 app-server（不入库）
│   └── codex-app-server-x86_64-pc-windows-msvc.exe
└── src/
    ├── lib.rs             # invoke_handler
    ├── commands/          # 产品命令
    ├── codex/             # client / sidecar / events / protocol
    └── state.rs           # 本地 shell-state
```

## 本地产物（均 gitignore）

| 路径 | 内容 |
|------|------|
| `scratch/` | 临时日志、schema 生成、探测脚本 |
| `.agnes/` | 本地 AI 工作区 |
| `codex-asar-extract/` | 官方 asar 解包 |
| `frontend/dist/`、`target/` | 构建输出 |
| `src-tauri/binaries/*.exe` | 引擎二进制 |

## 清理规则

1. 新脚本进 `scripts/`，不进根目录  
2. 新文档进 `docs/`（或子目录），不进根目录  
3. 官方二进制只放 `src-tauri/binaries/`  
4. 实验输出只放 `scratch/`  
5. 根目录新增文件前先问：是否 **Cargo / CI / 导航必需**？否则放进子目录  
