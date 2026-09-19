# 架构

> 一句话定位：**同一引擎协议上的自有桌面产品**——不是把官方桌面端 UI 搬进
> Tauri，而是用自研内核驱动自有前端。

## 1. 分层

```
┌──────────────────────────────────────────────────────────────┐
│ L4 展示层   frontend/app/**                                  │
│     React 19 组件、状态 store、事件桥                          │
│     职责：布局、渲染、用户操作入口                              │
└───────────────────────────┬──────────────────────────────────┘
                            │ invoke() / listen("codex:*")
┌───────────────────────────▼──────────────────────────────────┐
│ L3 产品 API  src-tauri/src/commands/**                        │
│     #[tauri::command] + Tauri 事件                            │
│     职责：本地 store 读写、内核转发                             │
│     前端唯一依赖面；缺口在此补齐，不在前端造假                   │
└───────────────────────────┬──────────────────────────────────┘
                            │ 直接函数调用（进程内）
┌───────────────────────────▼──────────────────────────────────┐
│ L2 内核  src-tauri/src/kernel/**                              │
│     protocol / session / provider / events / state            │
│     职责：会话状态机、turn 执行、流式事件、取消                  │
└───────────────────────────┬──────────────────────────────────┘
                            │
┌───────────────────────────▼──────────────────────────────────┐
│ L1 本地能力  src-tauri/src/state.rs                           │
│     shell-state.json：设置/偏好/宠物/日历/连接器/密钥           │
└──────────────────────────────────────────────────────────────┘
```

**L2 没有外部依赖。** 不存在引擎进程、端口或二进制解析——这是与旧 sidecar
架构最本质的区别。

## 2. 数据流

### 2.1 用户发送消息

```
输入框 (L4)
  → invoke("send_message", { sessionId, message })
    → commands::kernel::send_message            (L3)
      → KernelState::spawn_turn                 (L2)
        → SessionManager::begin_turn            ← 拒绝并发 turn
        → 返回 turnId，命令立即返回               ← UI 保持响应
        → 分离任务开始执行 turn
```

命令**立即返回**，输出通过事件异步到达。这是 UI 在流式输出期间保持可交互的原因。

### 2.2 流式输出

```
分离任务 → provider.stream(...)
  → 每个 chunk 回调
    → events::agent_message_delta(...)          (L2)
      → KernelEvent::emit()
        → app.emit("codex:item-agentMessage-delta", params)
          → 前端 listen → emitNotification      (L4)
            → reduceNotification → turnStore
              → TurnStream 重渲染
```

### 2.3 中断

```
用户点停止 → invoke("interrupt_session", { sessionId })
  → KernelState::interrupt
    → 取出该 turn 的 CancellationToken → cancel()
      → 分离任务内的 tokio::select! 走取消分支
        → turn 标记 Interrupted
        → 发出 turn/completed { status: "interrupted" }
```

取消是**协作式**的：provider 的 `stream` 在 `select!` 里与取消信号竞争，因此
中断能立即生效，不需要等待 provider 自己返回。

## 3. 契约（最容易出错的部分）

内核与前端之间有两个必须逐字一致的约定：

### 3.1 通道名转换

| 侧 | 实现 |
|---|---|
| 内核 | `kernel/protocol.rs::event_channel` |
| 前端 | `frontend/app/bridge/events.ts::tauriEventName` |

规则：`codex:{method}`，其中 `/` 和 `.` 都替换为 `-`。

```
turn/completed            → codex:turn-completed
item/agentMessage/delta   → codex:item-agentMessage-delta
thread/tokenUsage/updated → codex:thread-tokenUsage-updated
```

**两侧不一致 = UI 静默收不到任何事件**，且不报错。因此：
- 内核只有 `events.rs` 允许构造通道名
- `protocol.rs` 的测试断言了三个代表性转换
- `verify-protocol-usage.mjs` 在 CI 中校验所有协议字符串

### 3.2 通知方法必须存在于前端表

内核发出的每个方法都必须在
`frontend/src/protocol/notifications.ts`（83 项）中。否则前端 reducer 会记录
"No handler" 警告而非渲染。

`kernel/events.rs` 的测试逐项断言了 15 个发出方法的确切字符串。

### 3.3 载荷字段名

前端 reducer 同时接受 camelCase 和 snake_case
（`str(params, "itemId", "item_id")`），内核统一发 **camelCase**。

## 4. 并发规则

| 规则 | 位置 | 原因 |
|---|---|---|
| 每线程同时只有一个 turn | `SessionManager::begin_turn` | 两个并发 turn 的 delta 会交错进同一个 agent 块 |
| provider 调用串行化 | `KernelState::provider_gate` | 本地 provider 保序，测试确定性 |
| 取消令牌按 turn 存 | `KernelState::running` | 中断要能精确定位到具体 turn |

## 5. 线程安全

| 状态 | 保护方式 |
|---|---|
| `SessionManager.threads` | `RwLock<HashMap>` |
| `SessionManager.order` | `RwLock<Vec>`（保持插入序，避免同毫秒时间戳碰撞） |
| `KernelState.running` | `tokio::sync::Mutex`（异步上下文） |
| `KernelState.counters` | `RwLock<Counters>` |

锁中毒（poisoned）在 `SessionManager` 中转为 `SessionError::LockPoisoned`
而非 panic——命令层把它变成用户可见的错误字符串。

## 6. 错误处理

三层错误类型，边界处转换为 `String`（Tauri 命令的约定）：

```
ProviderError   → provider.rs    供应商/网络问题
SessionError    → session.rs     状态机问题（线程不存在、turn 冲突）
String          → commands/**    Tauri 边界
```

**不伪造成功**：未实现的能力返回

```json
{ "ok": false, "status": "not-wired", "command": "...", "detail": "..." }
```

而不是空列表或 `ok: true`。前端据此可以显示真实信息。

## 7. 与旧 sidecar 架构的对照

| 维度 | 旧（sidecar） | 新（自研内核） |
|---|---|---|
| 引擎形态 | 307 MB 外部 exe | 编译进壳，单一 exe |
| 传输 | WebSocket :17457 | 进程内函数调用 |
| 鉴权 | 无（回环端口） | 不适用（无端口） |
| 崩溃恢复 | 无监控，不重启 | 不适用（同进程） |
| 冷启动 | 竞态双连接 | 不适用 |
| 死连接 | 挂满 120 秒 | 不适用 |
| 中断 | 依赖引擎支持 | 协作式取消，立即生效 |
| 引擎升级 | 下载新 exe | 改代码重新编译 |
| 能力面 | 官方 60+ 方法 | 按需实现，未实现显式声明 |

## 8. 未实现的能力（诚实清单）

| 能力 | 说明 |
|---|---|
| 真实模型调用 | 需实现 `ModelProvider` 的 HTTP 版本；`codex/adapter.rs` 已备好协议转换 |
| 持久化 | 当前仅内存；`SessionManager` 的接口已为落盘预留 |
| 工具执行 | 文件读写、命令执行、sandbox |
| 审批流 | 前端 `ApprovalCard`/`UserInputCard` 已就绪，内核未触发 |
| MCP / 插件 / 技能 | 仅存储配置，不加载执行 |
| 多模态输入 | 附件目前只传递路径 |

## 9. 相关文档

| 文档 | 内容 |
|---|---|
| [README.md](../README.md) | 项目入口、构建、CI |
| [docs/provider-setup.md](./provider-setup.md) | 自定义供应商配置 |
| [docs/BROWSER-DEV.md](./BROWSER-DEV.md) | 浏览器调试模式 |
| [docs/official-ui/](./official-ui/) | 官方 UI 逆向语料与方法清单 |
| [docs/uia/](./uia/) | UIA 遍历记录（19 个设置页） |
| [docs/compose/change-notes/](./compose/change-notes/) | 历史变更记录 |
