# Frontend ↔ Engine Mapping

How the Codex-Nex UI (Vanilla JS) maps onto the official `codex-app-server` backend via the Tauri Rust shell.

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
└──────────────────────────┬────────────────────────────────────┘
                           │ invoke("cmd", args)
┌──────────────────────────▼────────────────────────────────────┐
│  Rust shell (src-tauri/src/commands/*.rs)                     │
│    Local: settings/pets/calendar/cinema/connectors/fs         │
│    Engine: thread/turn/mcp/skills/plugins/shell/git + rpc_raw │
└──────────────────────────┬────────────────────────────────────┘
                           │ WebSocket JSON-RPC
┌──────────────────────────▼────────────────────────────────────┐
│  codex-app-server (official sidecar)                          │
│    thread/start, thread/list, thread/read, turn/start, …      │
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
| `sessions` | `list_sessions(archived:false)` | `[]` |
| `providers` | `list_providers` | `[]` |
| `mcpServers` | `list_mcp_servers` | `[]` |
| `skills` | `list_skills` | `[]` |
| `plugins` | `list_plugins` | `[]` |
| `dependencies` | `check_dependencies` | `[]` |
| `projects` | *(not ported)* | `[]` |
| `connections` | *(not ported)* | `[]` |
| `scheduled` | *(not ported)* | `[]` |
| `hooks` | *(not ported)* | `[]` |
| `worktrees` | *(not ported)* | `[]` |
| `notifications` | *(not ported)* | `[]` |
| `memory` | *(not ported)* | `[]` |
| `sitePermissions` | *(not ported)* | `[]` |

All engine calls use `Promise.allSettled` — if the engine is offline, the UI still boots with empty arrays.

## Method Mapping (Go App → Tauri)

### Direct Tauri commands

| App method | Tauri command | Notes |
|-----------|---------------|-------|
| `GetState` | `get_state` + composite | See above |
| `CheckDependencies` | `check_dependencies` | |
| `GetSettings` / `SaveSettings` | `get_settings` / `save_settings` | |
| `GetPreferences` / `SavePreferences` | `get_preferences` / `save_preferences` | |
| `ListShortcuts` / `SaveShortcuts` | `list_shortcuts` / `save_shortcuts` | |
| `ListPets` / `SavePets` | `list_pets` / `save_pets` | |
| `WakePet` / `TuckPet` / `CreateCustomPet` | `wake_pet` / `tuck_pet` / `create_custom_pet` | |
| `ListCalendarEvents` / `SaveCalendarEvent` / `DeleteCalendarEvent` | `list_calendar_events` / … | |
| `ListCinemaTimelines` / `SaveCinemaTimeline` / … | `list_cinema_timelines` / … | |
| `ListConnectors` / `SaveConnector` / `DeleteConnector` / `TestConnector` | `list_connectors` / … | |
| `ListFiles` / `ReadFile` / `WriteFile` | `list_files` / `read_file` / `write_file` | |
| `NewSession` | `new_session` | → `thread/start` |
| `ListSessions` | `list_sessions` | → `thread/list` |
| `GetSession` | `get_session` | → `thread/read` |
| `DeleteSession` | `delete_session` | → `thread/delete` |
| `ArchiveSession` / `UnarchiveSession` | `archive_session` / … | → `thread/archive` / … |
| `SendMessage` / `RunCodexTurn` | `send_message` | → `turn/start` |
| `InterruptSession` | `interrupt_session` | → `turn/interrupt` |
| `ResolveApproval` | `resolve_approval` | → `execCommandApproval/respond` etc. |
| `ListProviders` / `SaveProvider` / `ProbeProvider` | `list_providers` / … | |
| `ListMCPServers` / `SaveMCPServer` / `TestMCPConnection` / `SetMCPServerEnabled` | `list_mcp_servers` / … | |
| `ListSkills` / `ReloadSkills` | `list_skills` / `reload_skills` | |
| `ListPluginEntries` / `SetPluginEnabled` | `list_plugins` / `set_plugin_enabled` | |
| `OpenShell` / `WriteShell` / `ReadShell` / `CloseShell` | `open_shell` / … | |
| `GitStatus` | `git_status` | |
| `GetRuntimeEvents` | `get_runtime_events` | → `thread/timeline` |
| `ListAgentTools` | `list_agent_tools` | |
| `RpcRaw` | `rpc_raw` | Escape hatch for any method |

### rpc_raw fallback

Methods without a dedicated Tauri command use `rpc_raw` with the official app-server method name:

| App method | rpc_raw method |
|-----------|---------------|
| `DiscoverProviderModels` | `model/list` |
| `GetSkillDetail` | `skills/get` |
| `SetSkillEnabled` | `skills/setEnabled` |
| `GitBranchList` | `git/branchList` |
| `GitLog` | `git/log` |

### Structured error stubs

Go-only features return `{ __unimplemented: true, method, reason }` or empty arrays so the UI degrades gracefully:

- Browser: `GetBrowserStatus`, `BrowserNavigate`, `BrowserEvaluate`, `BrowserScreenshot`, `BrowserSnapshot`, `BrowserVersion`, `ClearBrowserData`, `OpenManagedBrowser`, `ListBrowserTargets`, `AddSitePermission`, `RemoveSitePermission`
- LSP: `LSPStartServer`, `LSPStopServer`, `LSPCompletion`, `LSPDefinition`, `LSPDiagnosticsFor`
- Snapshots: `ListSnapshots`, `CreateSnapshot`, `DeleteSnapshot`, `RestoreSnapshot`
- Hooks: `ListHooks`, `SaveHook`, `DeleteHook`, `TestHook`
- Memory: `ListMemoryItems`, `SaveMemoryItem`, `DeleteMemoryItem`
- Scheduled: `ListScheduledTasks`, `SaveScheduledTasks`, `RunScheduledTask`
- Automations: `ListAutomations`, `SaveAutomation`, `DeleteAutomation`, `RunAutomationNow`, `ListAutomationRuns`
- PRs: `ListPullRequests`, `SavePullRequests`
- Notifications: `ListNotifications`, `SendTestNotification`
- SSH: `ListConnections`, `SaveConnections`, `TestSSHConnection`
- Projects: `ListProjects`, `AddProject`, `DeleteProject`
- Worktrees: `RefreshWorktrees`
- Other: `CompactSession`, `Interrupt`, `ResizeShell`, `ExportSettingsToFile`, `ImportSettingsFromFile`, `PickPetSpritesheet`, `OpenPetsFolder`

## Event System

### Wails → Tauri event shim

`installBridge()` creates `window.runtime` with:

| Wails API | Tauri equivalent |
|-----------|-----------------|
| `EventsOn(name, cb)` | `listen(name, cb)` |
| `EventsOnMultiple(name, cb, max)` | `listen(name, cb)` (max ignored) |
| `EventsOff(name)` | unlisten all for name |
| `EventsEmit(name, data)` | `window.dispatchEvent(CustomEvent)` |

### codex:* → agent:* mapping

The Rust event bridge emits `codex:{method}` (with `/` → `.`). `bridge.js` maps these to the `agent:*` CustomEvents that `agent-events.js` expects:

| Tauri event | agent:* CustomEvent | Notes |
|-------------|---------------------|-------|
| `codex:agent.event` | `agent:event` | Primary agent events |
| `codex:agent.runtime` | `agent:runtime` | Runtime/tool events |
| `codex:agent.plan_mode` | `agent:plan_mode` | Plan mode toggle |
| `codex:agent.question` | `agent:question` | Ask-user questions |
| `codex:approval` | `agent:event` (type=approval) | Wrapped as approval event |
| `codex:user-input` | `agent:question` | User input requests |
| `codex:turn.completed` | `agent:runtime` (type=turn.completed) | |
| `codex:turn.failed` | `agent:runtime` (type=turn.failed) | |
| `codex:turn.cancelled` | `agent:runtime` (type=turn.cancelled) | |
| `codex:tool.started` | `agent:runtime` (type=tool.started) | |
| `codex:tool.completed` | `agent:runtime` (type=tool.completed) | |
| `codex:turn.state_changed` | `agent:runtime` (type=turn.state_changed) | |
| `codex:rpc-event` | `agent:runtime` | Generic RPC fan-out |

### OnAgent* callback bridges

The `OnAgentEvent(cb)`, `OnAgentRuntime(cb)`, `OnAgentPlanMode(cb)`, `OnAgentQuestion(cb)` methods register `window.addEventListener` handlers for the corresponding `agent:*` CustomEvents. This satisfies the `typeof api.OnAgentEvent === "function"` check in `agent-events.js`.

## Engine method names (codex-app-server v0.154.0)

| Purpose | RPC method |
|---------|-----------|
| Create thread | `thread/start` |
| List threads | `thread/list` |
| Read thread | `thread/read` |
| Delete thread | `thread/delete` |
| Archive thread | `thread/archive` |
| Unarchive thread | `thread/unarchive` |
| Start turn | `turn/start` |
| Interrupt turn | `turn/interrupt` |
| Exec approval | `execCommandApproval/respond` |
| Patch approval | `applyPatchApproval/respond` |
| List providers | `modelProvider/list` |
| List models | `model/list` |
| List MCP servers | `mcp/listServers` |
| Enable MCP server | `mcp/setServerEnabled` |
| List skills | `skills/list` |
| List plugins | `plugin/list` |
| Open shell | `shell/open` |
| Write shell | `shell/write` |
| Git status | `git/status` |
| Thread timeline | `thread/timeline` |
| List tools | `tools/list` |
| Config get/update | `config/get` / `config/update` |

## UI adaptation notes

1. **Sessions list**: `bootstrap.js refreshState()` reads `snap.sessions`. The composite GetState populates this from `list_sessions`. Session objects from the engine may have a different shape than Go's `store.Session` — the UI uses optional chaining (`s?.id`, `s?.archived`) so missing fields degrade gracefully.

2. **Providers**: Engine `modelProvider/list` returns provider configs. The UI's settings page reads `store.providers`. If the engine is offline, providers is `[]` and the settings page shows empty state.

3. **MCP servers**: Engine `mcp/listServers` returns server entries. `SetMCPServerEnabled` in Wails took `(bool)`; the Tauri version takes `(name, enabled)`. The bridge handles both signatures.

4. **Running state**: `IsSessionRunning` checks `get_session` for `runtime.status === "running"`. The poll loop in `agent-events.js` calls this every 500ms.

5. **Engine offline**: All engine calls fail soft. The UI boots, shows local settings/pets/calendar, and displays empty session list. The `check_dependencies` command reports `codex-app-server` as not connected.
