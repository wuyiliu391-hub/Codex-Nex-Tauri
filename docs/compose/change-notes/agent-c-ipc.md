# Agent C — IPC + business pages

**Date:** 2026-09-16  
**Scope:** S2.4 / T7 / T8  
**Branch:** feat/uia-skin-parity (worktree uia-skin-parity)

## Files changed

| File | Action |
|------|--------|
| `frontend/src/js/modal.js` | **Created** — token modal (`openModal`) |
| `frontend/src/js/agent-events.js` | Approval / user-input → modal + `ResolveApproval` |
| `frontend/src/js/bridge.js` | Scheduled / PR local store; `ResolveApproval` sessionScope; `ListPlugins` |
| `frontend/src/js/discovery.js` | Bridge-backed scheduled / plugins / PR refresh |
| `docs/compose/change-notes/agent-c-ipc.md` | This note |

## What changed

### modal.js
- `openModal({ title, body, actions, dismissible, onClose })` — Esc + backdrop close.
- Buttons use `.ui-button` / `.ui-button--primary` / `.ui-button--ghost`.
- Styles injected once via `#ui-modal-styles`; **no new `#hex`** — only `--surface-overlay-*`, `--semantic-dropdown-menu-surface-*`, `--elevation-toast`, spacing/radius/type tokens.
- `closeAllModals()` for bulk dismiss.

### agent-events.js (MCP approval)
- `showApproval` now opens a modal with **Decline / Accept for session / Accept**.
- Calls `api.ResolveApproval(requestId, approved, kind, sessionScope)` → Tauri `resolve_approval` → official `{ decision: accept|decline|acceptForSession }`.
- Request id from `{id,method,params}` (`codex:approval` fan-out) or legacy `approveId`.
- Non-pending status dismisses the modal.
- `agent:question` with a JSON-RPC `id` opens `showUserInputModal` (user-input / elicitation).
- `store.pendingApproval` kept in sync for Ctrl+Enter / Esc shortcuts.
- `wireAgentEvents` still once-guarded (`wired`) — no double-subscribe on route change.

### bridge.js
- `ResolveApproval` forwards optional `sessionScope`.
- `ListScheduledTasks` / `SaveScheduledTasks` — try Tauri `list_scheduled_tasks` / `save_scheduled_tasks`, else **localStorage** (`codex.scheduledTasks`) with three seed tasks.
- `RunScheduledTask` / `RunScheduled` — try `run_scheduled_task`, else emit `codex:scheduled-run` (fail-soft stub).
- `ListPullRequests` / `SavePullRequests` — same pattern (`codex.pullRequests`).
- `ListPlugins` alias → `list_plugins` (kept `ListPluginEntries`).
- Composite `GetState` now returns `scheduled` + `pullRequests` (engine offline → seeds / `[]`).

### discovery.js
- **Scheduled:** paints from `store.scheduled`; re-fetches `ListScheduledTasks` on route enter and `codex:refresh`; Run button → `RunScheduledTask`.
- **Plugins:** `ListPlugins`/`SetPluginEnabled`; `.ui-toggle` switch; toggle → IPC → re-list → repaint.
- **Pull requests:** `ListPullRequests` fail-soft; list cards when present; UIA empty state + re-check button otherwise.
- All three re-paint on navigate + `codex:refresh` + language change.

## Intentionally not done
- No `src-tauri/src/commands/scheduled.rs` — localStorage covers persist; Rust command only if a future engine API lands.
- `home.js` untouched — modal mounts on `document.body`; no home mount hook required.
- `installBridge` / `wireAgentEvents` not re-run on hash change (by design).

## Verify
- `node --check` on modal.js, agent-events.js, bridge.js, discovery.js
- `rg ResolveApproval` / `openModal` / `ListScheduledTasks` proof
