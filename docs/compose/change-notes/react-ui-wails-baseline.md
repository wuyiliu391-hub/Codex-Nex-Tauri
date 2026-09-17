---
feature: react-ui-wails-baseline
status: delivered
updated: 2026-09-17
---

# Restore React UI to the old Wails CSS baseline

## Why

The React migration replaced the rendering layer but invented DOM wrappers and
class names (`.turn-stream-view`, `.block`, `.settings-nav`, `.home-hero-icon`)
that no stylesheet targets. Combined with missing `body.settings-open` /
appearance wiring, the shell looked worse than the pre-React Wails build even
though the full old CSS suite was already imported.

## Constraints honored

- Keep every old class name and DOM hierarchy the CSS was written against.
- Do not invent new Design Tokens; reuse `tokens.css` / `official-tokens.css`.
- Convert post-mount `classList` writes into React conditional `className`.
- Do not touch Codex backend Agent logic.

## Changes

### DOM contract restores

| File | Fix |
|------|-----|
| `blocks/registry.tsx` | Rewrite renderers to emit `.message-row` / `.message-body` / `.part-text` / `.proc-line.is-*.kind-*` / `.diff-card` / `.plan-list` — the exact `render.js` contract `home.css` styles. Port `renderGroupedProcess` as `groupProcessItems` + `ProcGroup`. |
| `TurnStream.tsx` | Drop invented wrappers; stream items via `groupProcessItems` so consecutive done tools collapse into `.proc-line.is-group`. |
| `HomeView.tsx` | Use `.home-hero` (not `.home-hero-icon`); drop extra loading/no-projects boxes that vanilla never rendered here. |
| `SettingsShell.tsx` | Match `settings.js` shell: `.settings-sidebar-head` + `.settings-back` + `.settings-search`, `.settings-links` / `.settings-group-label` / `.settings-link .ico`. |
| `AppShell.tsx` | Settings is a **sibling** of `.main` inside `#app` (shell.css hides both when `body.settings-open`). Sync `body.sidebar-collapsed`. |
| `Composer.tsx` | Project / permission / model pills use vanilla inner DOM (`.proj-icon`, `.proj-name`, `.permission-hand`, `.chevron`) via Dropdown `children`. |
| `Sidebar.tsx` | Drop unused `.is-collapsed` on the aside — collapse is `body.sidebar-collapsed` only. |

### Tool grouping (render.js `renderGroupedProcess`)

`groupProcessItems` walks the stream:
- active tools (`running` / `waiting_approval` / `error` / `denied`) stay alone
- consecutive finished tools of the same `classifyTool` kind collapse
- a run of length 1 stays a single `.proc-line`

`ProcGroup` emits:
```
.proc-line.is-done.kind-*.is-group
  .proc-head > .proc-label + .proc-chevron
  .proc-body > .proc-line.proc-sub …
```
Labels: `process.ranCommands` / `createdFiles` / `readFiles` / `ranTools`.

### Layout glue for the React mount

- `shell.css`: `#root { display: contents }` so `.app-toolbar` / `#app` still
  participate in the body grid.
- Child selectors that assumed `body > #app` were relaxed to descendants
  (`body.settings-open .sidebar`).
- `index.html` splash rules use descendant selectors for the same reason.

### Appearance + router body classes

- New `state/appearance.ts`: port of vanilla `applyTheme` / `applyAppearanceVars`
  (theme class, type ladder, fonts, accent, sidebar/contrast/motion datasets).
- `useRoute.installRouter` toggles `body.settings-open` on hash change.
- `preferencesStore.subscribe` exported so appearance stays in sync.

### Dynamic classes → React conditionals

- `Composer`: `is-multiline` is React state, not `classList.toggle`.
- All other active/open classes use `className={`…${cond ? " is-x" : ""}`}`.
- Document-level classes (`body.settings-open`, `body.sidebar-collapsed`,
  `html.theme-*`) stay imperative — the CSS is written against `body`/`html`.

## Verification

- `npm run typecheck` — PASS
- `npm run build` — PASS (100 modules)
- `node scripts/check-frontend.mjs` — PASS (14 ts, 38 tsx, 175 imports)
- `node verify-agent-a-hex.cjs` — PASS
- `node scripts/verify-notification-coverage.mjs` — 83/83

## Not in this change

- No Design Token rewrite (official CDP tokens stay as-is).
- No backend / Agent logic changes.
