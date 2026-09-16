# Cloud build & verification

本机无 Rust：所有语法检查、测试、打包在云端执行。

## 前置产物

1. **codex-app-server sidecar**

   从官方源码构建（与 v0.154.0 对齐）：

   ```powershell
   # 在含 codex-rust 的构建机上
   cd codex-rust-v0.154.0/codex-rs
   cargo build -p codex-app-server --release
   # 产物：target/release/codex-app-server.exe
   ```

   拷入：

   ```
   Codex-Tauri/src-tauri/binaries/codex-app-server-x86_64-pc-windows-msvc.exe
   ```

   Tauri `externalBin` 要求无后缀的 target triple 命名。

2. **前端**

   ```powershell
   # 从旧仓库拷 UI，保留本仓库 bridge.js
   Copy-Item -Recurse Codex-Nex\frontend\src\* Codex-Tauri\frontend\src\
   Copy-Item Codex-Tauri\frontend\src\js\bridge.js Codex-Tauri\frontend\src\js\bridge.js -Force
   ```

   在 `bootstrap.js` 最顶部增加：

   ```js
   import { installBridge } from "./bridge.js";
   installBridge();
   ```

3. **图标**

   Tauri 需要 `src-tauri/icons/`。从 Codex-Nex `build/appicon.png` 生成：

   ```powershell
   # 使用 tauri icon CLI（云端）
   cargo tauri icon path/to/appicon.png
   ```

## 云端验证步骤（Windows runner）

```powershell
# Toolchain
rustup default stable
rustup target add x86_64-pc-windows-msvc
cargo install tauri-cli --locked
# WebView2 通常预装于 windows-latest；否则安装 Runtime

# 1) Rust 语法与类型
cd Codex-Tauri/src-tauri
cargo check --message-format=short

# 2) 单元测试（如有）
cargo test

# 3) clippy（与 CI 对齐时可选）
cargo clippy -- -D warnings

# 4) 构建 sidecar（若未预编译）
# 同上 cargo build -p codex-app-server --release

# 5) 打包
cargo tauri build

# 产物
# src-tauri/target/release/Codex.exe
# src-tauri/target/release/bundle/nsis/*.exe
```

## 预期失败点与处理

| 症状 | 处理 |
|------|------|
| `codex-app-server` 启动失败 | 检查 `--listen` 端口占用；写日志到 `%TEMP%\codex-app-server.log` |
| WebSocket 连接拒绝 | sidecar 未就绪；`EngineHandle` 已有重试，确认 binary 路径 |
| `generate_context!` 失败 | 缺 icons / frontendDist 路径错误 |
| protocol 字段漂移 | 用 `rpc_raw` 先打通；再按官方 0.154.0 字段名收紧 command |
| edition/lint | 本壳 crate 用 edition 2021，避免跟官方 2024 强绑 |

## 最小冒烟（云端跑通即算 P0）

1. `cargo check` 通过
2. `cargo tauri build` 产出 exe
3. 启动后窗口出现（无 sidecar 也应能开，仅 engine offline）
4. `invoke("get_state")` 返回本地快照
5. 放入 sidecar 后 `invoke("engine_status")` → `connected: true`
6. `invoke("new_session")` / `invoke("list_sessions")` 不抛连接错误
