# Official Codex Semantic UI Tokens

Generated: 2026-09-16T05:56:55.731Z
Source CSS: `app-dddf03d14541.css`, `app-primary-42ed0a4bb496.css`, `app-initial-a09fe9cd72bc.css`
Assets dir: `C:\Users\Administrator\Desktop\codex-asar-extract\webview\assets`

| Metric | Count |
| --- | ---: |
| Total CSS custom props scanned | 2034 |
| Semantic tokens extracted | 422 |
| Theme blocks | 405 |
| OpenAI/Carlito @font-face | 2 |
| Layout rules (composer/sidebar/toolbar) | 237 |

## High-priority tokens (official → Codex-Tauri)

| Official var | Official value | Dark override | Suggested Codex-Tauri token |
| --- | --- | --- | --- |
| `--color-surface` | `var(--app-color-background-surface)` | `—` | --surface-app-* |
| `--color-surface-elevated` | `var(--vscode-menu-background)` | `—` | --surface-elevated-* |
| `--color-surface-elevated-secondary` | `var(--vscode-dropdown-background)` | `—` | --surface-elevated-* / composer elevated |
| `--color-surface-secondary` | `var(--vscode-sideBar-background)` | `—` | --surface-panel-muted-* |
| `--color-surface-tertiary` | `var(--vscode-editor-background)` | `—` | --surface-panel-muted-* |
| `--color-text` | `var(--vscode-foreground)` | `—` | --fg-primary / --text-primary-* |
| `--color-text-primary` | `var(--color-text-emphasis)` | `—` | --text-primary-* |
| `--color-text-secondary` | `var(--app-color-text-secondary,color-mix(in srgb, var(--vscode-foreground) 65%, transparent))` | `—` | --text-secondary-* |
| `--color-text-tertiary` | `var(--vscode-descriptionForeground)` | `—` | --text-tertiary-* |
| `--color-text-emphasis` | `var(--vscode-list-activeSelectionForeground,var(--color-text))` | `—` | --text-primary-* (stronger) |
| `--color-text-inverse` | `var(--vscode-button-foreground)` | `—` | --text-on-dark-* |
| `--color-border` | `var(--app-color-border,color-mix(in oklab, var(--vscode-foreground) 8%, transparent))` | `—` | --border-default |
| `--color-border-subtle` | `var(--app-color-border-light,color-mix(in oklab, var(--vscode-foreground) 5%, transparent))` | `—` | --border-subtle-* / --border-light |
| `--color-border-strong` | `var(--app-color-border-heavy,color-mix(in oklab, var(--vscode-foreground) 12%, transparent))` | `—` | --border-heavy |
| `--color-token-main-surface-primary` | `var(--app-color-background-surface)` | `—` | --surface-app-* / --bg-canvas |
| `--color-token-side-bar-background` | `var(--vscode-sideBar-background)` | `—` | --surface-sidebar-* / --bg-sidebar |
| `--color-token-text-primary` | `var(--color-token-foreground)` | `—` | --fg-primary |
| `--color-token-text-secondary` | `color-mix(in srgb, var(--color-token-foreground) 65%, transparent)` | `—` | --fg-secondary |
| `--color-token-text-tertiary` | `var(--color-token-description-foreground)` | `—` | --fg-description / --fg-meta |
| `--color-token-border` | `var(--color-border,color-mix(in oklab, var(--vscode-foreground) 8%, transparent))` | `—` | --border-default |
| `--color-token-border-light` | `var(--app-color-border-light,color-mix(in oklab, var(--vscode-foreground) 5%, transparent))` | `—` | --border-light |
| `--color-token-border-heavy` | `var(--app-color-border-heavy,color-mix(in oklab, var(--vscode-foreground) 12%, transparent))` | `—` | --border-heavy |
| `--color-token-focus-border` | `var(--vscode-focusBorder)` | `—` | --focus-outline-color-* |
| `--color-background-composer-primary` | `var(--color-background-primary-solid)` | `—` | --semantic-composer-surface-* |
| `--color-background-user-message` | `color-mix(in oklab, var(--color-text) 5%, transparent)` | `—` | --surface-user-bubble-* |
| `--color-background-primary-solid` | `var(--vscode-foreground)` | `—` | --semantic-button-primary-surface-* |
| `--color-text-composer-primary` | `var(--color-text-primary-solid)` | `—` | --semantic-composer-button-text-* |
| `--color-codex-description` | `var(--vscode-descriptionForeground)` | `—` | --fg-description / --fg-meta |
| `--composer-adjacent-max-width` | `100%` | `—` | --composer-adjacent-max-width |
| `--composer-inline-overhang` | `calc(var(--spacing) * 6)` | `—` | --composer-inline-overhang |
| `--thread-content-max-width` | `none` | `—` | --thread-content-max-width |
| `--padding-toolbar` | `calc(var(--spacing) * 4)` | `—` | --padding-toolbar |
| `--height-token-empty-state-page` | `26.25rem` | `—` | --height-token-empty-state-page |
| `--radius-token-composer-single-line` | `calc(var(--spacing) * 5.5)` | `—` | --radius-token-composer-single-line |
| `--codex-corner-radius-scale` | `1` | `—` | --corner-radius-scale |
| `--codex-chat-font-size` | `var(--codex-chat-font-size-override,var(--font-ui-size,13px))` | `—` | --text-base / --text-md |
| `--font-ui-family` | `inherit` | `—` | --font-ui-family / --font-brand |
| `--font-code-family` | `inherit` | `—` | --font-code-family |
| `--font-sans` | `var(--font-ui-family,var(--font-sans-default))` | `—` | --font-sans |
| `--font-mono` | `var(--font-code-family,var(--font-mono-default))` | `—` | --font-mono |
| `--font-sans-default` | `-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif` | `—` | --font-sans (base stack) |
| `--font-mono-default` | `ui-monospace, "SFMono-Regular", "SF Mono", Menlo, Consolas, "Liberation Mono", monospace` | `—` | --font-mono (base stack) |
| `--spacing` | `.25rem` | `—` | --official-spacing / --space-1 |
| `--shadow-sm` | `0px 1px 2px -1px #00000014` | `—` | --shadow-sm-* (verify theme overlay) |
| `--shadow-md` | `0px 2px 4px -1px #00000014` | `—` | --shadow-md-* |
| `--shadow-lg` | `0px 4px 8px -2px #0000001a` | `—` | --shadow-lg-* |
| `--elevation-prominent` | `var(--elevation-stroke), 0 3px 7.5px #0000000a, 0 0 20px #0000000d` | `—` | — |
| `--app-color-background-surface` | `var(--color-surface-tertiary)` | `—` | — |
| `--app-color-text-foreground` | `var(--lightningcss-light,#1a1c1f)var(--lightningcss-dark,var(--gray-fixed-150))` | `—` | — |
| `--app-color-border` | `var(--lightningcss-light,color-mix(in oklab, var(--app-color-text-foreground) 8%, transparent))var(--lightningcss-dark,c` | `—` | — |
| `--app-shell-panel-background` | `transparent` | `—` | — |

## Categories

- **border**: 47 tokens
- **layout**: 50 tokens
- **radius**: 25 tokens
- **shadow**: 37 tokens
- **spacing**: 1 tokens
- **surface**: 58 tokens
- **text**: 126 tokens
- **typography**: 77 tokens

## Font faces (OpenAI Sans / Carlito)

- `OpenAI Sans` weight=400 style=normal
  - src: `url(./OpenAISans-Regular-c56711d328c4.woff2)format("woff2")`
- `OpenAI Sans` weight=500 style=normal
  - src: `url(./OpenAISans-Medium-7b9c963f9063.woff2)format("woff2")`

## Layout rule sample (composer / sidebar / toolbar)

```css
.heading-xl { font-size:var(--text-xl);font-weight:var(--font-weight-medium);line-height:1.2 }
```
```css
.heading-xl:where([data-codex-window-type=browser] .heading-xl) { font-size:var(--text-2xl) }
```
```css
.inset-x-\[var\(--composer-suggestion-inline-inset\)\] { inset-inline:var(--composer-suggestion-inline-inset) }
```
```css
.inset-x-\[var\(--home-composer-inline-inset\)\] { inset-inline:var(--home-composer-inline-inset) }
```
```css
.inset-x-button-toolbar-inline { inset-inline:var(--spacing-button-toolbar-inline) }
```
```css
.start-button-toolbar-inline { inset-inline-start:var(--spacing-button-toolbar-inline) }
```
```css
.-top-toolbar { top:calc(var(--inset-toolbar) * -1) }
```
```css
.top-\(--height-toolbar-sm\) { top:var(--height-toolbar-sm) }
```
```css
.top-\[calc\(var\(--sidebar-scroll-header-mask-start\)\+var\(--spacing\)\*1\.5\)\] { top:calc(var(--sidebar-scroll-header-mask-start) + var(--spacing) * 1.5) }
```
```css
.top-toolbar { top:var(--inset-toolbar) }
```
```css
.top-toolbar-sm { top:var(--inset-toolbar-sm) }
```
```css
.-mx-\(--padding-toolbar\) { margin-inline:calc(var(--padding-toolbar) * -1) }
```
```css
.-ms-\[calc\(var\(--spacing-button-toolbar-inline\)\+1px\)\] { margin-inline-start:calc(calc(var(--spacing-button-toolbar-inline) + 1px) * -1) }
```
```css
.ms-\[calc\(var\(--composer-suggestion-inline-inset\)-var\(--composer-inline-overhang\)\)\] { margin-inline-start:calc(var(--composer-suggestion-inline-inset) - var(--composer-inline-overhang)) }
```
```css
.me-\[calc\(var\(--composer-suggestion-inline-inset\)\+var\(--composer-inline-overhang\)\)\] { margin-inline-end:calc(var(--composer-suggestion-inline-inset) + var(--composer-inline-overhang)) }
```
```css
.-mt-\[var\(--sidebar-scroll-header-spacing\,8px\)\] { margin-top:calc(var(--sidebar-scroll-header-spacing,8px) * -1) }
```
```css
.mb-\[var\(--sidebar-footer-height\)\] { margin-bottom:var(--sidebar-footer-height) }
```
```css
.sidebar-item-icon { width:calc(var(--spacing) * 6);height:calc(var(--spacing) * 6);justify-content:center;align-items:center;display:flex }
```
```css
.sidebar-icon-button:focus-visible { --tw-ring-shadow:var(--tw-ring-inset,) 0 0 0 calc(2px + var(--tw-ring-offset-width)) var(--tw-ring-color,currentcolor);box-shadow:var(--tw-inset-shadow), var(--tw-inset-ring-shadow), var(--tw-ring-offset-shadow), var(--tw-ring-shadow), var( }
```
```css
.sidebar-icon-button { width:calc(var(--spacing) * 6);height:calc(var(--spacing) * 6);border-radius:var(--radius-md);corner-shape:var(--codex-corner-shape);padding:var(--spacing)!important }
```
```css
.size-token-button-composer { width:var(--spacing-token-button-composer);height:var(--spacing-token-button-composer) }
```
```css
.size-token-button-composer-sm { width:var(--spacing-token-button-composer-sm);height:var(--spacing-token-button-composer-sm) }
```
```css
.button-toolbar { height:var(--spacing-token-button-composer);padding-inline:var(--spacing-button-toolbar-inline) }
```
```css
.h-\(--thread-scroll-padding-bottom\) { height:var(--thread-scroll-padding-bottom) }
```
```css
.h-\[calc\(100\%_-_var\(--right-panel-composer-overlay-reserve\,0px\)\)\] { height:calc(100% - var(--right-panel-composer-overlay-reserve,0px)) }
```
```css
.h-\[calc\(var\(--spacing-token-button-composer\)\+6px\)\] { height:calc(var(--spacing-token-button-composer) + 6px) }
```
```css
.h-\[calc\(var\(--thread-scroll-padding-bottom\)-var\(--spacing\)\*4\)\] { height:calc(var(--thread-scroll-padding-bottom) - var(--spacing) * 4) }
```
```css
.h-token-button-composer { height:var(--spacing-token-button-composer) }
```
```css
.h-token-button-composer-sm { height:var(--spacing-token-button-composer-sm) }
```
```css
.h-toolbar { height:var(--height-toolbar) }
```
```css
.h-toolbar-pane { height:var(--height-toolbar-pane) }
```
```css
.h-toolbar-sm { height:var(--height-toolbar-sm) }
```
```css
.max-h-\[calc\(100dvh\/var\(--codex-window-zoom\)-var\(--height-toolbar\)-2rem\)\] { max-height:calc(100dvh / var(--codex-window-zoom) - var(--height-toolbar) - 2rem) }
```
```css
.min-h-\[var\(--height-token-empty-state-page\)\] { min-height:var(--height-token-empty-state-page) }
```
```css
.min-h-token-button-composer { min-height:var(--spacing-token-button-composer) }
```
```css
.min-h-token-button-composer-sm { min-height:var(--spacing-token-button-composer-sm) }
```
```css
.min-h-toolbar { min-height:var(--height-toolbar) }
```
```css
.min-h-toolbar-sm { min-height:var(--height-toolbar-sm) }
```
```css
.w-\[calc\(var\(--spacing-token-sidebar\)-2\*var\(--padding-row-cell-x\,var\(--padding-row-x\)\)\)\] { width:calc(var(--spacing-token-sidebar) - 2 * var(--padding-row-cell-x,var(--padding-row-x))) }
```
```css
.w-\[calc\(var\(--spacing-token-sidebar\)-2\*var\(--padding-row-x\)\)\] { width:calc(var(--spacing-token-sidebar) - 2 * var(--padding-row-x)) }
```
```css
.w-\[min\(100\%\,var\(--thread-content-max-width\)\)\] { width:min(100%, var(--thread-content-max-width)) }
```
```css
.w-token-button-composer { width:var(--spacing-token-button-composer) }
```
```css
.w-token-sidebar { width:var(--spacing-token-sidebar) }
```
```css
.max-w-\(--composer-adjacent-max-width\) { max-width:var(--composer-adjacent-max-width) }
```
```css
.max-w-\(--thread-content-max-width\) { max-width:var(--thread-content-max-width) }
```
```css
.max-w-\[var\(--thread-content-max-width\)\] { max-width:var(--thread-content-max-width) }
```
```css
.\[scroll-padding-bottom\:var\(--thread-scroll-padding-bottom\,0px\)\] { scroll-padding-bottom:var(--thread-scroll-padding-bottom,0px) }
```
```css
.gap-token-button-composer-gap { gap:var(--spacing-token-button-composer-gap) }
```
```css
.sidebar-item { border-radius:var(--radius-lg);corner-shape:var(--codex-corner-shape) }
```
```css
.rounded-button-toolbar { border-radius:var(--radius-button-toolbar) }
```
```css
.rounded-token-composer-single-line { border-radius:var(--radius-token-composer-single-line) }
```
```css
.composer-surface-chrome:where(:is([data-codex-window-type=browser],[data-codex-window-type=chrome-extension],[data-codex-window-type=electron]) .composer-surface-chrome) { box-shadow:var(--elevation-prominent);border-style:var(--tw-border-style)!important;border-width:0!important }
```
```css
.composer-surface-chrome:where([data-codex-window-type=extension] .composer-surface-chrome) { border-color:var(--color-token-input-border);--tw-shadow:0 4px 16px 0 var(--tw-shadow-color,#0000000d);box-shadow:var(--tw-inset-shadow), var(--tw-inset-ring-shadow), var(--tw-ring-offset-shadow), var(--tw-ring-shadow), var(--tw-shadow);bor }
```
```css
.bg-\[var\(--codex-titlebar-tint\,transparent\)\] { background-color:var(--codex-titlebar-tint,transparent) }
```
```css
.bg-composer-primary { background-color:var(--color-background-composer-primary) }
```
```css
.px-\(--padding-button-composer-inline\,calc\(var\(--spacing\)\*2\)\) { padding-inline:var(--padding-button-composer-inline,calc(var(--spacing) * 2)) }
```
```css
.px-\(--thread-content-margin\) { padding-inline:var(--thread-content-margin) }
```
```css
.px-\[var\(--home-composer-inline-inset\)\] { padding-inline:var(--home-composer-inline-inset) }
```
```css
.px-toolbar { padding-inline:var(--padding-toolbar) }
```
```css
.ps-token-sidebar { padding-inline-start:var(--spacing-token-sidebar) }
```
```css
.pe-\[calc\(\(var\(--spacing-token-button-composer\)-var\(--spacing\)\*5\)\/2-1px\)\] { padding-inline-end:calc((var(--spacing-token-button-composer) - var(--spacing) * 5) / 2 - 1px) }
```
```css
.pt-\(--height-toolbar\) { padding-top:var(--height-toolbar) }
```
```css
.pt-\(--thread-content-top-inset\) { padding-top:var(--thread-content-top-inset) }
```
```css
.pt-\[max\(calc\(var\(--spacing\)\*14\)\,var\(--right-panel-composer-overlay-top-reserve\,0px\)\)\] { padding-top:max(calc(var(--spacing) * 14), var(--right-panel-composer-overlay-top-reserve,0px)) }
```
```css
.pt-\[var\(--right-panel-composer-overlay-top-reserve\,0px\)\] { padding-top:var(--right-panel-composer-overlay-top-reserve,0px) }
```
```css
.pt-\[var\(--sidebar-scroll-content-top-padding\,var\(--sidebar-scroll-header-spacing\,8px\)\)\] { padding-top:var(--sidebar-scroll-content-top-padding,var(--sidebar-scroll-header-spacing,8px)) }
```
```css
.pb-\(--sidebar-scroll-header-spacing\) { padding-bottom:var(--sidebar-scroll-header-spacing) }
```
```css
.pb-\[calc\(var\(--right-panel-composer-overlay-reserve\,0px\)\+var\(--spacing\)\*6\)\] { padding-bottom:calc(var(--right-panel-composer-overlay-reserve,0px) + var(--spacing) * 6) }
```
```css
.pb-\[var\(--right-panel-composer-overlay-reserve\,0px\)\] { padding-bottom:var(--right-panel-composer-overlay-reserve,0px) }
```
```css
.text-\(length\:--text-button-composer\,var\(--text-sm\)\) { font-size:var(--text-button-composer,var(--text-sm)) }
```
```css
.leading-\(--line-height-button-composer\,18px\) { --tw-leading:var(--line-height-button-composer,18px);line-height:var(--line-height-button-composer,18px) }
```
```css
.sidebar-hover-icon-button-tint { color:var(--color-token-foreground)!important }
```
```css
.sidebar-hover-icon-button-tint:hover,.sidebar-hover-icon-button-tint:focus-visible { color:var(--color-token-foreground)!important }
```
```css
.sidebar-hover-icon-tint { color:var(--color-token-foreground) }
```
```css
.sidebar-hover-icon-tint:hover,.sidebar-hover-icon-tint:focus-visible { color:var(--color-token-foreground) }
```
```css
.\!text-composer-primary { color:var(--color-text-composer-primary)!important }
```
```css
.text-composer-primary { color:var(--color-text-composer-primary) }
```
```css
.sidebar-navigation { --height-token-mode-switch:32px;--height-token-nav-row:30px;--height-token-row:var(--height-token-nav-row);--padding-row-cell-x:8px;--padding-row-x:8px;--radius-token-row:10px }
```
```css
.sidebar-navigation:where([data-codex-window-type=browser] .sidebar-navigation) { --height-token-nav-row:36px;--padding-row-cell-x:10px;--padding-row-x:6px;--padding-row-y:6px;--text-base--line-height:var(--text-sm--line-height);--text-base:var(--text-sm) }
```
```css
.\[--padding-toolbar\:calc\(var\(--spacing\)\*2\)\] { --padding-toolbar:calc(var(--spacing) * 2) }
```

## Mapping notes for Codex-Tauri

1. Prefer semantic aliases already in `frontend/src/styles/tokens.css` (`--bg-canvas`, `--fg-primary`, `--semantic-composer-*`).
2. Do not copy the full 820KB app CSS; apply extracted values + targeted layout rules only.
3. Dark theme in Codex-Tauri uses `html.theme-dark`; official uses `.dark` / `data-theme`.
4. `--codex-corner-radius-scale` (1.25) multiplies base radii; Codex-Tauri already mirrors this via `--corner-radius-scale`.
5. Dynamic/hover/runtime states still require CDP capture against the live official app.
