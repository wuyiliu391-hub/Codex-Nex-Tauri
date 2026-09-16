# Agent A — Design Token + CSS Reset

**Date:** 2026-09-16  
**Scope:** S2.2 / T1  
**Branch:** feat/uia-skin-parity (worktree uia-skin-parity)

## Files changed

| File | Action |
|------|--------|
| `frontend/src/styles/reset.css` | Strengthened; hex removed |
| `frontend/src/styles/tokens.css` | Normalized to `--official-*`; aliases added |
| `frontend/src/styles/official-tokens.css` | CDP hex only on `--official-*`; invented accent removed |
| `frontend/src/styles/controls.css` | **Created** — UIA primitives |
| `verify-agent-a-hex.cjs` | **Created** — ownership hex audit |
| `docs/compose/change-notes/agent-a-design-tokens.md` | This note |

## What changed

### reset.css
- `button, input, select, textarea, optgroup, option`: UA border/background/box-shadow/appearance stripped (kept + reinforced).
- Global `select { appearance: none }` + `select::-ms-expand { display: none }` (transitional until Agent B removes native selects).
- `:focus-visible` outline uses **`var(--accent-ring)` only** (official ring `#339cff` via tokens). Removed light/dark focus hex duals.
- Removed all `#hex` / rgba hex fallbacks from reset (placeholder, hr, selection, scrollbar). Values come from tokens.
- Print rule uses system `CanvasText` instead of `#000`.

### tokens.css
- Matched CDP values now **consume** `--official-*` instead of re-stating hex:
  - surfaces → `var(--official-surface)` / `var(--official-sidebar)`
  - ink / primary text → `var(--official-text-emphasis)`
  - accent/ring/brand → `var(--official-ring)`
  - light + dark gray scales that match CDP → `var(--official-gray-*)`
  - elevations → `var(--official-elevation-stroke)` / `var(--official-elevation-prominent)`
- Added semantic aliases (var() only):
  - `--accent-ring: var(--official-ring)` (root + dark)
  - `--spacing-token-1|2|3|4|6|8` → `--space-1..8` (4/8/12/16/24/32)
  - `--divider: var(--border-default)`
- Pre-existing semantic/button/composer hex retained (token definition file; still CDP/legacy parity, not component invent).

### official-tokens.css
- **Removed invented hex** not from CDP:
  - `--accent: #2563eb` / `#0ea5e9` → `var(--official-ring)`
  - `--accent-soft` → `color-mix(..., var(--official-ring) ...)`
  - dark `--bg-elevated: #1c1c1c` → `var(--official-gray-150)` (CDP dark gray-150)
- Added CDP elevation defs: `--official-elevation-stroke`, `--official-elevation-prominent`.
- `--accent-ring` now set in both light and dark blocks.
- Hex remains **only** on `--official-*` custom properties.

### controls.css (new)
Styles via existing tokens only (no hex, no business JS):

- `.ui-button` (+ `--primary`, `--ghost`)
- `.ui-input` (input/textarea)
- `.ui-toggle` (switch; `aria-checked` / `aria-pressed`)
- `.ui-popover` — absolute, `--elevation-menu` shadow, max-height + overflow scroll
- `.ui-listbox` / `.ui-option` — selected via `[aria-selected="true"]`
- Placement: `.ui-popover[data-placement="bottom-start"|"top-start"]`
- `select::-ms-expand { display: none }`

## Why

UIA trees carry no skin. Without a token-driven reset, native UA chrome (select arrows, default borders, focus rings) fights the official Codex look. Agent A freezes the visual source of truth so Agent B can swap ComboBox → custom popover and Agent C can style approval modal from the same vars.

## Verify

Command:

```powershell
node verify-agent-a-hex.cjs
```

Result (2026-09-16):

```
PASS  reset.css: 0 #hex literals
PASS  controls.css: 0 #hex literals
INFO  tokens.css: 191 #hex literals (allowed in token definitions)
INFO  official-tokens.css: 41 #hex literals (allowed in token definitions)
PASS  official-tokens.css: hex only on --official-* custom properties
RESULT: PASS (Agent A ownership)
```

Cross-check (`grep` tool): zero `#hex` matches in `reset.css` and `controls.css`.

Pre-existing hex in shell/components/home/settings/discovery/dark.css is **out of Agent A file ownership** and reported as INFO only.

## Residual / follow-up

1. **`controls.css` is not linked in `index.html` yet** (Agent A must not touch HTML). Orchestrator / Agent B should add after components.css:
   ```html
   <link rel="stylesheet" href="/styles/controls.css" />
   ```
2. Page CSS still has hex fallbacks — separate cleanup if strict “no hex outside token files” is required repo-wide.
3. Dark `--surface-sidebar-dark` now tracks CDP `#000000` via `var(--official-sidebar)` (was `#181818`); intentional parity with UI_PARITY.md.

## Contracts for later agents

- Focus rings: **only** `var(--accent-ring)`.
- Spacing: use `--spacing-token-1..8` (or `--space-*`).
- Popover elevation: `var(--elevation-menu)` / `var(--elevation-prominent-official)`.
- Never introduce `#hex` in component CSS; extend `official-tokens.css` `--official-*` or `tokens.css` semantic defs only when sourced from CDP docs.
