# 仓库目录布局

根目录只保留 **构建与导航必需** 的入口；大文件、临时产物、历史实验脚本一律不入库。

## 根目录

```text
Codex-Tauri/
├── README.md              # 入口
├── Cargo.toml / Cargo.lock
├── .gitignore
├── .github/               # CI
├── docs/                  # 文档
├── frontend/              # React + CSS/i18n
├── scripts/               # CI/协议/校验脚本（仅保留必需）
├── src/                   # 官方 codex-rust（workspace 成员）
└── src-tauri/             # Tauri 壳 + binaries/
```

## 分层（详见 ARCHITECTURE.md）

| 目录 | 层 |
|------|-----|
| `frontend/` | L4 |
| `src-tauri/src/commands` + `lib.rs` | L3 |
| `src-tauri/src/codex/*` | L2 |
| `src-tauri/binaries/` | L1（官方 exe） |
| `src/backend/` | L0（仅 in-process） |

## docs/（精简后）

```text
docs/
├── ARCHITECTURE.md
├── LAYOUT.md              # 本文件
├── RUST_BACKEND.md
├── provider-setup.md
├── official-ui/
│   ├── APPSERVER-METHOD-INVENTORY-0.154.0.md
│   ├── APPSERVER-METHOD-INVENTORY-0.154.0.json
│   └── screens/
├── compose/change-notes/  # 变更记录
└── visual/                # 官方界面参考截图
```

## scripts/（CI 与协议必需）

| 脚本 | 用途 |
|------|------|
| `check-frontend.mjs` | 前端结构检查（CI） |
| `verify-notification-coverage.mjs` | 通知覆盖（CI） |
| `migration-status.mjs` | 迁移状态（lint-check） |
| `verify-agent-a-hex.cjs` | CSS token 色值 |
| `verify-protocol-usage.mjs` | 协议用法 |
| `gen-protocol.py` / `gen-protocol-ts.py` | 从官方源码生成协议表 |
| `diff-official-appserver-schema.mjs` | 官方 generate-ts 差分 |
| `build.ps1` | 本地/云端构建入口 |

## 本地产物（gitignore，勿提交）

| 路径 | 内容 |
|------|------|
| `scratch/` | 临时生成（schema、日志） |
| `.agnes/` | 本地 AI 工作区 |
| `codex-asar-extract/` | 官方 asar 解包 |
| `src-tauri/binaries/*.exe` | 引擎二进制 |
| `frontend/dist/`、`target/` | 构建输出 |

## 清理规则

1. 新脚本进 `scripts/`，**先确认 CI/协议是否需要**；UIA 抓取、一次性 probe 不进仓库  
2. 文档进 `docs/`；**与当前架构矛盾的旧文直接删**，不要留着误导  
3. 官方 exe 只放 `src-tauri/binaries/`  
4. 实验输出只放本地 `scratch/`（gitignore）  
5. 根目录禁止再堆 `.md` / `.cjs` / `.exe`  
