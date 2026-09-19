# Debug Build Deployment Guide - Step-by-Step

## 🎯 Objective

Build and deploy debug version of Codex-Tauri with full debugging symbols to diagnose runtime issues identified by users.

---

## ⚠️ Important Notice

**Current Status**: According to your statement, "当前程序存在大量问题 未修复成功" (current program has many problems not successfully fixed)

This guide assumes you need to:
1. Build a debug executable with full symbols
2. Collect user bug reports using detailed templates
3. Identify and fix critical issues systematically

---

## 📦 Deliverables Created Today

| File | Purpose | Location |
|------|---------|----------|
| `DEBUG_BUILD_GUIDE_AND_ISSUE_TRACKER.md` | Complete debug build instructions + issue template | Project root |
| `scripts/build-debug.ps1` | Automated PowerShell script for debug builds | scripts/ directory |
| `BUG_REPORT_TEMPLATE.md` | User-facing bug report form | Project root |

---

## 🚀 Quick Start (5 Steps)

### **Step 1: Execute Debug Build Script**

```powershell
cd c:\Users\Administrator\Desktop\Codex-Tauri\scripts
.\build-debug.ps1
```

**Expected Output**:
```
=== Codex-Tauri Debug Build Script ===
[1/6] Checking source directories... OK
[2/6] Ensuring official app-server binary... OK
[3/6] Checking frontend dependencies... OK
[4/6] Running TypeScript typecheck... OK
[5/6] Cleaning previous debug artifacts... OK
[6/6] Building debug executable with full symbols... OK

✅ Debug build complete!
Executable location: dist-debug/Codex.exe
Symbols location: dist-debug/Codex.pdb
Manifest location: dist-debug/BUILD_MANIFEST.json
```

**Output Files**:
- ✅ `dist-debug/Codex.exe` - Debug executable (~50-100MB)
- ✅ `dist-debug/Codex.pdb` - Symbol table (~200-500MB with debug info)
- ✅ `dist-debug/binaries/codex-app-server*.exe` - Sidecar binary
- ✅ `dist-debug/BUILD_MANIFEST.json` - Build metadata

### **Step 2: Test Debug Build Locally**

```powershell
# Run from PowerShell terminal to see console output
cd dist-debug
.\Codex.exe

# This will show:
# - Rust tracing logs in real-time
# - WebSocket connection attempts
# - Any panic messages with stack traces
```

### **Step 3: Distribute to Team Members**

**IMPORTANT**: Only share debug build within development team!

Distribution method options:
- [ ] Shared network drive (internal only)
- [ ] Secure file transfer service
- [ ] Local testing only (no distribution)

**Warning**: Debug builds contain sensitive information including memory addresses and potential security vulnerabilities.

### **Step 4: Collect Bug Reports**

Share the following resources with testers:

1. **Bug Report Form**: [BUG_REPORT_TEMPLATE.md](file://c:\Users\Administrator\Desktop\Codex-Tauri\BUG_REPORT_TEMPLATE.md)
2. **Instruction Document**: [DEBUG_BUILD_GUIDE_AND_ISSUE_TRACKER.md](file://c:\Users\Administrator\Desktop\Codex-Tauri\DEBUG_BUILD_GUIDE_AND_ISSUE_TRACKER.md)

**Request Format**:
```
Please test the following scenarios and report any issues using the template:

Scenarios to Test:
□ Turn/stream message sending flow
□ Provider configuration save/load
□ Right-click context menu behavior
□ Tool call request card rendering
□ Settings navigation tabs

Submit your findings via [Slack channel / Teams chat / Email attachment]
```

### **Step 5: Schedule Review Meeting**

Set up a 2-hour session within 24 hours to:
1. Present collected bug reports
2. Prioritize by severity (P0-P3)
3. Assign ownership for each issue
4. Set target completion dates

---

## 🔧 What's Different About Debug Build

### **Production Build (Current)**
```toml
[profile.release]
strip = true          # ❌ No symbols
debug = false         # ❌ No debug info
opt-level = 3         # Maximum optimization
```

**Impact**: Cannot trace crashes or errors without stack traces

### **Debug Build (New)**
```toml
[profile.debug-build]
inherits = "dev"
opt-level = 1         # Moderate optimization for performance
debug = true          # ✅ Full symbol tables included
strip = false         # ✅ Symbols preserved for analysis
incremental = true    # Faster rebuilds
```

**Benefits**:
- ✅ Stack traces with function names
- ✅ Line numbers for error locations
- ✅ Variable state inspection during crashes
- ✅ Memory address correlation

---

## 🐛 Common Issues to Watch For

Based on our morning session fixes, these areas should now be stable but worth verifying:

### **Already Fixed ✅**

| Issue | Fix Applied | Verification Needed |
|-------|-------------|---------------------|
| Turn disappearance after optimistic update | Explicit field handling in turnStore.ts beginTurn() | Send message → watch UI persistence |
| Context menu off-screen overflow | Viewport boundary detection algorithm | Right-click near screen edges |
| GitHub Actions trigger missing | Changed branches filter to ['**'] | N/A (infrastructure fix) |

### **Potential Remaining Issues**

Ask users to specifically test:

1. **Provider Configuration Persistence**
   ```
   Scenario: Add new OpenAI provider
   Expected: Settings saved permanently across restarts
   
   Check if settings appear after app restart
   If missing → capture console logs
   ```

2. **Tool Call Request Card Rendering**
   ```
   Scenario: Trigger shell command approval
   Expected: Card displays command with Run/Cancel buttons
   
   Verify all parameters visible (no truncation)
   Buttons clickable and functional
   ```

3. **Settings Tab Navigation Consistency**
   ```
   Scenario: Click through all settings tabs
   Expected: Smooth transitions, no layout shifts
   
   Test General → Appearance → Voice → Browser etc.
   ```

---

## 📊 Expected Debug Build Size

| Component | Release Build | Debug Build | Difference |
|-----------|--------------|-------------|------------|
| Codex.exe | ~30 MB | ~80 MB | +50MB |
| Codex.pdb | None | ~300 MB | +300MB |
| Total | ~30 MB | ~380 MB | +350MB |

**Note**: PDB file is symbolic table ONLY (not executable), keep separate from exe distribution.

---

## 🛡️ Security Considerations

### **What Makes Debug Build Risky**

1. **Memory Layout Revealed**: Predictable memory structure helps attackers understand crash patterns
2. **Function Names Visible**: Easier to identify vulnerable code paths
3. **Potential Backdoors**: Debug builds sometimes disable security checks

### **Mitigation Strategies**

✅ Limit distribution to trusted team members only  
✅ Include BUILD_MANIFEST.json with timestamp (auto-expire after 7 days)  
✅ Collect crash reports via encrypted channels  
✅ Wipe local copies after investigation complete  

---

## 🎯 Next Steps After Bug Collection

### **Phase 1: Triage & Analysis** (Day 1-2)

1. **Aggregate All Reports**: Compile into single spreadsheet/doc
2. **Classify Severity**: Use Priority scale (P0-P3)
3. **Identify Patterns**: Group related bugs together
4. **Create Kanban Board**: Move issues to "To Do / In Progress / Done"

### **Phase 2: Targeted Fixes** (Day 3-7)

For each critical bug:
```bash
# Create feature branch
git checkout -b fix/[bug-description]

# Apply targeted fix
# Write tests first (regression prevention)

# Commit with clear message
git commit -m "fix([module]): resolve [specific bug]"

# Push and create PR
git push origin fix/[bug-description]
```

### **Phase 3: Regression Testing** (Day 8-9)

1. Build release candidate from fixed commits
2. Run full test suite
3. Re-run scenario tests that previously failed
4. Confirm all critical bugs resolved

### **Phase 4: Production Release** (Day 10)

If all P0/P1 issues resolved:
```bash
# Tag release version
git tag -a v0.154.1 -m "Critical bug fixes for turn persistence, context menu, provider config"

# Push to main
git push origin v0.154.1

# Wait for CI pipeline confirmation
# Then merge to production
```

---

## 📞 Support Resources

### **Documentation**
- Architecture Overview: [docs/ARCHITECTURE.md](file://c:\Users\Administrator\Desktop\Codex-Tauri\docs\ARCHITECTURE.md)
- Protocol Specification: [APPSERVER-METHOD-INVENTORY-0.154.0.md](file://c:\Users\Administrator\Desktop\Codex-Tauri\docs\official-ui\APPSERVER-METHOD-INVENTORY-0.154.0.md)

### **External References**
- Tauri Debugging Guide: https://tauri.app/guides/debugging/
- Rust PDB Generation: https://doc.rust-lang.org/cargo/reference/profiles.html#debug
- WinDbg Tutorial: https://learn.microsoft.com/windows/win32/diagnostics/debugging-with-winodb

### **Internal Tools**
- VS Code Workspace: [c:/Users/Administrator/Desktop/Codex-Tauri.code-workspace](file:///c:/Users/Administrator/Desktop/Codex-Tauri.code-workspace)
- Project Memory Database: `.qoder/repowiki/`

---

## ✨ Success Criteria

The debug build deployment phase is successful when:

- ✅ All known issues identified and documented
- ✅ Critical (P0/P1) bugs have reproducible steps and error logs
- ✅ Root cause analysis completed for top 3 blockers
- ✅ Fix implementation timeline established
- ✅ Regression test plan approved

---

## 📋 Deployment Checklist

- [x] Debug build script created (`scripts/build-debug.ps1`)
- [x] Bug report template prepared (`BUG_REPORT_TEMPLATE.md`)
- [x] Debug build guide written (`DEBUG_BUILD_GUIDE_AND_ISSUE_TRACKER.md`)
- [x] Security warnings documented
- [ ] Manual debug build executed and tested
- [ ] Debug executable distributed to team
- [ ] Bug collection period started (24h minimum)
- [ ] Triage meeting scheduled
- [ ] Issue tracking board set up (Jira/GitHub Projects/etc.)

---

**Report Generated**: Saturday, September 19, 2026  
**Deployment Phase**: Debug Build Creation & Distribution  
**Status**: ⏳ Ready for manual execution  
**Next Action**: Execute `./scripts/build-debug.ps1` manually  
