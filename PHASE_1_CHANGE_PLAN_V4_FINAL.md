# 📋 **Phase 1 变更计划书 (修正版 v4.0 - Final Ready for Execution)**

## ✅ 问题修正完成清单

### **问题 1: Edition 已修正为 2021** ✓

所有 Cargo.toml 文件统一使用 `edition = "2021"`:
- src-tauri/Cargo.toml (workspace root)
- backend/core/Cargo.toml  
- backend/tauri-bridge/Cargo.toml

**理由**: Phase 1 使用成熟稳定的 Rust 2021，待验证通过后再评估升级。

---

### **问题 2: lib.rs 实际内容分析 + 具体改动方案** ✓

基于实际读取的 lib.rs 内容，生成完整修改计划:

**核心修改点**:
1. Add imports: `std::sync::Arc`, `tokio::sync::mpsc`, `tokio::task::JoinHandle`
2. Import external crate: `use codex_core::{AgentLoop, AgentLoopHandle}`
3. Insert agent handler setup in `.setup()` callback at line 23
4. Use mpsc channel pattern for command passing
5. Spawn detached task with `_agent_task: JoinHandle<()>`

**详细说明文档**: 已保存至 [`LIB_RS_MODIFICATION_PLAN_V4.md`](file://c:\Users\Administrator\Desktop\Codex-Tauri\LIB_RS_MODIFICATION_PLAN_V4.md)

---

### **问题 3: Tauri 版本保持现有不变** ✓

**现有 Tauri 配置**(从读取的 Cargo.toml):
```toml
[dependencies]
tauri = "=2.11.5"
```

**Workspace Cargo.toml 最终方案**:
```toml
# src-tauri/Cargo.toml

[workspace]
members = [
    ".",                    # Current crate itself
    "backend/core",         # Core backend module
    "backend/tauri-bridge", # Tauri integration layer
]
resolver = "2"

[workspace.package]
version = "0.154.0"
edition = "2021"          # CORRECTED FROM 2024 TO 2021
license = "Apache-2.0"

[workspace.dependencies]
tokio = { version = "1", features = ["full"] }
tokio-stream = "0.1"
anyhow = "1"
serde = { version = "1", features = ["derive"] }
serde_json = "1"
thiserror = "2.0"
async-stream = "0.3"
sqlx = { version = "0.9", features = ["runtime-tokio", "sqlite"] }
tracing = "0.1"
tracing-subscriber = "0.3"
uuid = { version = "1", features = ["v4", "serde"] }

# Existing Tauri dependency MUST stay pinned - DO NOT CHANGE
tauri = "=2.11.5"

# Workspace lints - Phase 1: warn only
[workspace.lints.clippy]
unwrap_used = "warn"
expect_used = "warn"

# Existing dependencies remain unchanged
# ... (keep all existing crates and versions as-is)
```

**关键原则**: 
- 保留现有 `tauri = "=2.11.5"` 硬编码版本
- 只在 `[workspace.dependencies]` 里添加新后端 crate 需要的依赖
- 不修改现有任何 package 的版本号

---

### **问题 4: AgentLoop Handle 模式修正** ✓

**新架构设计**:

```rust
// File: backend/core/src/agent_loop_handle.rs
pub enum AgentCommand {
    BeginTurn { thread_id: String },
    SendMessage { thread_id: String, text: String },
    InterruptTurn { thread_id: String },
}

#[derive(Clone)]
pub struct AgentLoopHandle {
    sender: mpsc::Sender<AgentCommand>,
}

impl AgentLoopHandle {
    pub fn begin_turn(&self, thread_id: String) -> Result<(), SendError> { ... }
    pub fn send_message(&self, thread_id: String, text: String) -> Result<(), SendError> { ... }
    pub fn interrupt_turn(&self, thread_id: String) -> Result<(), SendError> { ... }
}
```

**Tauri state management 方式**:
```rust
.setup(|app| {
    // Create channel for command passing
    let (cmd_tx, cmd_rx) = mpsc::channel::<AgentCommand>(100);
    
    // Store handle in Tauri state (Clone-safe!)
    app.manage(AgentLoopHandle::new(cmd_tx));
    
    // Spawn actual agent loop detached task
    let agent = AgentLoop::new(cmd_rx);
    let _task: JoinHandle<()> = agent.spawn();
    // Note: _task is intentionally leaked - runs independently
    
    Ok(())
})
```

**Key Benefits**:
- ✅ No receiver stored in Tauri AppState (avoids &mut issues)
- ✅ Handle type is Clone (multiple commands can send concurrently)
- ✅ Actual AgentLoop runs as detached tokio task (independent lifecycle)
- ✅ Communication via simple enum-based command protocol

---

## 📂 **修正后的 Phase 1 完整变更清单 (FINAL)**

### **第一部分：新建文件** (17 files total)

#### A. Backend Core Crate (9 files)

| 文件路径 | 类型 | 内容说明 |
|---------|------|---------|
| `src-tauri/backend/core/Cargo.toml` | NEW | Core workspace member config |
| `src-tauri/backend/core/src/lib.rs` | NEW | Module exports + re-exports |
| `src-tauri/backend/core/src/models/turn.rs` | NEW | Turn struct definition |
| `src-tauri/backend/core/src/turn_manager.rs` | NEW | Turn lifecycle manager |
| `src-tauri/backend/core/src/agent_loop.rs` | NEW | Agent state machine core |
| `src-tauri/backend/core/src/event_sink.rs` | NEW | Event broadcasting mechanism |
| `src-tauri/backend/core/src/provider_api.rs` | NEW | ModelProvider trait + errors |
| `src-tauri/backend/core/src/mock_provider.rs` | NEW | Mock provider implementation |
| `src-tauri/backend/core/src/agent_loop_handle.rs` | NEW | Handle type for Tauri state |

#### B. Backend Tests (1 file)

| 文件路径 | 类型 | 内容说明 |
|---------|------|---------|
| `src-tauri/backend/core/tests/minimal_flow_test.rs` | NEW | End-to-end acceptance test |

#### C. Tauri Bridge Crate (4 files)

| 文件路径 | 类型 | 内容说明 |
|---------|------|---------|
| `src-tauri/backend/tauri-bridge/Cargo.toml` | NEW | Bridge workspace member config |
| `src-tauri/backend/tauri-bridge/src/lib.rs` | NEW | Module exports |
| `src-tauri/backend/tauri-bridge/src/commands.rs` | NEW | submit_message, list_sessions stubs |
| `src-tauri/backend/tauri-bridge/src/events.rs` | NEW | Event emission wrappers |

#### D. Workspace Configuration (2 files)

| 文件路径 | 类型 | 内容说明 |
|---------|------|---------|
| `src-tauri/backend/.gitignore` | NEW | Ignore build artifacts & test.db |
| `LIB_RS_MODIFICATION_PLAN_V4.md` | NEW | Detailed lib.rs change plan |

---

### **第二部分：修改现有文件** (2 files)

| 文件路径 | 修改类型 | 具体改动 |
|---------|---------|---------|
| `src-tauri/Cargo.toml` | MODIFY | Add `[workspace] members` section; add `codex-core` and `codex-tauri-bridge` to [workspace.dependencies]; set edition="2021"; keep tauri="=2.11.5" unchanged |
| `src-tauri/src/lib.rs` | MODIFY | Add imports + import agent types; insert agent handler setup in .setup() callback |

---

### **第三部分：删除文件** (0 files)

⚠️ **Phase 1 不执行任何删除操作**

保留现有 sidecar 及相关代码 intact

---

## 🔄 **最终执行顺序与依赖图**

```
Step 1: Create workspace root structure ✓
├─ Build src-tauri/backend/.gitignore
└─ Verify git status clean before proceeding ✓

Step 2: Build core crate with all components ✓
├─ Build src-tauri/backend/core/Cargo.toml
├─ Build src-tauri/backend/core/src/lib.rs
├─ Build src-tauri/backend/core/src/models/turn.rs
├─ Build src-tauri/backend/core/src/turn_manager.rs
├─ Build src-tauri/backend/core/src/agent_loop.rs
├─ Build src-tauri/backend/core/src/event_sink.rs
├─ Build src-tauri/backend/core/src/provider_api.rs
├─ Build src-tauri/backend/core/src/mock_provider.rs
├─ Build src-tauri/backend/core/src/agent_loop_handle.rs  ← NEW!
├─ Build src-tauri/backend/core/tests/minimal_flow_test.rs
└─ Verify cargo check --package codex-core passes ✓

Step 3: Build tauri-bridge crate ✓
├─ Build src-tauri/backend/tauri-bridge/Cargo.toml
├─ Build src-tauri/backend/tauri-bridge/src/lib.rs
├─ Build src-tauri/backend/tauri-bridge/src/commands.rs
├─ Build src-tauri/backend/tauri-bridge/src/events.rs
└─ Verify cargo check --package codex-tauri-bridge passes ✓

Step 4: Integrate into main workspace ✓
├─ Modify src-tauri/Cargo.toml (add workspace members & dependencies)
├─ Modify src-tauri/src/lib.rs (import codex_core, insert agent setup)
└─ Verify cargo check --workspace passes ✓

Step 5: Run full DoD test suite ✓
├─ Execute cargo test --package codex-core minimal_flow_test -- --nocapture
├─ Verify ALL FIVE CHECKPOINTS PASS:
│   ✓ Step 1: Frontend command received
│   ✓ Step 2: AgentLoop processes user input
│   ✓ Step 3: MockProvider generates response chunk
│   ✓ Step 4: TurnManager accumulates items
│   ✓ Step 5: Tauri event emitted with turn state update
└─ Phase 1 DoD verification complete ✓
```

---

## 🎯 **最终成功标准 (DoD v4.0)**

### **Definition of Done Checklist**

- [ ] All 17 new files created with correct content
- [ ] Both existing files modified without introducing syntax errors
- [ ] `cargo check --workspace` passes with zero errors
- [ ] `cargo clippy --workspace` runs with ONLY WARNINGS allowed (no unwrap/expect DENY)
- [ ] **Minimal flow test ACTUALLY RUNS AND PASSES ALL FIVE STEPS**:
  ```
  Running tests/minimal_flow_test.rs
  
  ✓ Step 1: Frontend command received
  ✓ Step 2: AgentLoop processes user input  
  ✓ Step 3: MockProvider generates response chunk
  ✓ Step 4: TurnManager accumulates items
  ✓ Step 5: Tauri event emitted with turn state update
  
  test result: ok. 1 passed; 0 failed
  ```
- [ ] Git status shows clean state or ready-to-commit changes
- [ ] README.md documents how to run Phase 1 test

---

## ⚠️ **最终风险识别**

| Risk Area | Impact Probability | Mitigation Strategy |
|-----------|-------------------|---------------------|
| **Edition Upgrade Risk** | Low | Using 2021 instead of 2024 avoids ecosystem compatibility issues |
| **Tauri State Management** | Medium | AgentLoopHandle pattern avoids Receiver<&mut> conflicts |
| **Path Dependency Resolution** | Medium | Ensure Cargo.toml paths match actual directory structure exactly |
| **Test Environment Setup** | Medium | Pre-create test.db if SQLX requires it, handle gracefully |
| **Clippy Warning Accumulation** | Low | Phase 1 allows warn, won't block execution |

---

## 📊 **最终工作量预估**

| Step | Estimated Time | Risk Level | Notes |
|------|---------------|------------|-------|
| Step 1 | 10 minutes | Low | Simple file creation |
| Step 2 | 50 minutes | Medium | 9 source files + test file |
| Step 3 | 15 minutes | Medium | 4 files for bridge crate |
| Step 4 | 20 minutes | Low | 2 modifications with actual lib.rs context |
| Step 5 | 15 minutes | Medium | Must actually execute test |

**Total Expected Duration**: ~110 minutes (~1 hour 50 minutes)

---

## ✨ **最终确认点**

请您明确指示是否同意**修正后版本 v4.0 (Final Ready for Execution)**的 Phase 1 变更计划:

**选项 A**: ✅ **同意此最终计划，开始执行 Phase 1**  
→ 我将立即从 Step 1 开始创建 workspace 与 core crate  

**选项 B**: ❌ **需要对某些细节进行最后调整**  
→ 请指出具体问题所在，我会更新计划后重新提交  

**选项 C**: ⏸️ **暂时不执行，稍后再议**  
→ 我可以保存当前设计文档，暂停此次任务

**自动推送保持禁用状态** 🔒

Awaiting your explicit confirmation before proceeding with execution... ⏳
