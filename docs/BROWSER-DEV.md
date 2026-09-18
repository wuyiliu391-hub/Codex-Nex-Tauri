# 浏览器调试模式（Browser Dev Bridge）

> 目标：不启动 Tauri 壳、不编译 Rust，直接在浏览器里跑**完整接线的真实引擎**调试前端。
> 灵感来自 codex-mobile-514（codexapp：Node 代理 app-server + 纯 Web UI）；
> 我们更简单——引擎本身已提供 `ws://127.0.0.1:17457` JSON-RPC，只缺一层
> `invoke/listen` 的 TS 替身和一个去 Origin 的 WS 代理。

## 为什么需要代理

官方 app-server 的 WS 监听器会**拒绝一切带 `Origin` 头的升级请求**
（`transport/websocket.rs::reject_requests_with_origin_header`），而浏览器发起
WebSocket 必然携带 Origin。因此浏览器不能直连引擎，必须经 vite dev server
转发（`/appserver` 路径，服务端出站连接不带 Origin）。

## 架构

```
浏览器 (React UI，零改动)
 ├─ invoke()  ──alias──▶ app/devbridge/tauri-core.ts → commands.ts
 │                         ├─ 引擎转发：真实 JSON-RPC（thread/turn/config/…）
 │                         └─ 本地能力：localStorage 版 shell-state.json
 ├─ listen()  ──alias──▶ app/devbridge/tauri-event.ts → eventBus
 │                            ▲
 └─ ws://localhost:1420/appserver ──vite 插件（去 Origin）──▶ ws://127.0.0.1:17457（官方引擎）
```

握手、方法名、响应形状归一化与 Rust 壳逐一对齐（`client.rs` /
`commands/engine.rs` / `events.rs`），所以 `bridge/events.ts` 的 83 条通知通道、
审批卡、回合流渲染全部原样工作。

## 使用

```powershell
# 一键：拉起引擎（若 17457 未监听）+ vite bridge 模式
.\scripts\dev-browser.ps1

# 或手动两步：
# 1) 引擎（两种形态均可，端口可用 CODEX_APP_SERVER_WS 改）
src-tauri\binaries\codex-app-server-x86_64-pc-windows-msvc.exe --listen ws://127.0.0.1:17457
# 2) 前端
cd frontend; npm run dev:browser
```

打开 http://localhost:1420 。控制台会打印
`[ws-proxy] /appserver → ws://127.0.0.1:17457` 与
`[devbridge] engine handshake complete`。

常用参数（URL query）：`?engine=ws://otherhost:port` 可临时改引擎地址。

## 模式差异（诚实清单）

| 能力 | 桌面壳 | 浏览器模式 |
|---|---|---|
| 会话/回合/审批/流式事件/历史还原 | ✅ | ✅ 真实引擎，行为一致 |
| settings/preferences/pets/calendar/定时任务/PR | shell-state.json | localStorage（键 `codex-desktop-browser-dev:shell-state`，结构相同） |
| 配置读写（providers/MCP/skills/plugins） | ✅ | ✅ 真实 `config/*` RPC，写的是引擎的 config.toml |
| provider API key | 存壳 + env 注入子进程 | 存 localStorage + 真实写 config 叶键；**无法注入引擎进程环境**（返回值 note 已声明） |
| probe_provider | reqwest 直连 | fetch 直连，多数网关会被 CORS 拒 → 如实显示失败 |
| 文件面板 list/read/write | 真实 FS（防穿越） | 内存虚拟 FS（本会话内 write→read 一致） |
| 插件市场（git clone 安装） | ✅ | ❌ 明确报错，不装死 |
| 原生对话框（选目录/附件） | ✅ | ❌ 返回"取消"（附件/换项目按钮不可用） |
| 窗口控制/菜单原生事件 | ✅ | no-op（无边框自绘 UI 正常） |
| 桌面通知、系统集成终端 | 部分 stub | 同 stub |

## 红线不变

本桥只是**把 Rust 壳的既有语义在 TS 里重放**，不是第二套业务逻辑：
- 前端依旧只认 L3 命令面（同一批命令名/事件名/形状），零改动
- 桥做不到的事一律报错或如实降级，**不造假成功**（ARCHITECTURE 硬规则）
- 引擎协议事实来源仍是 `docs/RUST_BACKEND.md` + 官方 generate-ts

## 文件

| 文件 | 职责 |
|---|---|
| `frontend/app/devbridge/tauri-core.ts` | invoke 替身（alias 目标） |
| `frontend/app/devbridge/tauri-event.ts` | listen/emit 替身（alias 目标） |
| `frontend/app/devbridge/commands.ts` | 74+3 命令路由（engine 转发/local store/plugin 回退） |
| `frontend/app/devbridge/rpcClient.ts` | WS JSON-RPC 客户端（握手/超时/重连/事件扇出） |
| `frontend/app/devbridge/shellState.ts` | shell-state.json 的 localStorage 镜像（默认值同 state.rs） |
| `frontend/app/devbridge/eventBus.ts` | Tauri 事件语义的极简实现 |
| `frontend/vite.config.ts` | `--mode browser`：alias + `/appserver` WS 代理 |
| `scripts/dev-browser.ps1` | 一键拉起引擎 + vite |

## 限制与注意

- 仅 dev 模式生效；`npm run dev` / `cargo tauri dev` / 生产构建完全不受影响
  （alias 与代理都挂在 `mode === "browser"` 下）
- 引擎 WS 无鉴权（桌面壳文档已记录该权衡）——浏览器模式沿用，别把
  1420 端口暴露到不可信网络
- localStorage 与桌面 shell-state.json 互不同步；清调试状态 = 清站点数据
- `dev:browser` 的构建产物不可用于打包（打包走 `npm run build` 默认模式）
