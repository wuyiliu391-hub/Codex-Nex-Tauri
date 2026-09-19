# Tool Call Adapter Test Execution Guide

## Overview

This guide provides steps to verify that the tool call adapter correctly:
1. Aggregates OpenAI/Ollama `tool_call` deltas in memory
2. Emits official `item/tool/call` notification with complete arguments
3. Triggers frontend tool card rendering via Tauri event bridge

---

## Phase 1: Automated Binary Test (Recommended First)

### Prerequisites
- Node.js 18+ installed
- Protocol adapter server running on port `17458` (or update test config)
- Mock OpenAI server capability (built into test script)

### Step 1: Add npm Script Entry

Edit `frontend/package.json`:
```json
{
  "scripts": {
    "dev": "vite",
    "build": "tsc --noEmit && vite build",
    // ... existing scripts
    "test-tool-call": "node ../scripts/test-tool-call-streaming.mjs"
  }
}
```

### Step 2: Execute Test

```powershell
cd frontend
npm run test-tool-call
```

### Expected Output

```
=== Codex Tool Call Streaming Test ===

Provider: openai
Model: gpt-4o-mini
Adapter Port: 17458
Expected Notification: item/tool/call

[✓] Mock OpenAI server running on port 19999

[⏳] Waiting for adapter connection...

[✓] Connected to Protocol Adapter

[→] Sending Codex Responses request...

[↗] Output item added: message
[↗] Output item added: function_call

[✓] Function call completed:
    Name: shell
    Arguments: {"command":"ls -la"}
    Status: completed

[✓] Response completed

=== Notification Validation ===

Validation for "shell":
  ✓ name field: PASS
  ✓ arguments field: PASS
  ✓ status="completed": PASS
  ✓ call_id present: PASS

[✓] Overall validation: PASSED
```

### Interpretation Results

| Result | Meaning | Action |
|--------|---------|--------|
| ✅ PASSED | Adapter emits correct structure | Ready for manual testing |
| ❌ FAIL | Missing fields or invalid format | Review adapter.rs line 684-713 |
| ⏱ TIMEOUT | No notifications received | Check if adapter is running on port 17458 |

---

## Phase 2: Manual Integration Test (Production Simulation)

### Prerequisites
- Full Codex-Tauri app running (`cargo tauri dev`)
- Valid OpenAI API key configured
- App-shell connected to real model provider

### Step 1: Configure Provider

1. Open Settings → Providers tab
2. Select "OpenAI" from dropdown
3. Enter valid API key (or use existing configured key)
4. Click "Save"
5. Verify provider appears as "active" in sidebar

### Step 2: Trigger Tool Call

**Scenario A: Shell Command Request**
```
User prompt: "List files in current directory"
```

Expected flow:
1. Model responds with `tool_calls` in delta stream
2. Adapter receives chunks:
   ```json
   {"delta":{"tool_calls":[{"index":0,"function":{"name":"shell"}}]}}
   {"delta":{"tool_calls":[{"index":0,"function":{"arguments":"{\\"command\\":"}}]}}
   {"delta":{"tool_calls":[{"index":0,"function":{"arguments":"\\"ls\\"}"}}]}}
   {"delta":{"tool_calls":[{"index":0,"function":{"arguments":" -la\\"}"}}]}}
   {"delta":{"tool_calls":[{"index":0,"function":{"arguments":"}"}}]}}
   ```
3. Adapter aggregates → emits `item/tool/call` notification
4. Frontend renders tool card in TurnStream

**Expected UI Behavior**:
- ✅ Tool card appears with title "Execute shell command"
- ✅ Arguments displayed as JSON code block: `{"command": "ls -la"}`
- ✅ Buttons visible: [Run] [Cancel]
- ✅ Console shows event: `codex:item-tool-call`

### Step 3: Validate Event Bridge

Open DevTools → Console tab, filter for `codex:` events:

```javascript
// Should see these logs during tool call:
[events] Listening on codex:item-tool-call
[events] Received payload: {
  "type": "function_call",
  "id": "fc_1",
  "name": "shell",
  "call_id": "call_1",
  "arguments": "{\"command\":\"ls -la\"}",
  "status": "completed"
}
```

**Success Criteria**:
- ✅ Event fired within 500ms of final delta
- ✅ Arguments JSON is complete (no truncation)
- ✅ Item ID follows pattern `fc_{output_index}`

---

## Phase 3: Performance Monitoring (Optional)

### Metric Collection

Add temporary logging to `adapter.rs` line 684:

```rust
async fn function_call(&mut self, name: &str, args: &str, call_id: &str) -> anyhow::Result<()> {
    let start = std::time::Instant::now();
    
    // Existing emission logic...
    
    let elapsed = start.elapsed();
    tracing::info!(
        "tool_call_emission",
        name = name,
        args_len = args.len(),
        latency_ms = elapsed.as_millis()
    );
    
    Ok(())
}
```

### Expected Metrics

| Metric | Target | Threshold |
|--------|--------|-----------|
| Latency per tool call | < 1ms | Warn if > 10ms |
| Argument size | < 10KB | Error if > 1MB |
| Delta count average | 3-5 chunks | Alert if > 50 (streaming issue) |

---

## Debugging Common Issues

### Issue 1: No Tool Card Appears

**Symptoms**: Model sends tool calls but UI doesn't render card

**Troubleshooting Steps**:
1. Check Rust logs for `item/tool/call` emission:
   ```powershell
   cargo tauri dev --log-level debug 2>&1 | findstr "tool_call"
   ```
   
2. Verify frontend listener attached:
   ```javascript
   // Add breakpoint in frontend/app/bridge/events.ts
   console.log('[DEBUG] Checking event listeners:', NOTIFICATION_METHODS);
   ```

3. Confirm item type matches renderer:
   ```typescript
   // In blocks/registry.tsx, verify:
   BLOCK_RENDERERS['function_call'] exists?
   ```

### Issue 2: Arguments Truncated

**Symptoms**: Tool card shows `{"command": "ls` incomplete

**Root Cause**: Delta chunks arriving too fast, buffer overflow

**Fix**: Implement rate limiting in adapter:
```rust
const MAX_DELTA_BUFFER: usize = 64 * 1024; // 64KB
if sse_buffer.len() > MAX_DELTA_BUFFER {
    tracing::warn!("Delta buffer overflow, clearing");
    sse_buffer.clear();
    return;
}
```

### Issue 3: Multiple Simultaneous Tool Calls

**Symptoms**: Only first tool card appears, others dropped

**Root Cause**: ChatToolAgg not maintaining index order

**Verification**: Check BTreeMap insertion at line 736-763:
```rust
fn feed(&mut self, entries: &[Value]) {
    for tc in entries {
        let idx = tc.get("index")...;  // ← Must be unique per call
        // Ensure idx != previous entry's idx
    }
}
```

---

## Final Verification Checklist

- [ ] Automated test passes (`npm run test-tool-call`)
- [ ] Manual test with real provider completes
- [ ] Tool card renders within 1 second of model response
- [ ] Arguments JSON displays correctly formatted
- [ ] Console shows no error messages related to tools
- [ ] Approval workflow functions (Run/Cancel buttons work)
- [ ] No memory leaks observed after 10+ tool calls
- [ ] Performance metrics within acceptable range

---

## Reporting Findings

If any test fails, document:
1. **Exact failure point** (which step failed)
2. **Error logs** (Rust backend + Frontend console)
3. **Repro steps** (provider/model/prompt used)
4. **Network captures** (optional: wireshark/tcpdump)

Submit to team lead for root cause analysis.

---

**Document Version**: 1.0  
**Last Updated**: Saturday, September 19, 2026  
**Owner**: Protocol Compliance Group
