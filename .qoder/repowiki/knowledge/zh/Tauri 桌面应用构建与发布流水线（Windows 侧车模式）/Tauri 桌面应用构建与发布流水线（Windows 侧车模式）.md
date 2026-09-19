---
kind: build_system
name: Tauri 桌面应用构建与发布流水线（Windows 侧车模式）
category: build_system
scope:
    - '**'
source_files:
    - .github/workflows/build-fast.yml
    - .github/workflows/build-release.yml
    - .github/workflows/lint-check.yml
    - src-tauri/Cargo.toml
    - src-tauri/tauri.conf.json
    - src-tauri/build.rs
    - frontend/package.json
    - scripts/build.ps1
    - scripts/stage-dist.ps1
---

## 1. 构建系统总览

该项目采用 **Tauri 2 + Vite/React 前端** 的混合架构，通过 Cargo workspace 聚合 `src-tauri`（Rust 壳层）与 `frontend`（TypeScript/React）。构建产物为 Windows 平台可执行文件，运行时以 sidecar 方式启动预编译的官方 `codex-app-server.exe` 引擎。

- Rust 工具链：固定 `rustc 1.98.1`（CI），workspace 声明最低 `rust-version = "1.77"`。
- Tauri CLI：固定版本 `2.11.4`，由 CI 从 GitHub Releases 下载并缓存到 `.tools/cargo-tauri.exe`，本地开发需自行安装至 PATH。
- 前端构建：Vite 7 + TypeScript，`npm run build` 输出到 `frontend/dist`，被 Tauri 打包进二进制。
- Sidecar 引擎：从 `openai/codex` releases 下载 `rust-v0.154.0` 的 `codex-app-server-x86_64-pc-windows-msvc.exe`，放入 `src-tauri/binaries/`，由 `tauri.conf.json` 的 `bundle.resources` 嵌入或运行时旁加载。

## 2. 关键文件与职责

| 文件 | 作用 |
|---|---|
| `src-tauri/Cargo.toml` | Rust crate 定义，启用 `tray-icon`、`protocol-asset` 特性；注释明确禁止在子包写 `[profile.release]`，统一由根 Cargo 管理 |
| `src-tauri/tauri.conf.json` | 产品名 `Codex`、标识符 `com.codex.desktop`、窗口配置、`frontendDist: ../frontend/dist`、WebView2 下载模式、sidecar 资源映射 |
| `src-tauri/build.rs` | 仅调用 `tauri_build::build()` |
| `frontend/package.json` | 脚本 `dev`/`build`/`typecheck`/`preview`/`dev:browser`，依赖 `@tauri-apps/api ^2.9.0`、React 19、Vite 7 |
| `scripts/build.ps1` | 本地一键构建入口：校验 sidecar 存在 → `cargo tauri build -- --no-default-features` → 调用 `stage-dist.ps1` |
| `scripts/stage-dist.ps1` | 将 release exe、可选 `WebView2Loader.dll`、sidecar 引擎复制到 `dist/Codex-portable/`，形成免安装包 |
| `.github/workflows/build-fast.yml` | PR/分支 push 快速构建：Node 22 + Rust 1.98.1 + sccache，下载 sidecar 并产出 `Codex-Windows-Portable` artifact（7 天保留） |
| `.github/workflows/build-release.yml` | tag `v*` 触发的正式发布构建：相同步骤但 artifact 保留 90 天 |
| `.github/workflows/lint-check.yml` | 并行质量门禁：前端静态检查（`scripts/check-frontend.mjs`、`verify-notification-coverage.mjs`、`migration-status.mjs`）+ `cargo fmt --check` |

## 3. 构建流程与约定

### 3.1 标准构建路径（CI 与本地一致）

```
npm ci --no-audit --no-fund          # frontend 依赖锁定
npm run build                        # tsc --noEmit && vite build → frontend/dist
cargo tauri build -- --no-default-features   # src-tauri 下执行，禁用 in-process 特性
./scripts/stage-dist.ps1             # 整理 dist/Codex-portable/
```

- `-- --no-default-features` 是 cargo runner 参数（非 tauri-cli flag），确保始终走 shell-only 路径。
- 环境变量 `TAURI_SKIP_SIDECAR_CHECK=1` 跳过 Tauri 对 sidecar 存在的检查，让 CI 显式下载失败而非静默跳过。
- `CARGO_TARGET_DIR` 指向工作区根 `target/`，使 `scripts/stage-dist.ps1` 能同时搜索 `target/release` 和 `src-tauri/target/release`。

### 3.2 缓存策略

| 缓存项 | 键 | 目的 |
|---|---|---|
| Node 模块 | `frontend/package-lock.json` | 加速前端依赖安装 |
| 官方引擎二进制 | `codex-app-server-rust-v0.154.0-win-x64` | 避免重复下载 ~230MB 的 sidecar |
| cargo-tauri CLI | `cargo-tauri-${runner.os}-2.11.4` | 复用预编译 CLI |
| Rust 增量编译 | Swatinem/rust-cache v2，key=`sidecar-shell` | 仅缓存 shell crate，不缓存 workspace crates |
| sccache | GHA 远程缓存 (`SCCACHE_GHA_ENABLED=on`) | 跨 job 共享编译结果 |

### 3.3 发布产物

- **便携版**：`dist/Codex-portable/`，包含 `Codex.exe`、可选 `WebView2Loader.dll`、`binaries/codex-app-server-*.exe`。无 NSIS/MSI 安装器（`bundle.targets = []`）。
- **CI artifact**：`Codex-Windows-Portable`，release 构建保留 90 天，fast 构建保留 7 天。
- 本地 `scripts/build.ps1` 同样输出到 `dist/`。

### 3.4 优化配置

`build-fast.yml` 通过环境变量覆盖 release profile：
- `CARGO_PROFILE_RELEASE_OPT_LEVEL=2`（平衡体积/速度）
- `CARGO_PROFILE_RELEASE_LTO=false`（加速构建）
- `CARGO_PROFILE_RELEASE_CODEGEN_UNITS=256`（并行代码生成）
- `CARGO_PROFILE_RELEASE_STRIP=symbols`（移除调试符号）
- `CARGO_INCREMENTAL=0`（CI 上关闭增量编译以获得更稳定的缓存）

## 4. 约束与规则

1. **Sidecar 必须存在**：`scripts/build.ps1` 在构建前检查 `src-tauri/binaries/codex-app-server-x86_64-pc-windows-msvc.exe`，不存在则直接抛错；`stage-dist.ps1` 同样要求该文件存在，否则报错。
2. **禁止浮动 Tauri 版本**：`Cargo.toml` 中 `tauri = { version = "=2.11.5" }` 使用精确版本，注释说明浮动解析曾导致 `tauri-runtime-wry` 不兼容编译错误。
3. **Release profile 必须在根 Cargo.toml 定义**：`src-tauri/Cargo.toml` 注释明确指出 Cargo 只识别根包的 `[profile.*]`，子包中的会被忽略。
4. **前端构建前先类型检查**：`npm run build` 先执行 `tsc --noEmit`，lint-check 工作流单独运行 `npm run typecheck`。
5. **WebView2 使用下载引导器**：`tauri.conf.json` 中 `webviewInstallMode.type = "downloadBootstrapper"`，安装时自动下载 WebView2。
6. **构建环境限定 Windows**：所有 workflow job 均运行在 `windows-latest`，目标 `x86_64-pc-windows-msvc`，不支持跨平台交叉编译。
7. **in-process 特性默认关闭**：`default = []`，CI 通过 `--no-default-features` 强制 shell-only 路径，防止误用内嵌编译模式。