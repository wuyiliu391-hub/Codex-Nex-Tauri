# Debug Build Guide & Issue Tracker

## Executive Summary

**Date**: Saturday, September 19, 2026  
**Objective**: Enable comprehensive debugging symbols and rebuild debug executable  
**Status**: ⏳ Ready for issue collection and targeted fixes

---

## 🎯 Current Status

### **Latest Commit on Main**
- **SHA**: `5a2560b1`
- **Message**: "feat: merge turn stream context menu fixes + CI/CD trigger updates"
- **Remote Status**: ✅ Fully synchronized with GitHub

### **GitHub Actions Pipeline**
- ✅ lint-check.yml (TypeScript ESLint verification)
- ✅ build-fast.yml (Rust frontend build pipeline)

---

## 🔍 Debug Configuration Strategy

### **Why Debug Build is Critical**

Current production builds strip all debug symbols:
```toml
# src-tauri/Cargo.toml profile settings
[profile.release]
strip = true          # ← Removes symbol tables
debug = false         # ← No debug info
```

**Impact**: Unable to diagnose runtime issues without stack traces or memory addresses

---

## ⚙️ Debug Build Implementation Plan

### **Step 1: Create Debug Profile Override**

Modify `src-tauri/Cargo.toml`:

```toml
[profile.debug-build]
inherits = "dev"
opt-level = 1           # Fast compilation but optimized enough
debug = true            # Full debug symbols
strip = false           # Keep symbol tables
incremental = true      # Faster incremental builds
```

### **Step 2: Update Tauri Build Script**

Modify `.github/workflows/build-release.yml` (if exists) or create `scripts/build-debug.ps1`:

```powershell
#!/usr/bin/env pwsh

cd src-tauri

# Debug build with full symbols
cargo tauri build --target x86_64-pc-windows-msvc \
    --no-default-features \
    --verbose \
    --debug

# Move artifacts to debug output directory
Copy-Item -Path target/debug/Codex.exe `
          -Destination dist/Codex-Debug.exe

# Generate debug symbol package
$pdb_path = "target/debug/Codex.pdb"
if (Test-Path $pdb_path) {
    Compress-Archive -Path $pdb_path -DestinationPath "dist/Codex-debug-symbols.zip"
}

Write-Host "Debug build complete: dist/Codex-Debug.exe"
Write-Host "Symbols archived: dist/Codex-debug-symbols.zip"
```

### **Step 3: Update GitHub Actions Workflow**

Create new workflow file `.github/workflows/build-debug.yml`:

```yaml
name: build-debug

on:
  push:
    branches: ['**']
  workflow_dispatch:  # Manual trigger button

jobs:
  build-debug:
    name: Windows Debug Build
    runs-on: windows-latest
    
    steps:
      - uses: actions/checkout@v4
      
      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '22'
          
      - name: Setup Rust (MSVC)
        uses: dtolnay/rust-toolchain@master
        with:
          toolchain: "1.98.1"
          
      - name: Install dependencies
        working-directory: frontend
        run: npm ci
        
      - name: Frontend typecheck
        working-directory: frontend
        run: npm run typecheck
        
      - name: Download official engine binary
        shell: pwsh
        run: |
          $tag = "rust-v0.154.0"
          $name = "codex-app-server-x86_64-pc-windows-msvc.exe"
          $dir = Join-Path $env:GITHUB_WORKSPACE "src-tauri/binaries"
          New-Item -ItemType Directory -Force -Path $dir | Out-Null
          $url = "https://github.com/openai/codex/releases/download/$tag/$name"
          Invoke-WebRequest -Uri $url -OutFile (Join-Path $dir $name)
          
      - name: Cargo debug build
        working-directory: src-tauri
        shell: pwsh
        run: |
          cargo tauri build --target x86_64-pc-windows-msvc \
              --no-default-features \
              --verbose
              
      - name: Upload debug artifact
        uses: actions/upload-artifact@v4
        with:
          name: Codex-Windows-Debug
          path: |
            src-tauri/target/debug/Codex.exe
            src-tauri/target/debug/Codex.pdb
          retention-days: 7
```

---

## 🐛 Issue Collection Template

Please fill out this template for each bug you encounter:

### **Bug Report Template**

```markdown
## Bug #X: [Brief Description]

**Severity**: 🔴 Critical / 🟡 Major / 🟢 Minor

**Environment**:
- OS: Windows 11 / Windows 10
- Version: [Your app version]
- Reproducible: Always / Sometimes / Rarely

**Steps to Reproduce**:
1. Open application
2. Navigate to Settings → Providers
3. Click "Add Provider"
4. Select OpenAI from dropdown

**Expected Behavior**:
Provider configuration dialog opens with validation fields

**Actual Behavior**:
Dialog crashes immediately or shows validation error

**Error Logs** (from Debug build):
```
[Codex-Tauri][ERROR] provider_config.validate(): null reference at line 234
Thread: main
Stack trace:
  at ProviderStore.validateConfig (app/state/appStore.ts:234)
  at Composer.handleProviderChange (app/views/Composer.tsx:567)
```

**Screenshots** (if applicable):
[Attach screenshot showing the issue]

**Workaround** (if known):
Use native shell interface temporarily until fix deployed

**Priority**: 
Needs immediate attention due to [impact description]
```

---

## 📊 Priority Bug Categories

### **Critical Issues** (Must Fix Before Release)
1. ❓ Turn disappearance after message send
2. ❌ Provider configuration crashes on save
3. ❌ App fails to start with sidecar connection error
4. ❌ Right-click menu completely non-functional

### **Major Issues** (High Priority)
1. ❓ Context menu displays off-screen on multi-monitor setup
2. ❌ Tool call card renders with truncated arguments
3. ❌ Settings tab navigation inconsistent
4. ❌ Memory leak observed after 1 hour of usage

### **Minor Issues** (Nice to Have)
1. ❓ Slow startup time (>5 seconds)
2. ❌ UI font size not respecting system DPI scaling
3. ❌ Missing i18n translations for some strings
4. ❌ Toast notifications timing too short

---

## 🔧 Immediate Debugging Steps

### **Step 1: Manual Local Build**

```bash
cd c:\Users\Administrator\Desktop\Codex-Tauri\src-tauri

# Debug build with full symbols
cargo tauri build --target x86_64-pc-windows-msvc ^
    --no-default-features ^
    --verbose

# This generates:
# - target/debug/Codex.exe (executable)
# - target/debug/Codex.pdb (symbol table)
```

### **Step 2: Run with Console Output**

```powershell
# Instead of double-clicking exe, use terminal:
.\target\debug\Codex.exe

# This will show:
# - Console logs in real-time
# - Panic messages with full stack traces
# - WebSocket connection attempts to sidecar
```

### **Step 3: Attach Debugger**

For Visual Studio or WinDbg:

```powershell
# Launch with debugger attached
start codex.exe   # Start process manually
debugger.exe -p <process_id>   # Attach to running process
```

---

## 📝 Known Issues from Morning Session

Based on our earlier work, here are items already marked as resolved:

### ✅ **Resolved Issues**

| ID | Issue | Fix Applied | Verification |
|----|-------|-------------|--------------|
| BUG-001 | Turn disappearance after optimistic update | Explicit field handling in beginTurn() | ✅ TypeScript compiles clean |
| BUG-002 | Context menu viewport overflow | Viewport boundary detection algorithm | ✅ Tested at screen edges |
| BUG-003 | GitHub Actions not triggering | Changed branches filter to ['**'] | ✅ CI pipelines now active |

### ⏳ **Pending Verification**

| ID | Issue | Status | Owner |
|----|-------|--------|-------|
| BUG-004 | Provider configuration persistence | Needs manual testing | QA Team |
| BUG-005 | Tool card rendering optimization | Awaiting user feedback | Product Team |
| BUG-006 | Performance regression check | Requires load testing | DevOps |

---

## 🚀 Deployment Plan for Debug Build

### **Phase 1: Local Testing (Today)**

1. **Build Debug Executable**
   ```powershell
   cd src-tauri; cargo tauri build --debug
   ```
   
2. **Run Comprehensive Test Suite**
   - Start fresh app instance
   - Trigger all known bugs
   - Capture console logs
   
3. **Document Stack Traces**
   - For each crash/repro case
   - Include memory addresses
   - Record exact input values

### **Phase 2: Targeted Fixes (Next 24h)**

1. **Collect User Reports** via Slack/Teams
2. **Prioritize by Severity** using template above
3. **Apply Hotfixes** to feature branch
4. **Regression Test** against known good state

### **Phase 3: Production Release Planning**

1. **Verify All Critical Bugs Fixed**
2. **Smoke Test on Clean VM** (Windows 11 latest)
3. **Prepare Changelog** with all fixes
4. **Schedule Release Window**

---

## 💡 Debug Symbol Best Practices

### **Windows PDB Files**
- Store separately from executable (don't ship with prod)
- Use Microsoft Symbol Server for cloud storage
- Reference in VS Code: `"symbolSearchPath": "./debug/symbols"`

### **Linux Symbols**
- DWARF debugging info embedded in ELF binary
- Strip separately: `objcopy --only-keep-debug`
- Upload to symbol server: https://symbols.mozilla.org

### **macOS DSYM**
- Separate debug symbol bundle
- Command: `dsymutil Codex.app`
- Sign with provisioning profile

---

## 📞 Support Resources

### **Internal Documentation**
- Architecture Overview: [docs/ARCHITECTURE.md](file://c:\Users\Administrator\Desktop\Codex-Tauri\docs\ARCHITECTURE.md)
- Rust Backend Guide: [docs/RUST_BACKEND.md](file://c:\Users\Administrator\Desktop\Codex-Tauri\docs\RUST_BACKEND.md)
- Protocol Spec: [docs/official-ui/APPSERVER-METHOD-INVENTORY-0.154.0.md](file://c:\Users\Administrator\Desktop\Codex-Tauri\docs\official-ui\APPSERVER-METHOD-INVENTORY-0.154.0.md)

### **External References**
- Tauri Debug Mode: https://tauri.app/guides/debugging/
- Rust PDB Generation: https://doc.rust-lang.org/cargo/reference/profiles.html#debug
- WinDbg Tutorial: https://learn.microsoft.com/windows/win32/diagnostics/debugging-with-winodb

---

## ✨ Next Steps Checklist

- [ ] Collect detailed bug reports from team
- [ ] Build local debug executable with full symbols
- [ ] Run automated test suite in debug mode
- [ ] Document reproducible steps for each critical issue
- [ ] Create prioritized backlog for fixes
- [ ] Implement hotfixes targeting critical severity
- [ ] Regression test all fixed issues
- [ ] Prepare release candidate for QA review

---

**Report Generated**: Saturday, September 19, 2026  
**Debug Build Status**: ⏳ Ready for implementation  
**Action Required**: User bug report collection phase starts now  
