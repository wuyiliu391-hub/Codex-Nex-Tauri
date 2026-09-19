---
kind: dependency_management
name: 多语言工作区依赖管理：Cargo workspace + npm lockfile + 预编译 sidecar
category: dependency_management
scope:
    - '**'
source_files:
    - Cargo.toml
    - src-tauri/Cargo.toml
    - frontend/package.json
    - .github/workflows/build-fast.yml
    - .github/workflows/build-release.yml
    - src-tauri/binaries/README.txt
---

## 1. 使用的系统与工具

本仓库是一个混合语言桌面应用，依赖管理按语言分层处理：

- **Rust 后端（Tauri shell）**：使用 Cargo workspace（根 `Cargo.toml` 声明 `members = ["src-tauri"]`），通过 `[workspace.dependencies]` 集中声明所有 crate 版本，子 crate `src-tauri/Cargo.toml` 仅引用名称而不重复版本号。工具链与目标由 CI 固定为 Rust 1.98.1、`x86_64-pc-windows-msvc`。
- **前端（React/Vite）**：使用 npm + `frontend/package-lock.json` 锁定依赖，CI 通过 `setup-node` 安装 Node 22 并缓存该 lockfile。
- **二进制 sidecar**：官方引擎 `codex-app-server-x86_64-pc-windows-msvc.exe` 不通过包管理器引入，而是以 GitHub Release tag（如 `rust-v0.154.0`）形式在 CI 中下载并放入 `src-tauri/binaries/`（gitignored），作为运行时 sidecar 被 Tauri 进程拉起。
- **构建工具**：`cargo-tauri` CLI 本身不通过 `cargo install` 安装，而是在 CI 中以固定版本（`TAURI_CLI_VERSION=2.11.4`）从 GitHub Releases 下载并缓存到 `.tools/`，再放到 PATH。

## 2. 关键文件

| 文件 | 作用 |
|---|---|
| `Cargo.toml`（根） | Workspace 定义、`[workspace.dependencies]` 集中版本、`[patch.crates-io]` 覆盖第三方 crate、自定义 profile |
| `src-tauri/Cargo.toml` | 实际 Tauri 包声明，直接 pin `tauri = "=2.11.5"`（注释说明为何不能浮动） |
| `frontend/package.json` | 前端依赖声明（react、@tauri-apps/api、vite 等） |
| `frontend/package-lock.json` | npm 依赖锁定文件，CI 缓存键 |
| `.github/workflows/build-fast.yml` / `build-release.yml` | 依赖安装与缓存策略（Node cache、rust-cache、sccache、sidecar 缓存） |
| `src-tauri/binaries/README.txt` | 说明该目录存放预编译 sidecar 二进制 |

## 3. 架构与约定

### 3.1 Rust 依赖
- **集中化版本管理**：根 `Cargo.toml` 的 `[workspace.dependencies]` 是单一事实来源，所有 crate 在此声明版本；`src-tauri/Cargo.toml` 仅写 `tauri = { version = "=2.11.5", ... }` 等短名引用。
- **Git 来源依赖**：部分 crate 来自 Git 而非 crates.io，包括 Microsoft MXC（`learning_mode_windows`、`wxc_common`、`appcontainer_common`）、Helix 的 `nucleo`、以及 `runfiles`。这些以 `rev = "..."` 精确 pin commit。
- **crates-io patch**：通过 `[patch.crates-io]` 将 `crossterm`、`tokio-tungstenite`、`tungstenite` 替换为 openai-oss-forks 的 fork 特定 commit，用于修复上游问题。
- **精确 pin 策略**：对关键 crate 使用 `=` 精确版本（如 `rmcp = "=3.2.0"`、`tree-sitter-powershell = "=0.26.4"`、`tikv-jemallocator = "=0.7.0"`、`v8 = "=150.4.0"`、`tar = "=0.4.45"`），避免语义化版本漂移导致的不兼容。
- **Workspace 级 lint/profile**：`[workspace.lints.clippy]` 统一启用大量 warn-level lint；`[profile.*]` 全部定义在根 `Cargo.toml`，子 crate 中的 profile 会被忽略（见 `src-tauri/Cargo.toml` 末尾注释）。
- **无 Cargo.lock**：仓库未提交 `Cargo.lock`，版本锁定依赖 CI 的 rust-cache 和 sccache 缓存实现可重现构建。

### 3.2 前端依赖
- 使用 npm 工作区外的独立 `package.json`，依赖量很小（仅 react、@tauri-apps/api、vite、typescript）。开发脚本通过 `scripts/check-frontend.mjs` 做静态检查。
- CI 使用 `npm ci --no-audit --no-fund` 严格基于 lockfile 安装，禁用网络审计与 fund 提示。

### 3.3 Sidecar 二进制
- 官方引擎作为外部 artifact 管理：通过环境变量 `CODEX_APP_SERVER_TAG=rust-v0.154.0` 指定 release tag，CI 步骤从 `https://github.com/openai/codex/releases/download/$tag/$name` 下载，校验大小 >10MB，然后缓存到 actions cache key `codex-app-server-${tag}-win-x64`。
- 本地开发时二进制位于 `src-tauri/binaries/`（gitignored），由开发者自行放置或通过脚本获取。

### 3.4 构建工具链
- `cargo-tauri` CLI 固定为 `2.11.4`，通过 GitHub Releases 下载 zip 解压到 `.tools/` 并加入 PATH，不使用 `cargo install` 或系统全局安装。
- Rust 工具链通过 `dtolnay/rust-toolchain@master` 固定为 `1.98.1`。
- 增量编译通过 `Swatinem/rust-cache@v2` 缓存 `target/`，并通过 `mozilla/sccache-action` 启用 sccache（`SCCACHE_GHA_ENABLED=on`）。

## 4. 约定与约束

- **Tauri 版本不得浮动**：`src-tauri/Cargo.toml` 中 `tauri = "=2.11.5"` 的注释明确说明“Bump deliberately, never float”，因为浮动的 `tauri-runtime-wry` 曾破坏构建。
- **Workspace 外配置无效**：子 crate 的 `[profile.*]` 会被 Cargo 忽略，必须放在根 `Cargo.toml`（注释明确警告）。
- **Sidecar 必须存在**：CI 在 `cargo tauri build` 前强制检查 `src-tauri/binaries/<name>.exe` 是否存在且大小 >10MB，否则失败。
- **默认特性关闭**：构建始终传递 `--no-default-features`，确保默认不包含 in-process 引擎编译路径。
- **私有注册表/代理**：仓库未配置 `.cargo/config.toml`、`CARGO_REGISTRIES`、`CRATES_IO_TOKEN`、`npm_config_registry` 等私有源配置，所有依赖均来自 crates.io、GitHub Releases 或公开 Git 仓库。
- **版本更新方式**：Rust 依赖通过编辑根 `Cargo.toml` 的 `[workspace.dependencies]` 集中升级；前端依赖通过 `npm update` 修改 `package.json` 与 `package-lock.json`；sidecar 通过更改 `CODEX_APP_SERVER_TAG` 环境变量升级。