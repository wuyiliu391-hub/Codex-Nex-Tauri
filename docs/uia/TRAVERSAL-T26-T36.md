# Codex 真实 Turn 动态流逆向 — T26–T36（2026-09-16）

> 供应商：RabbitAPI（`deepseek-v4-flash`，Responses wire）；项目 hello；共 6 个真实 turn（1 失败 + 5 成功/半成功）。

## 结论（先说）
1. **官方无提权弹窗/通知申请**：沙箱拒绝 → 模型在对话文字里说明/询问 → 用户改预设。6 个 turn + locale 静态检索（65 个 json，approval/批准零命中）均无审批卡/弹窗。
2. **权限 = 事先预设**：composer `更改权限`（请求批准/帮我批准）+ 设置（批准策略 2 档/沙盒/完整访问开关）。
3. **通知 = OS Toast**：轮次完成走 `notify` hook（codex-computer-use.exe turn-ended）；Alt+T 在 5 次测试（含后台完成）中恒为 no-op，通知中心无应用内实体。

## Turn 事件 → UI 映射（成功路径，以 t29 为准）
| 阶段 | UIA 表现 |
|---|---|
| 发送 | 用户气泡（`你说：`+ 文本 + 时间 + 复制消息）；`发送`→`停止`；composer 清空 |
| 推理 | `已处理 N秒`（计时增长：22秒→1分25秒→2分）；`正在思考`；`ChatGPT 说：`+ StatusBar（`回复：…`/`回复已开始`） |
| 流式文本 | **逐词 Text 节点**（`我先/查看/当前…`），结束合并为整句 Text |
| 工具执行中 | Button `正在运行 <cmd>`（exp=Collapsed）+ 同名 Text 回声 |
| 工具完成 | 标题变为 `已在 Ns 内运行 <cmd>`，终态再变为 `已运行 <cmd>` |
| 工具卡展开 | `命令已在 Ns 内运行完成` + Text `Shell` + Button `$ <cmd>` + 复制 + **整块 stdout 单 Text**（含换行）+ 复制 + Text `成功` |
| 富文本 | markdown 列表 = List>ListItem；代码块 = 逐行 Text + `启用自动换行` toggle + 复制；行内链接 = Hyperlink |
| 推理摘要 | xhigh 时推理英文摘要以 Text 泄入树（多为 OFF，偶可见） |
| 重试 | `正在重新连接 N/5`（Button + Text + Group数字 + /5）；**耗尽/恢复后残留冻结在流中**（多个 turn 均见 1/5 残留） |
| 错误卡 | Text 错误串 + Hyperlink（平台 key 页/请求 URL）+ cf-ray/request id 文本；`停止`→`发送`；用户气泡加`编辑消息` |
| Turn 结束 | `用时 X分Y秒` + 末条回复（分段 Text）+ 复制 + `从这里创建聊天分支` + 时间；`发送`恢复 |
| 滚动 | 流式中出现 `滚动到底部` FAB |

## 权限/审批实测矩阵
| # | 动作 | 结果 | 审批卡？ |
|---|---|---|---|
| t29 | 工作区内 list + 写文件 | 成功（3 命令） | 无（自动放行） |
| t31 | 读 C:\Windows\…\hosts | 成功直读 | 无（读不设防） |
| t32 | 写 C:\Temp | 模型文字拒绝（"不允许请求提权"，反问改写工作区） | 无 |
| t34 | curl example.com | 沙箱内执行失败，文字汇报（"审批策略不允许请求网络升级权限"） | 无 |
| t35 | 强令写 C:\Temp | **命令真执行**，沙箱 Access denied，文字汇报失败 | 无（拒绝即终态） |

- 批准策略下拉仅 2 项：`按请求 Ask when escalation is requested` / `从不请求审批`（t33e）。
- composer 权限菜单（t36-perm3）：`应如何批准 ChatGPT 操作？`+ 了解更多 + `请求批准（外部文件+互联网始终询问）` / `帮我批准（仅风险操作询问）`——"询问" = 模型在文字里问。
- `更改权限` 按钮 Expand/Click 均 no-op（字节一致），Invoke 报不支持模式却把菜单打开了（待复核手势语义）。

## 供应商配置血泪（已同步 provider-setup.md）
- `model_provider` 必须顶层：append 到 `[projects]` 表后变野 key，静默回落 openai（401/超时）。
- `-exp` 模型推理端 404（path 级），`deepseek-v4-flash` 可用；网关 chat/completions 同 404，仅 responses。
- `deepseek-v4-flash` 不支持原生 web_search → 设置→配置→网页搜索→已禁用（写 `web_search="disabled"`）。
- 0.154 移除了 `wire_api="chat"`；CLI `provider: rabbit` + `ROUTE_OK` 为 E2E 金标准。
- 桌面端不读错配置：之前 401 是野 key 回落 openai 所致，非前端覆盖（更正 T27 结论）。

## 还原含义（Tauri）
- 不做审批弹窗组件；权限面 = composer 两档菜单 + 设置页（批准策略/沙盒/完整访问/UIA 已有）。
- Turn 流组件清单：已处理计时器/逐词流 Text/工具卡（3 态标题+展开结构）/成功文本/用时 footer/分支按钮/重连条（含冻结残留）/错误卡/滚动到底部。
- 通知：只调 OS toast（notify hook 语义），Alt+T 中心按空占位还原。
- 颜色（成功绿等）UIA 不可见，还原时按常规语义着色并标注待视觉确认。
