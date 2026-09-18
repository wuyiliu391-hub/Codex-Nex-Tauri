/**
 * Official Codex desktop keyboard-shortcut catalog (v26.911, zh capture).
 *
 * Generated from docs/uia/outlines-t41/shortcuts.txt (Windows UIA capture t41)
 * by a throwaway parser — do not edit by hand, regenerate instead.
 *
 * Labels/descriptions are the official zh strings captured from the official
 * build; they render as-is for every UI language because only a zh capture
 * exists (the official zh build shows exactly these strings).
 */

export interface ShortcutCatalogRow {
  /** Official row label, e.g. 新聊天. */
  name: string;
  /** Official row description, e.g. 开始新聊天. */
  desc: string;
  /** Chord labels as the official page displays them, e.g. Ctrl+N, Mouse Back, 未分配. */
  chords: string[];
}

export const SHORTCUTS_CATALOG: readonly ShortcutCatalogRow[] = [
  {
    "name": "新聊天",
    "desc": "开始新聊天",
    "chords": [
      "Ctrl+N",
      "Ctrl+Shift+O"
    ]
  },
  {
    "name": "新建临时聊天",
    "desc": "开始聊天，此聊天不会显示在历史记录中",
    "chords": [
      "Ctrl+Shift+N"
    ]
  },
  {
    "name": "快速聊天",
    "desc": "在快速编辑器中开始轻量聊天",
    "chords": [
      "Ctrl+Alt+N"
    ]
  },
  {
    "name": "归档聊天",
    "desc": "归档当前聊天",
    "chords": [
      "Ctrl+Shift+A"
    ]
  },
  {
    "name": "新建独立聊天",
    "desc": "在项目外开始新聊天",
    "chords": [
      "Ctrl+Alt+O"
    ]
  },
  {
    "name": "打开侧边聊天",
    "desc": "在侧边聊天中打开当前聊天",
    "chords": [
      "Ctrl+Alt+S"
    ]
  },
  {
    "name": "标记为未读",
    "desc": "将当前聊天标记为未读",
    "chords": [
      "Ctrl+Shift+U"
    ]
  },
  {
    "name": "在新窗口中打开",
    "desc": "在新窗口中打开当前聊天",
    "chords": [
      "未分配"
    ]
  },
  {
    "name": "切换置顶状态",
    "desc": "置顶或取消置顶当前聊天",
    "chords": [
      "Ctrl+Alt+P"
    ]
  },
  {
    "name": "聚焦浏览器地址栏",
    "desc": "聚焦应用内浏览器地址栏",
    "chords": [
      "Ctrl+L"
    ]
  },
  {
    "name": "聚焦主聊天输入框",
    "desc": "将键盘焦点移至主聊天输入框",
    "chords": [
      "未分配"
    ]
  },
  {
    "name": "聚焦侧边聊天",
    "desc": "将键盘焦点移至已打开的侧边聊天输入框",
    "chords": [
      "未分配"
    ]
  },
  {
    "name": "转到行",
    "desc": "转到当前文件中的某一行",
    "chords": [
      "Ctrl+L"
    ]
  },
  {
    "name": "返回",
    "desc": "在导航历史记录中返回",
    "chords": [
      "Ctrl+[",
      "Mouse Back"
    ]
  },
  {
    "name": "前进",
    "desc": "在导航历史记录中前进",
    "chords": [
      "Ctrl+]",
      "Mouse Forward"
    ]
  },
  {
    "name": "下一个最近查看的聊天",
    "desc": "切换到下一个最近已查看的聊天",
    "chords": [
      "Ctrl+Tab"
    ]
  },
  {
    "name": "下一个标签页",
    "desc": "切换到下一个标签页",
    "chords": [
      "Ctrl+Tab",
      "Ctrl+Shift+]",
      "Ctrl+PageDown"
    ]
  },
  {
    "name": "下一个聊天",
    "desc": "切换到下一个聊天",
    "chords": [
      "Ctrl+Shift+]",
      "Ctrl+PageDown"
    ]
  },
  {
    "name": "下一个需关注的聊天",
    "desc": "切换到下一个等待输入或有未读活动的聊天",
    "chords": [
      "Ctrl+Alt+A"
    ]
  },
  {
    "name": "上一个最近查看的聊天",
    "desc": "切换到上一个最近已查看的聊天",
    "chords": [
      "Ctrl+Shift+Tab"
    ]
  },
  {
    "name": "上一个标签页",
    "desc": "切换到上一个标签页",
    "chords": [
      "Ctrl+Shift+Tab",
      "Ctrl+Shift+[",
      "Ctrl+PageUp"
    ]
  },
  {
    "name": "上一个聊天",
    "desc": "切换到上一个聊天",
    "chords": [
      "Ctrl+Shift+[",
      "Ctrl+PageUp"
    ]
  },
  {
    "name": "转到最近聊天 1",
    "desc": "打开此快捷槽位中最近更新的聊天",
    "chords": [
      "Ctrl+Alt+1"
    ]
  },
  {
    "name": "转到最近聊天 2",
    "desc": "打开此快捷槽位中最近更新的聊天",
    "chords": [
      "Ctrl+Alt+2"
    ]
  },
  {
    "name": "转到最近聊天 3",
    "desc": "打开此快捷槽位中最近更新的聊天",
    "chords": [
      "Ctrl+Alt+3"
    ]
  },
  {
    "name": "转到最近聊天 4",
    "desc": "打开此快捷槽位中最近更新的聊天",
    "chords": [
      "Ctrl+Alt+4"
    ]
  },
  {
    "name": "转到最近聊天 5",
    "desc": "打开此快捷槽位中最近更新的聊天",
    "chords": [
      "Ctrl+Alt+5"
    ]
  },
  {
    "name": "转到最近聊天 6",
    "desc": "打开此快捷槽位中最近更新的聊天",
    "chords": [
      "Ctrl+Alt+6"
    ]
  },
  {
    "name": "切换聊天…",
    "desc": "搜索并切换到聊天",
    "chords": [
      "未分配"
    ]
  },
  {
    "name": "切换到工作",
    "desc": "切换到工作",
    "chords": [
      "Alt+2"
    ]
  },
  {
    "name": "切换到 Codex",
    "desc": "切换到 Codex",
    "chords": [
      "Alt+3"
    ]
  },
  {
    "name": "切换活动视图",
    "desc": "开启或关闭侧边栏活动视图",
    "chords": [
      "Ctrl+Alt+U"
    ]
  },
  {
    "name": "打开浏览器标签页",
    "desc": "打开新浏览器标签页",
    "chords": [
      "Ctrl+T"
    ]
  },
  {
    "name": "在默认浏览器中打开网页链接",
    "desc": "按住指定按键并点击网页链接，即可在系统默认浏览器中打开该链接",
    "chords": [
      "未分配"
    ]
  },
  {
    "name": "打开审查选项卡",
    "desc": "打开“审阅”选项卡",
    "chords": [
      "Ctrl+Shift+G"
    ]
  },
  {
    "name": "重新打开已关闭的标签页",
    "desc": "重新打开最近关闭的标签页",
    "chords": [
      "Ctrl+Shift+T"
    ]
  },
  {
    "name": "显示/隐藏浏览器面板",
    "desc": "显示或隐藏浏览器面板",
    "chords": [
      "Ctrl+Shift+B"
    ]
  },
  {
    "name": "切换底部面板",
    "desc": "显示或隐藏底部面板",
    "chords": [
      "Ctrl+J"
    ]
  },
  {
    "name": "切换置顶摘要",
    "desc": "显示或隐藏已固定的摘要",
    "chords": [
      "未分配"
    ]
  },
  {
    "name": "切换审阅",
    "desc": "显示或隐藏当前 Git 支持的聊天中的“审阅”",
    "chords": [
      "未分配"
    ]
  },
  {
    "name": "切换侧边栏",
    "desc": "显示或隐藏侧边栏",
    "chords": [
      "Ctrl+B"
    ]
  },
  {
    "name": "切换审阅面板",
    "desc": "显示或隐藏当前聊天的审阅",
    "chords": [
      "Ctrl+Alt+B"
    ]
  },
  {
    "name": "打开终端",
    "desc": "打开终端面板",
    "chords": [
      "Ctrl+`"
    ]
  },
  {
    "name": "环境操作 1",
    "desc": "执行此快捷槽位中的环境操作",
    "chords": [
      "Shift+Win+D"
    ]
  },
  {
    "name": "环境操作 2",
    "desc": "执行此快捷槽位中的环境操作",
    "chords": [
      "未分配"
    ]
  },
  {
    "name": "环境操作 3",
    "desc": "执行此快捷槽位中的环境操作",
    "chords": [
      "未分配"
    ]
  },
  {
    "name": "环境操作 4",
    "desc": "执行此快捷槽位中的环境操作",
    "chords": [
      "未分配"
    ]
  },
  {
    "name": "环境操作 5",
    "desc": "执行此快捷槽位中的环境操作",
    "chords": [
      "未分配"
    ]
  },
  {
    "name": "环境操作 6",
    "desc": "执行此快捷槽位中的环境操作",
    "chords": [
      "未分配"
    ]
  },
  {
    "name": "环境操作 7",
    "desc": "执行此快捷槽位中的环境操作",
    "chords": [
      "未分配"
    ]
  },
  {
    "name": "环境操作 8",
    "desc": "执行此快捷槽位中的环境操作",
    "chords": [
      "未分配"
    ]
  },
  {
    "name": "环境操作 9",
    "desc": "执行此快捷槽位中的环境操作",
    "chords": [
      "未分配"
    ]
  },
  {
    "name": "提交或推送",
    "desc": "打开提交或推送选项",
    "chords": [
      "未分配"
    ]
  },
  {
    "name": "创建分支",
    "desc": "打开分支创建选项",
    "chords": [
      "未分配"
    ]
  },
  {
    "name": "创建草稿 PR",
    "desc": "打开草稿 Pull Request 创建选项",
    "chords": [
      "未分配"
    ]
  },
  {
    "name": "创建 PR",
    "desc": "打开 Pull Request 创建选项",
    "chords": [
      "未分配"
    ]
  },
  {
    "name": "合并 PR",
    "desc": "打开 Pull Request 合并选项",
    "chords": [
      "未分配"
    ]
  },
  {
    "name": "在 GitHub 上打开 PR",
    "desc": "打开与当前聊天关联的 Pull Request",
    "chords": [
      "未分配"
    ]
  },
  {
    "name": "打开文件夹",
    "desc": "将本地项目添加到 ChatGPT",
    "chords": [
      "Ctrl+O"
    ]
  },
  {
    "name": "强制重新加载技能",
    "desc": "刷新当前上下文的技能目录",
    "chords": [
      "未分配"
    ]
  },
  {
    "name": "前往技能",
    "desc": "浏览已安装和推荐的技能",
    "chords": [
      "未分配"
    ]
  },
  {
    "name": "从其他 AI 应用导入",
    "desc": "从其他 AI 应用导入",
    "chords": [
      "未分配"
    ]
  },
  {
    "name": "键盘快捷方式",
    "desc": "自定义键盘快捷键",
    "chords": [
      "未分配"
    ]
  },
  {
    "name": "MCP",
    "desc": "配置 MCP 服务器",
    "chords": [
      "未分配"
    ]
  },
  {
    "name": "全部标为已读",
    "desc": "将所有聊天和已安排任务更新标记为已读",
    "chords": [
      "Shift+Esc"
    ]
  },
  {
    "name": "反馈",
    "desc": "向 ChatGPT 团队发送产品反馈",
    "chords": [
      "未分配"
    ]
  },
  {
    "name": "注销",
    "desc": "退出登录 ChatGPT",
    "chords": [
      "未分配"
    ]
  },
  {
    "name": "管理已安排任务",
    "desc": "从当前页面创建或管理已安排任务",
    "chords": [
      "未分配"
    ]
  },
  {
    "name": "显示或隐藏 Mini",
    "desc": "随时随地切换虚拟宠物的显示状态",
    "chords": [
      "Alt+Win+P"
    ]
  },
  {
    "name": "打开控制窗口",
    "desc": "打开语音聊天控制窗口",
    "chords": [
      "未分配"
    ]
  },
  {
    "name": "重做上一步操作",
    "desc": "重做最近撤销的应用操作",
    "chords": [
      "Ctrl+Y",
      "Ctrl+Shift+Z"
    ]
  },
  {
    "name": "设置",
    "desc": "打开 ChatGPT 设置",
    "chords": [
      "Ctrl+,"
    ]
  },
  {
    "name": "撤销上一步操作",
    "desc": "撤销最近的应用操作",
    "chords": [
      "Ctrl+Z"
    ]
  },
  {
    "name": "批准请求",
    "desc": "批准已开启的请求",
    "chords": [
      "⏎"
    ]
  },
  {
    "name": "拒绝请求",
    "desc": "拒绝当前请求",
    "chords": [
      "Esc"
    ]
  },
  {
    "name": "关闭其他标签页",
    "desc": "关闭除当前标签页外的所有标签页",
    "chords": [
      "Ctrl+Alt+W"
    ]
  },
  {
    "name": "关闭标签页",
    "desc": "关闭当前标签页",
    "chords": [
      "Ctrl+W",
      "Ctrl+F4"
    ]
  },
  {
    "name": "关闭",
    "desc": "关闭活动窗口",
    "chords": [
      "Ctrl+W",
      "Ctrl+F4"
    ]
  },
  {
    "name": "附加文件和文件夹",
    "desc": "将文件和文件夹附加到当前编辑器",
    "chords": [
      "未分配"
    ]
  },
  {
    "name": "添加照片",
    "desc": "将照片添加到当前编辑器",
    "chords": [
      "未分配"
    ]
  },
  {
    "name": "清除提示",
    "desc": "清除当前编辑器中的提示",
    "chords": [
      "未分配"
    ]
  },
  {
    "name": "Cycle host",
    "desc": "Cycle the new task between this computer and available remote machines",
    "chords": [
      "未分配"
    ]
  },
  {
    "name": "循环切换推理强度",
    "desc": "循环切换编辑器推理强度选项",
    "chords": [
      "未分配"
    ]
  },
  {
    "name": "降低推理强度",
    "desc": "降低当前编辑器推理强度",
    "chords": [
      "未分配"
    ]
  },
  {
    "name": "提高推理强度",
    "desc": "提高当前编辑器推理强度",
    "chords": [
      "未分配"
    ]
  },
  {
    "name": "打开模型选择器",
    "desc": "打开编辑器模型选择器",
    "chords": [
      "Ctrl+Shift+M"
    ]
  },
  {
    "name": "打开项目选择器",
    "desc": "打开编辑器项目选择器",
    "chords": [
      "Ctrl+Alt+Shift+O"
    ]
  },
  {
    "name": "将提示加入队列",
    "desc": "将当前编辑器提示作为排队消息提交",
    "chords": [
      "未分配"
    ]
  },
  {
    "name": "调整提示方向",
    "desc": "将当前编辑器提示作为引导消息提交",
    "chords": [
      "未分配"
    ]
  },
  {
    "name": "发送消息",
    "desc": "发送当前编辑器中的消息",
    "chords": [
      "未分配"
    ]
  },
  {
    "name": "在后台发送消息",
    "desc": "无需打开聊天即可发送当前编辑器中的消息",
    "chords": [
      "Ctrl+⏎"
    ]
  },
  {
    "name": "切换快速模式",
    "desc": "在当前编辑器中开启或关闭快速模式",
    "chords": [
      "未分配"
    ]
  },
  {
    "name": "切换规划模式",
    "desc": "在当前编辑器中开启或关闭方案模式",
    "chords": [
      "未分配"
    ]
  },
  {
    "name": "切换云端/本地",
    "desc": "切换 ChatGPT Work 的云端和本地执行",
    "chords": [
      "未分配"
    ]
  },
  {
    "name": "切换本地/工作树",
    "desc": "在本地与新工作树之间切换当前编辑器",
    "chords": [
      "未分配"
    ]
  },
  {
    "name": "复制为 Markdown",
    "desc": "将当前聊天复制为 Markdown",
    "chords": [
      "未分配"
    ]
  },
  {
    "name": "复制对话路径",
    "desc": "复制当前聊天路径",
    "chords": [
      "Ctrl+Alt+Shift+C"
    ]
  },
  {
    "name": "复制深层链接",
    "desc": "复制当前聊天的深度链接",
    "chords": [
      "Ctrl+Alt+L"
    ]
  },
  {
    "name": "复制工作目录",
    "desc": "复制当前聊天的工作目录",
    "chords": [
      "Ctrl+Shift+C"
    ]
  },
  {
    "name": "分叉聊天",
    "desc": "为当前聊天创建分支",
    "chords": [
      "未分配"
    ]
  },
  {
    "name": "按住听写快捷键",
    "desc": "在桌面任意位置按住，即可在光标位置听写",
    "chords": [
      "未分配"
    ]
  },
  {
    "name": "切换听写快捷键",
    "desc": "在桌面任意位置按一次开始听写，再次按下停止",
    "chords": [
      "未分配"
    ]
  },
  {
    "name": "强制重新加载浏览器页面",
    "desc": "强制重新加载当前浏览器页面",
    "chords": [
      "Ctrl+Shift+R"
    ]
  },
  {
    "name": "弹出窗口快捷键",
    "desc": "在桌面任意位置显示或隐藏弹出窗口",
    "chords": [
      "未分配"
    ]
  },
  {
    "name": "浏览器返回",
    "desc": "在浏览器历史记录中返回上一页",
    "chords": [
      "Alt+Left"
    ]
  },
  {
    "name": "浏览器前进",
    "desc": "在浏览器历史记录中前进",
    "chords": [
      "Alt+Right"
    ]
  },
  {
    "name": "新窗口",
    "desc": "打开新窗口",
    "chords": [
      "未分配"
    ]
  },
  {
    "name": "打开命令菜单",
    "desc": "打开命令菜单",
    "chords": [
      "Ctrl+K",
      "Ctrl+Shift+P"
    ]
  },
  {
    "name": "重新加载浏览器页面",
    "desc": "重新加载当前浏览器页面",
    "chords": [
      "Ctrl+R"
    ]
  },
  {
    "name": "重命名聊天",
    "desc": "重命名当前聊天",
    "chords": [
      "Ctrl+Alt+R"
    ]
  },
  {
    "name": "搜索文件…",
    "desc": "搜索文件",
    "chords": [
      "Ctrl+P"
    ]
  },
  {
    "name": "显示键盘快捷键",
    "desc": "显示当前可用的快捷键",
    "chords": [
      "Ctrl+/"
    ]
  },
  {
    "name": "转到聊天 1",
    "desc": "打开此快捷槽位中可见的聊天",
    "chords": [
      "Ctrl+1"
    ]
  },
  {
    "name": "转到聊天 2",
    "desc": "打开此快捷槽位中可见的聊天",
    "chords": [
      "Ctrl+2"
    ]
  },
  {
    "name": "转到聊天 3",
    "desc": "打开此快捷槽位中可见的聊天",
    "chords": [
      "Ctrl+3"
    ]
  },
  {
    "name": "转到聊天 4",
    "desc": "打开此快捷槽位中可见的聊天",
    "chords": [
      "Ctrl+4"
    ]
  },
  {
    "name": "转到聊天 5",
    "desc": "打开此快捷槽位中可见的聊天",
    "chords": [
      "Ctrl+5"
    ]
  },
  {
    "name": "转到聊天 6",
    "desc": "打开此快捷槽位中可见的聊天",
    "chords": [
      "Ctrl+6"
    ]
  },
  {
    "name": "转到聊天 7",
    "desc": "打开此快捷槽位中可见的聊天",
    "chords": [
      "Ctrl+7"
    ]
  },
  {
    "name": "转到聊天 8",
    "desc": "打开此快捷槽位中可见的聊天",
    "chords": [
      "Ctrl+8"
    ]
  },
  {
    "name": "转到聊天 9",
    "desc": "打开此快捷槽位中可见的聊天",
    "chords": [
      "Ctrl+9"
    ]
  },
  {
    "name": "显示/隐藏文件树",
    "desc": "显示/隐藏文件树面板",
    "chords": [
      "Ctrl+Shift+E"
    ]
  },
  {
    "name": "最大化/还原侧边面板",
    "desc": "展开或还原侧边面板",
    "chords": [
      "未分配"
    ]
  },
  {
    "name": "开始跟踪记录",
    "desc": "开始或停止轨迹录制",
    "chords": [
      "Ctrl+Shift+S"
    ]
  }
];
