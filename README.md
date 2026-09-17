# Codex-Tauri

Tauri v2 桌面壳 + **官方 Codex app-server**（默认预编译 sidecar，`rust-v0.154.0`）。

- **架构分层（必读）**：[docs/ARCHITECTURE.md](./docs/ARCHITECTURE.md)
- 历史迁移说明：[MIGRATION.md](./MIGRATION.md)（早期文档，产品路径以 ARCHITECTURE 为准）
- 引擎协议细节：[docs/RUST_BACKEND.md](./docs/RUST_BACKEND.md)
- 官方方法面差分：[docs/official-ui/APPSERVER-METHOD-INVENTORY-0.154.0.md](./docs/official-ui/APPSERVER-METHOD-INVENTORY-0.154.0.md)

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

## 构建（CI 策略）

- `lint-check`：前端检查 + rustfmt  
- `build-fast` / `build-release`：下载官方引擎 → `cargo tauri build -- --no-default-features`（只编壳）

引擎二进制放入（不入库）：

```text
src-tauri/binaries/codex-app-server-x86_64-pc-windows-msvc.exe
```

来源：[openai/codex releases rust-v0.154.0](https://github.com/openai/codex/releases/tag/rust-v0.154.0)

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
