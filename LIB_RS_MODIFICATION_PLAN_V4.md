## **修正后的 lib.rs 具体改动方案**

### 现有 lib.rs 结构分析

**关键发现**:
- Line 1-4: Local modules (mod codex; mod commands; ...)
- Line 8: `pub fn run()` exists (not假设的结构)
- Line 23: `.setup(|app| {...})` callback already present
- Line 63: Sidecar EngineHandle already managed via `app.manage(engine)`

---

### 具体修改策略

**Step A: Add import statement at top of file**

Insert after line 4 (`mod state;`):
```rust
// ────────────────────────────────────────────────────────────────────────
// External workspace dependency imports
// ────────────────────────────────────────────────────────────────────────
use codex_core::{AgentLoop, TurnManager};
```

**Reason**: Import types from external crate without using `mod backend;`

---

**Step B: Wrap AgentLoop in Handle type for Tauri state management**

**NEW File Creation First**: 
Create `backend/core/src/agent_loop_handle.rs`:

```rust
//! Minimal handle type for AgentLoop that can be stored in Tauri state.
//!
//! Contains only an mpsc::Sender for command passing. Actual AgentLoop
//! runs as tokio task, not directly in Tauri AppState.

use std::sync::Arc;
use tokio::sync::mpsc;

/// Command type for frontend-to-agent communication
#[derive(Debug, Clone)]
pub enum AgentCommand {
    BeginTurn { thread_id: String },
    SendMessage { thread_id: String, text: String },
    InterruptTurn { thread_id: String },
    // Future commands will go here
}

/// Handle to agent loop for sending commands from Tauri commands
#[derive(Clone)]
pub struct AgentLoopHandle {
    sender: mpsc::Sender<AgentCommand>,
}

impl AgentLoopHandle {
    pub fn new(sender: mpsc::Sender<AgentCommand>) -> Self {
        Self { sender }
    }

    /// Send begin turn command
    pub async fn begin_turn(&self, thread_id: String) -> Result<(), mpsc::error::SendError<AgentCommand>> {
        self.sender.send(AgentCommand::BeginTurn { thread_id }).await
    }

    /// Send message command  
    pub async fn send_message(
        &self,
        thread_id: String,
        text: String,
    ) -> Result<(), mpsc::error::SendError<AgentCommand>> {
        self.sender.send(AgentCommand::SendMessage { thread_id, text }).await
    }

    /// Interrupt current turn
    pub async fn interrupt_turn(&self, thread_id: String) -> Result<(), mpsc::error::SendError<AgentCommand>> {
        self.sender.send(AgentCommand::InterruptTurn { thread_id }).await
    }
}
```

**File Location**: `src-tauri/backend/core/src/agent_loop_handle.rs`  
**LOC**: ~45 lines

---

**Step C: Modify AgentLoop to accept mpsc Receiver instead of running directly**

**Modify** `backend/core/src/agent_loop.rs`:

Change signature from:
```rust
pub struct AgentLoop { ... }
impl AgentLoop {
    pub fn new() -> Self { ... }
    pub fn run(self) { ... }  // ← REMOVE THIS
}
```

To:
```rust
pub struct AgentLoop {
    receiver: mpsc::Receiver<AgentCommand>,
    // ... other fields
}

impl AgentLoop {
    pub fn new(receiver: mpsc::Receiver<AgentCommand>) -> Self { ... }
    
    /// Run agent loop in background task
    pub fn spawn(self) -> JoinHandle<()> {
        tauri::async_runtime::spawn(async move {
            while let Some(cmd) = self.receiver.recv().await {
                // process cmd...
            }
        })
    }
}
```

**Result**: AgentLoop runs independently, no Tauri state conflict

---

**Step D: Modify src-tauri/src/lib.rs setup() callback**

**Original** (lines 23-70):
```rust
.setup(|app| {
    let handle = app.handle().clone();
    let state = state::AppState::load_or_default(&handle)?;
    // ... adapter setup code ...
    app.manage(adapter_state);
    app.manage(state);
    
    let engine = codex::EngineHandle::start(app.handle())?;
    app.manage(engine);
    // ... rest of existing code
    Ok(())
})
```

**Modified Version** (new structure):
```rust
.setup(|app| {
    let handle = app.handle().clone();
    let state = state::AppState::load_or_default(&handle)?;
    
    // --- NEW AGENT LOOP SETUP ---
    let (cmd_tx, cmd_rx) = mpsc::channel::<codex_core::AgentCommand>(100);
    let agent_handle = codex_core::AgentLoopHandle::new(cmd_tx);
    
    // Spawn actual AgentLoop in tokio runtime
    {
        use tokio::task::JoinHandle;
        let _agent_task: JoinHandle<()> = {
            let agent = codex_core::AgentLoop::new(cmd_rx);
            agent.spawn()
        };
        // Note: agent_task is intentionally leaked/detached - it outlives setup()
    }
    
    app.manage(agent_handle);  // Store handle in Tauri state
    
    // --- END AGENT LOOP SETUP ---
    
    // ... rest of existing adapter/engine/setup code unchanged ...
    app.manage(adapter_state);
    app.manage(state);
    app.manage(engine);
    
    Ok(())
})
```

**Key Changes**:
1. Create mpsc channel for command passing
2. Build AgentLoopHandle and store in Tauri state
3. Spawn actual AgentLoop detached task (doesn't need to survive in memory)
4. Use handle for all future command dispatches

---

**Step E: Add necessary imports to lib.rs**

Add after line 6 (`use tauri::Manager;`):
```rust
use std::sync::Arc;
use tokio::sync::mpsc;
use tokio::task::JoinHandle;
```

These are needed for channel creation and task spawning.

---

### Complete Modified Section (Ready for Copy-Paste)

**After modification**, the relevant section of lib.rs will look like this:

```rust
mod codex;
mod commands;
mod menu;
mod state;

use tauri::Manager;
use std::sync::Arc;
use tokio::sync::mpsc;
use tokio::task::JoinHandle;

// Import from external workspace crate
use codex_core::{AgentLoop, AgentLoopHandle};

pub fn run() {
    tracing_subscriber::fmt()
        .with_env_filter(
            tracing_subscriber::EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| "info,codex_tauri=debug".into()),
        )
        .init();

    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_store::Builder::default().build())
        .menu(|app| menu::build_menu(app))
        .on_menu_event(menu::on_menu_event)
        .setup(|app| {
            let handle = app.handle().clone();
            
            // --- NEW AGENT LOOP HANDLER SETUP ---
            let (cmd_tx, cmd_rx) = mpsc::channel::<codex_core::AgentCommand>(100);
            let agent_handle = AgentLoopHandle::new(cmd_tx);
            
            // Spawn detached task for actual agent loop processing
            let _agent_task: JoinHandle<()> = {
                let agent = AgentLoop::new(cmd_rx);
                agent.spawn()
            };
            
            app.manage(agent_handle);
            // --- END AGENT LOOP SETUP ---
            
            let state = state::AppState::load_or_default(&handle)?;
            // ... rest of existing setup code unchanged ...
```

---

### Summary of Modifications

| Location | Change Type | Lines Affected | Reason |
|----------|-------------|----------------|--------|
| `lib.rs` line 1-7 | ADD | +6 lines | New imports for tokio sync primitives |
| `lib.rs` line 8 | MODIFY | +1 line | Add `use codex_core::{AgentLoop, AgentLoopHandle}` |
| `lib.rs` line 23-70 | MODIFY | +15 lines wrapped | Insert agent handler setup in `.setup()` callback |
| `backend/core/src/lib.rs` | ADD | NEW FILE | Export `AgentLoopHandle` + `AgentCommand` |
| `backend/core/src/agent_loop_handle.rs` | CREATE | +45 lines | Define handle type for Tauri integration |
| `backend/core/src/agent_loop.rs` | MODIFY | +10 lines | Adapt to accept receiver, add spawn method |

---

### Testing Checklist After Modification

- [ ] `cargo check --package codex-core` passes
- [ ] `cargo check --workspace` passes  
- [ ] No missing imports errors in lib.rs
- [ ] AgentLoopHandle implements Clone properly for manage()
- [ ] mpsc::channel size (100) sufficient for Phase 1 throughput

---

This concrete plan is based on ACTUAL existing lib.rs content, not hypothetical templates. Ready to implement upon your confirmation.
