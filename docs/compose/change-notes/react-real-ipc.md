---
feature: react-real-ipc
status: delivered
updated: 2026-09-17
---

# Wire every React UI control to real Tauri IPC

## Rule

No mock data, no empty callbacks, no visual-only buttons. Controls either
invoke a registered Tauri command / plugin API, navigate, or open a real
dialog. DOM class names and CSS stay as the Wails baseline. Codex core
backend logic is untouched.

## What was wired

### Core shell
- Sidebar session rows → `setActiveSession` + `get_session` + `get_runtime_events`
- Project rows → `setActiveProject`; picker → `plugin:dialog|open`
- Composer project chip switches cwd; `#composer-add` → dialog → `send_message(attachments)`
- `saveSettings` engine dual-write uses official `config/batchWrite` `{edits, reloadUserConfig}`
- Prompt cards fill Composer via controlled `setText` (not DOM poke)
- `new-task` / `new-projectless-task` reset turn + session (and project)
- Keyboard dispatcher mounted; engine_status stored

### Settings
- Pets: `list_pets` / `wake_pet` / `tuck_pet` / `create_custom_pet`
- MCP: `save_mcp_server` / `set_mcp_server_enabled` / `test_mcp_connection`
- Plugins: `set_plugin_enabled`
- Providers: `save_provider` / `probe_provider`
- Theme: persisted in appearance prefs + `applyTheme`
- Import: dialog + fs → real non-empty `batchWrite` (no empty stub)
- Shortcuts: `save_shortcuts`
- Worktrees pick root: `plugin:dialog|open` (not fake engine method)
- Environments add/remove via `save_preferences`
- Connections test surfaces probe result

### Discovery / approvals
- Scheduled: `run_scheduled_task` / `save_scheduled_tasks`
- Plugins toggle: `set_plugin_enabled`
- Approval unhandled / empty user-input: real `respond_server_request` decline

## Intentionally still local
- Pure UI toggles (proc expand, zoom, fullscreen)
- Preference-only tabs (browser/voice/git/appshot) persist via real `save_preferences` but have no dedicated engine commands
- `new-window` / terminal UI / notifications inbox have no backend surfaces yet (menu items reduced or honest)

## Verification
- `npm run typecheck` PASS
- `npm run build` PASS
- Independent inventory + re-review completed
- **Not pushed** for remote compile (per task instruction)

## Related
- sqlx migration dirs restored separately (`6faaf4b6`) for CI compile
