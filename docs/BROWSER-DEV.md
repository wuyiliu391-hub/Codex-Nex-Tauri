# 浏览器调试模式（Browser Dev Bridge）

> 目标：不启动 Tauri 壳、不编译 Rust，直接在浏览器里调试前端。

## 原理

浏览器模式**不需要引擎**。自研内核是进程内的，浏览器里没有内核，因此
`dev:browser` 把 Tauri API 别名到 `frontend/app/devbridge/*`，用 TS 重放命令面：

```
浏览器 (React UI，零改动)
 ├─ invoke()  ──alias──▶ app/devbridge/tauri-core.ts → commands.ts
 │                         └─ 本地实现：内存会话 + localStorage 状态
 ├─ listen()  ──alias──▶ app/devbridge/tauri-event.ts → eventBus
 └─ （无 WS 代理：内核在进程内，浏览器模式直接模拟）
```

## 使用

```powershell
cd frontend
npm run dev:browser
```

打开 http://localhost:1420 。

## 与桌面端的差异（诚实清单）

浏览器模式是**调试辅助**，不是第二套实现。它重放命令面语义，但内核行为由 TS 模拟：

| 能力 | 桌面端（自研内核） | 浏览器模式 |
|---|---|---|
| 会话/回合/流式事件 | ✅ 真实内核 | ⚠️ TS 模拟（`devbridge/commands.ts`） |
| settings/preferences/pets/calendar | `shell-state.json` | localStorage（键见 `shellState.ts`） |
| 文件面板 list/read/write | 真实 FS（防穿越） | 内存虚拟 FS |
| 插件市场（git clone） | ✅ | ❌ 明确报错 |
| 原生对话框 | ✅ | ❌ 返回"取消" |
| 窗口控制/原生菜单 | ✅ | no-op |
| provider API key | 存壳 | 存 localStorage |

**浏览器模式的回合输出是模拟的**，不能用于验证真实内核行为。要验证内核，
用桌面端或 `invoke("kernel_selftest")`。

## 红线

- 前端只认 L3 命令面（同一批命令名/事件名/形状），**零改动**
- 桥做不到的事一律报错或如实降级，**不造假成功**
- 协议事实来源：`frontend/src/protocol/**` + `docs/official-ui/APPSERVER-METHOD-INVENTORY-*.md`

## 文件

| 文件 | 职责 |
|---|---|
| `frontend/app/devbridge/tauri-core.ts` | invoke 替身（alias 目标） |
| `frontend/app/devbridge/tauri-event.ts` | listen/emit 替身（alias 目标） |
| `frontend/app/devbridge/commands.ts` | 命令路由（本地实现） |
| `frontend/app/devbridge/shellState.ts` | shell-state.json 的 localStorage 镜像 |
| `frontend/app/devbridge/eventBus.ts` | Tauri 事件语义的极简实现 |
| `frontend/vite.config.ts` | `--mode browser`：alias 映射 |

## 限制

- 仅 dev 模式生效；`npm run dev` / `cargo tauri dev` / 生产构建不受影响
  （alias 挂在 `mode === "browser"` 下）
- localStorage 与桌面 `shell-state.json` 互不同步；清调试状态 = 清站点数据
- `dev:browser` 的构建产物不可用于打包（打包走 `npm run build` 默认模式）
