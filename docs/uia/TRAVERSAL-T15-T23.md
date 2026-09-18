# Codex UIA Traversal Log — T15–T23（2026-09-16）

> 方法：仅 Windows UIA（`scripts/uia-act.ps1`），无截图/无图像识别/无像素对比。
> 基线指纹：home = **81 nodes / 221131 bytes**（`t22k-home` 回归一致）。

## 基线（home）
- 窗口 `ChatGPT`（Chrome_WidgetWin_1，849x600），Document `app://-/index.html`
- 左栏：导航（新对话/搜索/定时任务/PR/…）+ 项目列表；中央：composer（Edit + 发送 + 模型触发器 `6 Astra 极高` + 附件等）；MenuBar 文件/编辑/视图/帮助

## 分腿记录
| 腿 | 动作 | 节点 | 结论 | JSON |
|---|---|---|---|---|
| T15 | 定时任务/PR/新对话/返回应用 | 81↔~90 | 导航页往返正常 | `*-t15*.json` |
| T17/T17r/T17r2 | Alt+T（3 次，干净基线） | 81 不变 | **无通知时 Alt+T 是 no-op**；`通知 alt+T` Group 为空 live-region 占位 | `*-t17r*.json` |
| T19 | profile→设置 | 157→160 | 设置壳 + 常规 tab 全量结构（见下） | `*-t19c-settings.json` |
| T19b | palette 打 `MCP 服务器`（键盘路径） | 99 | MCP 设置页：tab 插件 7/MCP 1，node_repl 启用 | `*-t19bk4-enter.json`, `*-t19b3-mcp.json` |
| T19b1-3 | palette ListItem Invoke | 81 | **Invoke 抛`不支持的模式`**（cmdk 重渲染导致句柄过期），改键盘路径 | `*-t19b2-palette.json` |
| T20/T20d | 模型滑杆：Focus 强度 + ←/→ | 92/94 | **5 档：6 Astra 轻度/标准/深度/极高/Ultra**；播报 `X，第 N 项，共 5 项。`；触发器上按方向键是安全 no-op | `*-t20d-{1,2,3,5,restore}.json` |
| T21 | 显示/隐藏侧边面板 Toggle | 81→~110→81 | 右工作空间面板 320px（resize Thumb val=320，全屏显示，浏览器/终端卡片）；composer 被压缩，触发器名截断为 `6 Astra` | `*-t21-rightpanel.json` |
| T22 | 设置 tab 遍历 | 160/214 | **账户 tab 是死控件**（Invoke×2/真鼠标点击/Focus+Enter 均无响应）；外观页正常（214n，Radio×3/Slider×2/Spinner×2/Edit×5） | `*-t22{c,d,h,i,j}*.json` |
| T23 | 个人资料菜单展开 | 92 | 4 项：`已通过 API 密钥登录`(DIS 状态位)/显示宠物/设置/退出登录。**认证态 = API Key 登录** | `*-t23a-profile.json` |

## 设置页结构（T19c，160n）
- 导航：返回应用 Hyperlink + `#settings-search` Edit + 个人（常规/导入/外观/语音/配置/个性化/宠物/键盘快捷键/账户）+ 集成（电脑操控/应用快照/插件/浏览器）+ 编码（钩子/连接/Git/环境/Worktrees，首屏外 OFF）+ 已归档（已归档的聊天）
- 常规 tab 行模式：section Text + label + desc + control；Toggle=Button[32x21] tog；下拉=Button exp + radix id；跟进处理方式=排队/引导 toggle 对；完整访问行外链 sandboxing 文档
- 激活态标记：`text-codex-icon-active`（常规按钮图标类）
- 设置内搜索：SetValue 过滤导航（内容行匹配），出现`清除设置搜索`按钮

## 命令面板（cmdk）解剖
- Window `命令菜单` > ComboBox（val=过滤词）+ List `Suggestions` > Group/section（聊天/设置）> ListItem
- 过滤 `mcp`：56 项 → 1 项（`MCP 服务器，设置`）
- **IME 干扰**：SendKeys 中文/拼音会弹 `CiceroUIWndFrame`，首个 Enter 被组字吞掉——文本输入后永远多发一次 Enter；Edit 探针优先 SetValue
- ListItem 不要 Invoke（过期句柄），用 过滤→Enter 键盘路径

## 模型滑杆（T20d 精确数据）
| 档位 | 播报名 | 备注 |
|---|---|---|
| 1/5 | 6 Astra 轻度 | 最左 |
| 2/5 | 6 Astra 标准 | |
| 3/5 | 6 Astra 深度 | |
| 4/5 | 6 Astra 极高 | **用户当前值**（遍历后已复位） |
| 5/5 | 6 Astra Ultra | 最右 |
- 结构：Menu `6 Astra 极高` > ViewTrack Group > MenuItem 选择模型/重置为默认 + KeyboardAnnouncement StatusBar + `使用左右方向键调整强度` + MenuItem 强度 > slider Root Group
- 操作法：Expand 触发器 → Focus `强度` → ←/→（跨 run 焦点保持）→ 读 StatusBar 播报
- 还原后验证：ESC 关菜单，触发器名恢复 `6 Astra 极高`，81n 基线

## 已知坑 / 死路
1. `-Ct` 过滤曾因 `$ct`/`$Ct` 大小写不敏感冲突恒真——已修（局部变量改名 `$ctName`）。
2. palette ListItem Invoke 不可靠；设置 ListItem 同理优先键盘。
3. 单次 batch 最多 1 个全量 outline，多 outline 会截断；其余用 `-OutlineMatch` / summary。
4. 右面板开时触发器 UIA 名被椭圆化（`6 Astra 极高`→`6 Astra`）——按名匹配用前缀正则。
5. **账户 tab 死控件**：4 种激活方式全试过；账户信息改从个人资料菜单状态位读（`已通过 API 密钥登录`）。
6. asar 里搜模型名无用（minified 单行 bundle）；UIA 播报是正道。
7. Alt+T 通知面需真实 turn/审批事件才能物化——发真实消息需用户明确授权（耗 quota、执行工具）。

## 脚本（`scripts/uia-act.ps1`）
- 动词：Expand/Collapse/Invoke/Toggle/SetValue/Focus/**Click（真鼠标，GetClickablePoint→SetCursorPos+mouse_event，已加前台化）**
- `-Keys` SendKeys（`{LEFT}`/`{ENTER}`/`{ESC}`/`^,` 等）；`-OutlineMatch` 正则裁剪；`-DumpTag` 落盘 `docs/uia/uia-tree-<ts>-<tag>.json`
- `uia-wake-a11y.ps1 -Mode Get/Set/Restore`：SPI 屏幕阅读器标志（遍历需=1，收尾已 Restore=0）

## 禁区（永不执行）
注销/退出登录/关闭窗口/新建窗口/创建项目确认；发送真实消息；composer SetValue 探针后必须清空。
