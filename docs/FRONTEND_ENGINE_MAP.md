# Frontend ↔ Engine Mapping

How the Codex-Nex UI (Vanilla JS) maps onto the official `codex-app-server` backend via the Tauri Rust shell.

> Method names and response shapes verified against official
> `codex-rust v0.154.0` (`app-server-protocol/src/protocol/common.rs`).
> See also `docs/RUST_BACKEND.md`.

## Architecture

```
┌─ Frontend (Codex-Nex UI, Vanilla JS) ─────────────────────────┐
│  bootstrap.js → installBridge() → window.go.main.App          │
│  agent-events.js → window.runtime.EventsOn / OnAgent*         │
│  live-turn.js ← agent:event / agent:runtime CustomEvents      │
└──────────────────────────┬────────────────────────────────────┘
                           │ Tauri IPC (invoke / listen)
┌──────────────────────────▼────────────────────────────────────┐
│  bridge.js  — Wails→Tauri adapter                             │
│    • 156 App methods mapped                                   │
│    • GetState = local get_state + engine list_* (fail-soft)   │
│    • codex:* Tauri events → agent:* CustomEvents              │
│    • extractSessions understands official `{ data: [...] }`   │
└──────────────────────────┬────────────────────────────────────┘
                           │ invoke("cmd", args)
┌──────────────────────────▼────────────────────────────────────┐
│  Rust shell (src-tauri/src/commands/*.rs)                     │
│    Local: settings/pets/calendar/cinema/connectors/fs         │
│    Engine: thread/turn/config/mcp/skills/plugins + rpc_raw    │
│    Handshake: initialize → initialized on every connect       │
└──────────────────────────┬────────────────────────────────────┘
                           │ WebSocket JSON-RPC  ws://127.0.0.1:17457
┌──────────────────────────▼────────────────────────────────────┐
│  codex-app-server (official sidecar)                          │
│    thread/start, thread/list, turn/start, …                   │
│    server→client: item/commandExecution/requestApproval       │
└───────────────────────────────────────────────────────────────┘
```

## GetState: Composite Aggregator

The Go backend's `GetState` returned a monolithic snapshot from its internal store. The Tauri `get_state` command only returns **local shell state**:

| Field | Source |
|-------|--------|
| `settings` | `get_state` (local) |
| `preferences` | `get_state` (local) |
| `pets` | `get_state` (local) |
| `calendar` | `get_state` (local) |
| `cinemaTimelines` / `cinemaJobs` | `get_state` (local) |
| `connectors` | `get_state` (local) |
| `shortcuts` | `get_state` (local) |

`bridge.js` implements a **composite `GetState`** that merges local state with best-effort engine calls:

| Field | Engine command | Fail-soft value |
|-------|---------------|-----------------|
| `sessions` | `list_sessions(archived:false)` → `thread/list` | `[]` |
| `providers` | `list_providers` → `config/read` | `[]` |
| `mcpServers` | `list_mcp_servers` → `mcpServerStatus/list` | `[]` |
| `skills` | `list_skills` → `skills/list` | `[]` |
| `plugins` | `list_plugins` → `plugin/list` | `[]` |
| `dependencies` | `check_dependencies` | `[]` |
| `projects` | *(not ported)* | `[]` |
| `connections` | *(not ported)* | `[]` |
| `scheduled` | *(not ported)* | `[]` |
| `hooks` | *(not ported — official `hooks/list` exists)* | `[]` |
| `worktrees` | *(not ported)* | `[]` |
| `notifications` | *(not ported)* | `[]` |
| `memory` | *(not ported)* | `[]` |
| `sitePermissions` | *(not ported)* | `[]` |

All engine calls use `Promise.allSettled` — if the engine is offline, the UI still boots with empty arrays.

### Official response shapes

| Call | Official shape | Bridge normalizes to |
|------|----------------|----------------------|
| `thread/list` | `{ data: Thread[], nextCursor, backwardsCursor }` | `extractSessions` reads `data` |
| `thread/read` | `{ thread: Thread }` | `get_session` unwraps `thread` |
| `thread/start` | `{ thread, model, modelProvider, cwd, ... }` | `new_session` flattens `thread` + keeps `threadStart` |
| `config/read` | `{ config: { model_providers: { id: {...} }, ... }, origins }` | `list_providers` → `{ providers: [...] }` |
| `mcpServerStatus/list` | `{ data: McpServerStatus[], nextCursor }` | `list_mcp_servers` → `{ servers: [...] }` |
| `skills/list` | `{ skills: [...] }` (or equivalent) | `list_skills` → `{ skills: [...] }` |
| `plugin/list` | plugin list object | `list_plugins` → `{ plugins: [...] }` |
| `initialize` | `{ userAgent, codexHome, platformFamily, platformOs }` | exposed via `engine_status.initialize` |

## Method Mapping (Go App → Tauri)

### Direct Tauri commands

| App method | Tauri command | Official RPC |
|-----------|---------------|--------------|
| `GetState` | `get_state` + composite | see above |
| `CheckDependencies` | `check_dependencies` | local |
| `GetSettings` / `SaveSettings` | `get_settings` / `save_settings` | local |
| `NewSession` | `new_session` | `thread/start` |
| `ListSessions` | `list_sessions` | `thread/list` |
| `GetSession` | `get_session` | `thread/read` |
| `DeleteSession` | `delete_session` | `thread/delete` |
| `ArchiveSession` / `UnarchiveSession` | `archive_session` / … | `thread/archive` / … |
| `SendMessage` / `RunCodexTurn` | `send_message` | `turn/start` |
| `InterruptSession` | `interrupt_session` | `turn/interrupt` |
| `ResolveApproval` | `resolve_approval` | **JSON-RPC response** to server request id |
| `ListProviders` / `SaveProvider` / `ProbeProvider` | `list_providers` / … | `config/read` / `config/batchWrite` / `model/list` |
| `ListMCPServers` / `SaveMCPServer` / `SetMCPServerEnabled` | `list_mcp_servers` / … | `mcpServerStatus/list` / `config/value/write` |
| `ListSkills` / `ReloadSkills` | `list_skills` / `reload_skills` | `skills/list` |
| `ListPluginEntries` / `SetPluginEnabled` | `list_plugins` / `set_plugin_enabled` | `plugin/list` / `plugin/install`\|`uninstall` |
| `OpenShell` / `WriteShell` / `CloseShell` | `open_shell` / … | `command/exec` / `command/exec/write` / `command/exec/terminate` |
| `GitStatus` | `git_status` | `thread/shellCommand` (needs threadId) |
| `GetRuntimeEvents` | `get_runtime_events` | `thread/timeline/list` |
| `ListAgentTools` | `list_agent_tools` | *(empty; no stable method)* |
| `RpcRaw` | `rpc_raw` | any method |

### Approvals (critical)

Turn/start approvals arrive as **server→client requests**, not notifications:

| Method | Reply body |
|--------|------------|
| `item/commandExecution/requestApproval` | `{ "decision": "accept" \| "decline" \| "cancel" \| "acceptForSession" }` |
| `item/fileChange/requestApproval` | same decision enum |
| `item/permissions/requestApproval` | permissions decision |
| `item/tool/requestUserInput` | answers object |
| `mcpServer/elicitation/request` | elicitation response |

`resolve_approval(requestId, approved, kind, sessionScope?)` sends the
JSON-RPC result for that server request id. There is **no**
`approval/respond` client method in v0.154.0.

### rpc_raw fallback

| App method | rpc_raw method |
|-----------|---------------|
| `DiscoverProviderModels` | `model/list` |
| `GetSkillDetail` | `skills/list` (filter client-side) |
| `SetSkillEnabled` | `skills/config/write` |
| `GitBranchList` / `GitLog` | `thread/shellCommand` |
| `ListHooks` | `hooks/list` |
| `ListProjects` | `project/list` (experimental) |

### Structured error stubs

Go-only features return `{ __unimplemented: true, method, reason }` or empty arrays so the UI degrades gracefully:

- Browser, LSP, Snapshots, Hooks (UI), Memory (UI), Scheduled, Automations, PRs, Notifications, SSH, Projects, Worktrees
- `CompactSession` → could map to `thread/compact/start` later
- `ResizeShell` → `command/exec/resize`

## Event System

### Wails → Tauri event shim

`installBridge()` creates `window.runtime` with `EventsOn` / `EventsOnMultiple` / `EventsOff` / `EventsEmit`.

### codex:* → agent:* mapping

Rust `events.rs` emits `codex:{method with / replaced by -}` for every server
notification (dots are illegal in Tauri event names), plus dedicated names
for server→client requests:

| Tauri event | agent:* CustomEvent | Source method |
|-------------|---------------------|---------------|
| `codex:approval` | `agent:event` (type=approval) | `item/*/*Approval*` |
| `codex:user-input` | `agent:question` | `item/tool/requestUserInput`, elicitation |
| `codex:turn-started` | `agent:runtime` | `turn/started` |
| `codex:turn-completed` | `agent:runtime` | `turn/completed` |
| `codex:item-agentMessage-delta` | `agent:runtime` | `item/agentMessage/delta` |
| `codex:item-completed` | `agent:runtime` | `item/completed` |
| `codex:item-commandExecution-outputDelta` | `agent:runtime` | command output |
| `codex:thread-started` | `agent:runtime` | `thread/started` |
| `codex:rpc-event` | `agent:runtime` | generic fallback |

`bridge.js` sanitizes legacy dotted aliases (`codex:turn.completed` etc.) to the
same `-` channels, so `agent-events.js` keeps working.

### OnAgent* callback bridges

`OnAgentEvent(cb)` / `OnAgentRuntime(cb)` / `OnAgentPlanMode(cb)` /
`OnAgentQuestion(cb)` register `window.addEventListener` handlers for the
corresponding `agent:*` CustomEvents.

## Engine method names (codex-app-server v0.154.0)

| Purpose | RPC method | Notes |
|---------|-----------|-------|
| Handshake | `initialize` then notify `initialized` | **required** |
| Create thread | `thread/start` | params: `{ cwd, model, ... }` |
| List threads | `thread/list` | response `{ data, nextCursor }` |
| Read thread | `thread/read` | response `{ thread }` |
| Delete / archive / unarchive | `thread/delete` / `thread/archive` / `thread/unarchive` | |
| Start turn | `turn/start` | params `{ threadId, input: UserInput[] }` where `UserInput` is `{ type: "text", text }` |
| Interrupt turn | `turn/interrupt` | |
| Timeline | `thread/timeline/list` | **not** `thread/timeline` |
| Config read/write | `config/read` / `config/value/write` / `config/batchWrite` | **not** `config/get`/`config/update` |
| List models | `model/list` | |
| Account | `account/read` | |
| MCP status | `mcpServerStatus/list` | **not** `mcp/listServers` |
| MCP reload | `config/mcpServer/reload` | |
| List skills | `skills/list` | |
| List plugins | `plugin/list` | no setEnabled |
| One-off shell | `command/exec` | **not** `shell/open` |
| Shell stdin | `command/exec/write` | |
| Shell terminate | `command/exec/terminate` | |
| Thread shell | `thread/shellCommand` | |

## UI adaptation notes

1. **Sessions list**: `bootstrap.js refreshState()` reads `snap.sessions`.
   Official `thread/list` returns `{ data: [...] }`. `extractSessions`
   prefers `data`. Thread objects use camelCase (`id`, `archived`, `cwd`,
   `updatedAt`, …). Optional chaining keeps missing fields soft.

2. **Providers**: from `config/read` → `config.model_providers` map.
   `list_providers` flattens to an array with `id` injected.

3. **MCP servers**: from `mcpServerStatus/list` → `{ data: [...] }`.
   Each entry has `name`, `runtimeStatus`, `pluginId`, …

4. **Running state**: `IsSessionRunning` checks `get_session` for
   `runtime.status === "running"`. The poll loop in `agent-events.js`
   calls this every 500ms. Engine thread objects expose
   `status` / turn status via `thread/read`.

5. **Engine offline**: All engine calls fail soft. The UI boots, shows local
   settings/pets/calendar, and displays empty session list.
   `check_dependencies` reports `codex-app-server` as not connected.

6. **Initialize metadata**: `engine_status` includes `initialize` from the
   last handshake (`userAgent`, `codexHome`, `platformFamily`, `platformOs`).
