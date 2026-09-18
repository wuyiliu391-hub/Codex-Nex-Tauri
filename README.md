# Codex-Tauri

Tauri v2 桌面壳 + **官方 Codex app-server**（默认预编译 sidecar，`rust-v0.154.0`）。

| 文档 | 说明 |
|------|------|
| [docs/ARCHITECTURE.md](./docs/ARCHITECTURE.md) | **架构分层（必读）** |
| [docs/LAYOUT.md](./docs/LAYOUT.md) | 目录布局与清理规则 |
| [docs/RUST_BACKEND.md](./docs/RUST_BACKEND.md) | 引擎传输 / 握手 / 方法名 |
| [docs/provider-setup.md](./docs/provider-setup.md) | 自定义供应商 |
| [docs/official-ui/APPSERVER-METHOD-INVENTORY-0.154.0.md](./docs/official-ui/APPSERVER-METHOD-INVENTORY-0.154.0.md) | 官方方法面清单 |

## 分层（摘要）

```text
React UI  →  Tauri Shell API（产品 IPC）  →  app-server JSON-RPC  →  官方引擎
                │
                └─ 本地 store：宠物/日历/设置等桌面能力
```

| 模式 | 引擎来源 | 用途 |
|------|----------|------|
| **默认 / CI** | 官方 `codex-app-server-*.exe` sidecar | 日常产品构建 |
| 可选 | `--features in-process` 链 `src/backend` | 引擎实验 |

## 构建（CI）

- `lint-check`：前端静态检查 + typecheck + rustfmt  
- `build-fast` / `build-release`：下载官方引擎 → `cargo tauri build -- --no-default-features`（只编壳）

引擎二进制（不入库）：

```text
src-tauri/binaries/codex-app-server-x86_64-pc-windows-msvc.exe
```

来源：[openai/codex rust-v0.154.0](https://github.com/openai/codex/releases/tag/rust-v0.154.0)

## 本地前端

```bash
cd frontend
npm ci
npm run typecheck
npm run build
```

## 硬规则

- UI 控件必须走真实 Tauri IPC，禁止假回调/占位成功  
- 保持旧 CSS DOM/class 契约  
- 不随意修改 Codex 核心 Agent 逻辑  
- 协议以官方 `app-server generate-ts` 为准  
