# Agent B — UIA → Component Mapping

## Changes

### New files
- `frontend/src/js/icons.js` — Lucide-style path-only SVG strings (search, clock, plugin, git-pull-request, settings, help-circle, plus, chevron-down, check, panel-left, folder). Stroke currentColor. Exports `iconSvg(name, size, extraClass)`.
- `frontend/src/js/ui-controls.js` — `createDropdown({anchor, items, value, onSelect})` using `.ui-popover` / `.ui-listbox` / `.ui-option` classes. Keyboard Esc/Enter/ArrowUp/ArrowDown. Click-outside close. Fires `change` event on select so existing `[data-select]` listeners work.
- `src-tauri/src/menu.rs` — Tauri v2 native Menu with File/Edit/View/Help submenus matching former DOM menu. `on_menu_event` emits `menu` event with action id as payload.

### Modified files
- `frontend/src/index.html` — Removed fake `desktop-menu-bar` (File/Edit/View/Help triggers). Added `data-i18n-aria` to titlebar-sidebar button.
- `frontend/src/js/shell.js` — Removed all fake DOM menu code (MENUS structure, panelTemplate, relabelMenus, open/close handlers). Added `initNativeMenuListener()` that listens for Tauri `menu` events and dispatches `handleAction`. Added `toggleSidebar()` with `body.sidebar-collapsed` toggle + SaveSettings persistence. Wired `titlebar-sidebar` button.
- `frontend/src/js/settings.js` — Replaced `selectEl` to produce custom `button.ui-dropdown` with `data-select`/`data-value`/`data-options`. Added `initSelectDropdowns(root)` called from `wireInputs` and `showModal`. Replaced theme font `<select>` elements in `renderAppearance` with `themeFontSel()` custom dropdown buttons. Removed unused `fontOpts` function. No native `<select>` or `<option>` remain.
- `frontend/src/js/bridge.js` — Rewrote all mojibake comment blocks (27+ section headers) as clean `// ── Section ──` English comments. Fixed inline mojibake arrows in comments and console.log. No code logic changed.
- `src-tauri/src/lib.rs` — Added `mod menu;`, `.menu(|app| menu::build_menu(app))`, `.on_menu_event(menu::on_menu_event)`.

## Verification
- `node --check` passes on all 5 modified/created JS files.
- `rg '<select' frontend/src` = empty (PASS).
- No `desktop-menu-trigger` or `desktop-menu-bar` in index.html (PASS).
- No `<option` in settings.js (PASS).
- bridge.js mojibake = 0 remaining (PASS).

## Constraints honored
- No native HTML `<select>` for ComboBox — custom popover using `.ui-popover` classes.
- CSS: no new `#hex` added (icons.js/ui-controls.js use no CSS; controls.css is Agent A's file).
- Every new JS function has a `//` one-line comment.
- No screenshots.
- Files NOT edited: reset.css, tokens.css, official-tokens.css, controls.css, discovery.js, agent-events.js, modal.js.
- bridge.js only edited for comment cleanup (no logic changes).
