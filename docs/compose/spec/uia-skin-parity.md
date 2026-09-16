---
feature: uia-skin-parity
status: designed
updated: 2026-09-16
branch: feat/uia-skin-parity
commits: 5cf0bba..5cf0bba
---

# UIA Skin Parity (Design Tokens + Components + IPC)

## Report

## [S1] Problem

UIA control trees only prove **what controls exist** (hierarchy, text, basic state). They carry **zero CSS**: no colors, borders, shadows, popup direction, iconography, or native window-menu chrome. Aligning only the UIA skeleton leaves the Tauri shell looking wrong: native `<select>` arrows, fake in-page MenuBar, inconsistent spacing, and business pages (scheduled / plugins / PR / MCP approval / model panel) that do not stay wired after route switches.

User constraints (from 要求与反馈.txt + grill):
1. No screenshots as reference; UIA text metadata only for structure; visual skin must be **explicitly designed** as tokens.
2. Development order: style baseline → component library → backend business.
3. No local `tauri dev`; verification is syntax/smoke + GitHub Actions cloud build.
4. Every agent output must include a change note.
5. **CSS must not invent color values** — component CSS only references defined `--token-*` / official CSS variables. No `#rrggbb` literals in component code (official-tokens.css / tokens.css may define the variables from CDP).
6. **Every new JS function needs a minimal comment**; every commit needs a `change-note` (commit body or `docs/compose/change-notes/<slug>.md`).
7. **If GitHub Actions Windows build fails, pause the branch work and roll back the last commit** — do not stack more fixes on a red CI.

## [S2] Design

### S2.1 Cognitive contract

- UIA tree = **skeleton only**. Skin comes from a global Design Token + CSS Reset layer.
- Existing CDP-resolved values in `docs/official-ui/` and `frontend/src/styles/official-tokens.css` are the **only** allowed color/geometry source (do not invent hex).
- Native HTML controls that reintroduce UA chrome are forbidden for ComboBox-style UI.

### S2.2 Agent A — Design Token + CSS Reset baseline

**Scope files (exclusive):**
- `frontend/src/styles/reset.css` (strengthen)
- `frontend/src/styles/tokens.css` (normalize to official tokens)
- `frontend/src/styles/official-tokens.css` (extend if needed; keep CDP hex)
- `frontend/src/styles/controls.css` (**new** — native-control kill + popover primitives)

**Contracts:**
- Force-reset: `button, input, select, textarea` strip UA borders/arrows/box-shadows; focus uses `--accent-ring` only.
- Explicit ban: `select { appearance: none }` globally; any remaining `<select>` is transitional until Agent B replaces it.
- Define spacing scale (4/8/12/16/24/32), divider, elevation shadow, popover placement (anchor-bottom-start, flip-top when overflow).
- Popover primitive: `.ui-popover` with `role="listbox"`, keyboard Esc/Enter, click-outside, max-height scroll.
- No business interaction logic.

**Acceptance:** no UA default border/arrow on native controls; popover CSS usable without JS; all pages inherit via existing stylesheet links.

### S2.3 Agent B — UIA → component mapping

**UIA type → frontend component:**

| UIA | Rule |
|-----|------|
| MenuBar (文件/编辑/视图/帮助) | **Remove fake DOM menus**. Wire Tauri **native window menu** in Rust; frontend only receives menu action events. |
| ComboBox | Custom `.ui-popover` listbox. **Forbidden: native `<select>`**. Replace all `settings.js` selects (general/theme fonts/etc.). |
| Toggle (sidebar expand) | Bind `body.sidebar-collapsed` / state; persist via settings. |
| Icons | Lucide-style stroke SVG (inline, 18/20px). No emoji. |
| Pet page text | Ensure UTF-8; purge mojibake from comments/strings (`bridge.js` garbled comments). |

**Scope files:**
- `frontend/src/index.html` (drop desktop-menu-bar triggers)
- `frontend/src/js/shell.js` (native menu action bridge only)
- `frontend/src/js/settings.js` (select → custom dropdown)
- `frontend/src/js/ui-controls.js` (**new** shared dropdown/popover helper)
- `frontend/src/js/icons.js` (**new** Lucide-path set)
- `src-tauri/src/menu.rs` (**new** or in `lib.rs`) — Tauri Menu + MenuEvent
- `src-tauri/src/lib.rs` — register menu
- `frontend/src/js/bridge.js` — map menu events; **rewrite garbled comment blocks as clean English/Chinese**

**Acceptance:** `rg '<select' frontend/src` empty after B; no `desktop-menu-trigger` in HTML; native menu exists in Rust and emits `menu:{action}`; pet/settings strings are valid UTF-8.

### S2.4 Agent C — IPC + business pages

Wire, with **frontend state first** then backend:

1. **Scheduled tasks** — `discovery.js` uses real `ListScheduledTasks` / `SaveScheduledTasks` / `RunScheduledTask` via bridge; local store or Tauri command if engine lacks method (fail-soft).
2. **Plugins** — settings plugins tab + discovery plugins list: `list_plugins` / `set_plugin_enabled` already exist; ensure refresh after toggle and after route change.
3. **Pull requests** — page loads from store/engine stub; empty state matches UIA; no crash if unimplemented.
4. **MCP approval dialog** — when `codex:approval` / `codex:user-input` arrive, show in-app modal (not only toast): Accept / Decline / Accept for session → `resolve_approval`. Modal uses Agent A popover/modal tokens.
5. **Model config panel** — model menu + intensity slider persist via SaveSettings; Settings→配置 approval policy stays 2-option (按请求/从不).
6. **Page-switch communication** — after `navigate()`, re-subscribe agent events if needed; refreshState on view enter for scheduled/plugins/PR; no dead invoke after hash change.

**Scope files:**
- `frontend/src/js/discovery.js`
- `frontend/src/js/agent-events.js`
- `frontend/src/js/bridge.js` (scheduled/PR methods real or structured stub)
- `frontend/src/js/home.js` (approval modal mount if needed)
- `frontend/src/js/modal.js` (**new**)
- `src-tauri/src/commands/scheduled.rs` (**new** optional local cron store) if engine has no scheduled API
- `src-tauri/src/lib.rs` + `commands/mod.rs`

**Acceptance:** switching home ↔ scheduled ↔ plugins ↔ PR does not drop event listeners; approval events open a dismissible modal that calls `resolve_approval`; plugins toggle refreshes list; scheduled list paints from store without throw.

### S2.5 Agent D (orchestrator, not a separate user task this round)

- Integrate A+B+C, run verification, review, finalize this doc, push branch, rely on `.github/workflows/build-windows.yml` for cloud Tauri build.

## [S3] Out of Scope

- Screenshots / pixel-diff / Playwright visual gates.
- Local `tauri dev` / local full Rust compile if toolchain missing.
- Rewriting codex-core / linking official monorepo.
- Implementing Browser / LSP / SSH backends.
- Changing GitHub Actions workflow unless build is broken by our changes.
- Official onboarding wizard screens.

## Tasks

- [ ] T1: Design Token + CSS Reset + controls.css primitives — acceptance: reset kills UA chrome; `.ui-popover` styles exist; official hex only (covers: S2.2)
- [ ] T2: Shared ui-controls.js + Lucide icons.js — acceptance: dropdown helper open/close/keyboard; icons module exports used nav icons (covers: S2.3; depends: T1)
- [ ] T3: Replace settings native selects with custom dropdowns — acceptance: no `<select>` in frontend/src (covers: S2.3; depends: T2)
- [ ] T4: Tauri native MenuBar + remove fake DOM menu — acceptance: Rust Menu registered; HTML has no desktop-menu-trigger; actions emit menu events (covers: S2.3)
- [ ] T5: Sidebar toggle persistence — acceptance: expand/collapse reflects in body class + settings (covers: S2.3; depends: T1)
- [ ] T6: Fix mojibake / pet-page UTF-8 — acceptance: bridge.js comments readable; no U+FFFD in src (covers: S2.3)
- [ ] T7: Scheduled + Plugins + PR IPC/state + page-switch refresh — acceptance: discovery pages paint and refresh after navigate (covers: S2.4; depends: T2)
- [ ] T8: MCP approval modal + resolve_approval — acceptance: approval event opens modal; accept/decline invokes IPC (covers: S2.4; depends: T1)
- [ ] T9: Model panel / intensity persistence already present — acceptance: SaveSettings round-trip keeps modelReasoningEffort (covers: S2.4)
- [ ] T10: Closed-loop verify (node --check + smoke script + CI-ready) — acceptance: all checks PASS recorded (covers: S2.5)
