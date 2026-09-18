# Codex-Tauri

Tauri v2 桌面壳 + **官方 Codex app-server**（唯一引擎形态：预编译 sidecar，`rust-v0.154.0`）。

| 文档 | 说明 |
|------|------|
| [docs/ARCHITECTURE.md](./docs/ARCHITECTURE.md) | **架构分层（必读）** |
| [docs/LAYOUT.md](./docs/LAYOUT.md) | 目录布局与清理规则 |
| [docs/RUST_BACKEND.md](./docs/RUST_BACKEND.md) | 引擎传输 / 握手 / 方法名 |
| [docs/BROWSER-DEV.md](./docs/BROWSER-DEV.md) | **浏览器调试模式**（不编译 Rust 跑真实引擎） |
| [docs/REPORT-2026-09-16.md](./docs/REPORT-2026-09-16.md) | **官方桌面端 UIA 动态逆向总报告**（启动/操控/19 设置页/Turn 流） |
| [docs/official-ui/CDP_NOTES.md](./docs/official-ui/CDP_NOTES.md) | CDP 结论（Store 版不开远程调试，UIA 为唯一动态路径） |
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
| **唯一 / CI** | 官方 `codex-app-server-*.exe` sidecar（安装器内置资源） | 日常产品构建 |
| ~~实验~~ 已退役 | in-process 源码链已移除（feature、workspace 成员、`src/backend` 树），仅存 git 历史 | — |

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
- 前端改动后，Agent 只负责改码 + `tsc --noEmit`/`scripts/` 静态检查；**不执行 vite 构建、不开内置浏览器测试**——运行与视觉验证由本人自测（2026-09-18 约定）  
