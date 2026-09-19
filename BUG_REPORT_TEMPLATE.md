# Bug Report Form - Codex-Tauri Debug Session

## 使用指南

此模板用于收集所有用户遇到的 bug 和问题。请按以下步骤操作：

1. **运行 debug 版本**：`dist-debug/Codex.exe` (从 PowerShell 终端启动)
2. **复现问题**：执行会导致问题的具体操作
3. **记录错误信息**：复制控制台输出的完整错误日志
4. **填写此表单**：尽可能详细地描述问题

---

## 🐛 问题报告 #___

### **基本信息**

| 字段 | 内容 |
|------|------|
| **日期** | `____/____/2026` |
| **时间** | `__:__ __M/PM` |
| **测试者** | `[您的姓名]` |
| **环境** | Windows [10/11] + Build [版本号] |

### **问题分类**

- [ ] 🔴 **Critical** - 应用崩溃/无法启动/数据丢失
- [ ] 🟡 **Major** - 主要功能失效但可工作  
- [ ] 🟢 **Minor** - 界面/UI 问题/体验不佳
- [ ] ℹ️ **Information** - 疑问/建议非 bug 项

### **复现步骤**

**场景**: [例如："新会话对话"、"Provider 配置"]

1. 第一步操作: _________________
2. 第二步操作: _________________
3. 第三步操作: _________________
4. ...更多步骤...

**预期结果**: 期望发生什么？_________________

**实际结果**: 实际发生了什么？_________________

### **错误日志捕获**

```
请从 PowerShell 控制台复制完整的错误信息:

[在这里粘贴错误日志]

示例格式:
[Codex-Tauri][ERROR] provider_config.validate(): null reference at line 234
Thread: main
Stack trace:
  at ProviderStore.validateConfig (app/state/appStore.ts:234)
  at Composer.handleProviderChange (app/views/Composer.tsx:567)
```

### **屏幕截图**（如适用）

**文件名**: `bug_[date]_[scenario].png`

**说明**: 
- [ ] 包含完整窗口
- [ ] 高亮显示问题区域
- [ ] 显示系统信息栏（如有）

### **临时解决方案**

**当前 workaround**: _________________

**影响范围**: 
- [ ] 仅特定场景受影响
- [ ] 间歇性出现
- [ ] 每次都必然复现

### **优先级评估**

**阻塞开发吗？** [是/否]

**影响用户体验吗？** [是/否]

**需要立即修复吗？** [是/否]

**建议优先级**: 
- [ ] P0 - Blocker (必须立即修复才能继续)
- [ ] P1 - High (今天内完成)
- [ ] P2 - Medium (本周内完成)
- [ ] P3 - Low (排期后处理)

### **额外备注**

其他相关信息或猜测可能的原因：
```
[在此处填写任何额外观察]
```

---

## 📋 已确认问题清单（维护区）

*注意：此处由开发者维护，用户无需填写*

| ID | 描述 | 严重性 | 状态 | 负责人 | 预计修复日期 |
|----|------|--------|------|--------|--------------|
| BUG-001 | Turn after optimistic update disappears | 🟡 Major | ✅ Fixed | DevTeam | Completed |
| BUG-002 | Context menu off-screen overflow | 🟢 Minor | ✅ Fixed | Frontend | Completed |
| BUG-003 | GitHub Actions trigger missing | 🟡 Major | ✅ Fixed | DevOps | Completed |
| ??? | ??? | ??? | ⏳ Pending | TBD | TBD |

---

## 🎯 调试工具推荐

### **Visual Studio Code**

Launch configuration for debugging:

```json
{
  "version": "0.2.0",
  "configurations": [
    {
      "name": "Debug Tauri App",
      "type": "node",
      "request": "launch",
      "cwd": "${workspaceFolder}/frontend",
      "runtimeExecutable": "${workspaceFolder}/dist-debug/Codex.exe",
      "preLaunchTask": "debug-build",
      "outFiles": ["${workspaceFolder}/frontend/dist/**/*.js"]
    }
  ]
}
```

### **WinDbg Commands**

For runtime crash analysis:

```
!analyze -v          # Full crash analysis
~1e kb               # Thread stack trace
dt -l <class_name>   # Inspect object state
bp <function_addr>   # Set breakpoint
```

### **Browser DevTools**

If using browser dev mode, access via:

```bash
# In frontend package.json script
npm run dev:browser
# Then visit http://localhost:1420 in Chrome
# Press F12 to open DevTools
```

---

## ✅ 提交问题检查清单

提交前请确保：

- [ ] 已完成完整复现步骤描述
- [ ] 已提供预期和实际结果对比
- [ ] 已复制完整错误日志（非截图）
- [ ] 已附上必要的截图或录屏
- [ ] 已尝试过的 workaround 已说明
- [ ] 已评估优先级并给出理由

---

**感谢您的配合！** 

通过详细的问题报告，我们可以更快地定位和修复 bug。🙏
