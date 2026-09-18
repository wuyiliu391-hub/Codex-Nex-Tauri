# Codex UIA Traversal Log — T24–T25：设置 19 Tab 全覆盖（2026-09-16）

> 工具链：`uia-act -Quiet` 批量点击 + `uia-compact.ps1` 内容区提取（跳 Image/匿名 Pane，保留 tog/exp/val/OFF/DIS/SEL）。
> T19c（常规）见 `TRAVERSAL-T15-T23.md`；账户 tab 为死控件（见该文档 T22）。

## 全表
| Tab | 节点 | 内容摘要 | JSON |
|---|---|---|---|
| 常规 | 160 | 权限/完整访问/文件夹/终端/Shell/语言/底部面板/建议/许可证/插件/编辑器/上下文/发送键/排队-引导/弹窗/通知×3/彩纸 | `*-t19c-settings.json` |
| 导入 | 96 | 自动同步（保持导入同步 Off，同步已暂停；自定义下拉 DIS）；从其他 AI 应用导入（未找到设置，导入 DIS） | `*-t24a-import.json` |
| 外观 | 214 | 主题 Radio（系统/浅色/深色）+ ThemeConfig 代码预览；浅/深主题组（导入/复制/代码主题/强调色/背景#FFF/#181818/前景/3 字体下拉+样式/对比度滑杆 45/60）；偏好：指针光标/动态效果三选/字号 Spinner 14+13/差异标记颜色±对 | `*-t24b-appear.json` |
| 语音 | 111 | 麦克风下拉（系统默认）；语音聊天不可用（账户/工作空间无权——API Key 登录无语音）；听写（按住/切换快捷键捕获钮/词典 Edit+增删/最近录音说明） | `*-t24c-voice.json` |
| 配置 | 126 | 用户配置下拉 + 打开 config.toml；批准策略（按请求）/沙盒（只读）/网页搜索/输出详细程度/推理摘要下拉；模型功能（已选 5 强度 multi-select，Ultra 开关 Off+DIS）；工作空间依赖项（启用 On/诊断/重装/版本 26.905.11957） | `*-t24d-config.json` |
| 个性化 | 101 | Codex 说明 Edit（#personal-agents-editor，保存 DIS）+ agents.md 文档链；记忆（本地记忆 Off/工具辅助记忆 On+DIS/删除） | `*-t24e-personal.json` |
| 宠物 | 121 | Alt+Win+P 说明 + 显示虚拟宠物；自定义下拉；刷新/创建；10 宠物 toggle 单选（Codex=On，其余 Off：迷你/Dewey/Fireball/Hoots/Rocky/Seedy/Stacky/BSOD/Null Signal） | `*-t24f-pet.json` |
| 键盘快捷键 | 1171 | 搜索 Edit + 快捷键搜索捕获开关；行模式=label/desc/Group>和弦 Group>Text+更改/清除钮（例：新聊天 Ctrl+N/Ctrl+Shift+O，临时聊天 Ctrl+Shift+N…全文存 JSON） | `*-t24g-kbd.json` |
| 电脑操控 | 102 | Computer Use 总开关 On；Chrome/Edge 扩展安装钮；Excel 实时控制 On；始终允许的应用（暂无） | `*-t25a-cua.json` |
| 应用快照 | 96 | 快捷键下拉（Alt+Alt）/发送目标下拉（自动）/音效开关 On/媒体组 DIS | `*-t25b-snap.json` |
| 插件 | 117 | 浏览目录/添加下拉；tab 插件 7(On)/MCP 1(Off)；7 插件行×启用开关 On（Documents/PDF/Spreadsheets/Presentations/Template Creator/Computer Use/Visualize） | `*-t25c-plugins.json` |
| 浏览器 | 160 | Browser 总开关 On；链接/本地 URL 打开位置下拉；完整网址 Off；清除/管理组；WebMCP On；站点权限 Table（网站/浏览/下载/上传/操作+默认行下拉）；完整 CDP 开关 Off（风险警告） | `*-t25d-browser.json` |
| 钩子 | 90 | 空态（未找到钩子，重载 DIS）+ hooks 文档链 | `*-t25e-hooks.json` |
| 连接 | 88 | 仅 SSH（来自此电脑的 SSH 连接 + 添加）——**无供应商/API 配置 UI，供应商只能改 config.toml** | `*-t25f-connect.json` |
| Git | 114 | 分支前缀 Edit（codex/）；PR 合并 radio 对（合并 On/压缩 Off）；强制推送 Off；草稿 PR On；审查呈现 radio 对（内联 On/单独 Off）；自动合并监控 + 三个说明 Edit | `*-t25g-git.json` |
| 环境 | 90 | 空态（添加项目×2）+ local-environments 文档链 | `*-t25h-env.json` |
| Worktrees | 100 | 根目录 Edit；取上游更新 Off；自动删除 On；限制 Spinner=15；空列表 + 刷新 | `*-t25i-worktree.json` |
| 已归档的聊天 | 85 | 空态（暂无已归档的聊天） | `*-t25j-archived.json` |
| 账户 | — | **死控件**：Invoke×2/真点击/Focus+Enter 均无响应；认证态改读个人资料菜单（已通过 API 密钥登录） | — |

## 与 config.toml 交叉验证（%USERPROFILE%\.codex\config.toml）
- UIA 字号 Spinner 14/13 = `sansFontSize=14/codeFontSize=13`；排队-引导 = `followUpQueueMode="steer"`；模型 `gpt-6-astra` + `model_reasoning_effort="xhigh"` = 滑杆第 4 档"极高" ✓
- node_repl MCP 行 = `[mcp_servers.node_repl]` ✓；插件数差异：config 启用 9（含 browser/unified-computer-use），UIA 插件 tab 列 7——待确认计数口径
- `打开 config.toml` 按钮证明 App 与 CLI 同源配置文件

## 组件模式增补（还原用）
- Radio 组：Group name + RadioButton×N + 配对 Text；三态选择：一组 toggle Button（系统/开启/关闭；合并/压缩合并；内联/单独；颜色/±）
- 权限表：Table > DataItem 行 > DataItem 列（含列 aid：browser-use-site-permissions-column-*）+ 单元格内 radix 下拉
- 快捷键行：label + desc + Group(chord) > Group > Text 和弦 + 更改/清除（或"为 X 设置快捷键"当未分配）
- 快捷键捕获钮：`为 <name> 设置快捷键` Button（语音/弹窗页同构）
- 空态页：heading + 1~2 说明 Text + 主操作 Button（+ 可选文档 Hyperlink）
- Spinner：val=数值；Slider：val=数值 + 配对数值 Text
