# UI parity — CDP dynamic extract

## Harness

- Electron 42.3.0 at `C:\Users\Administrator\Desktop\codex-cdp-harness`
- Loads `codex-asar-extract\webview\cdp-dump.html` (official `app-*.css` only)
- CDP `127.0.0.1:9222`
- Official Store app cannot open CDP (MSIX); this is the dynamic path

## Resolved runtime values (CDP)

| Token | Light | Dark |
|-------|-------|------|
| surface | `#ffffff` | `#181818` |
| sidebar | `#f9f9f9` | `#000000` |
| text emphasis | `#1a1c1f` | `#dfdfdf` |
| gray-1000 | `#0d0d0d` | `#ffffff` |
| ring | `#339cff` | (blue-400 chain) |
| toolbar-sm | 36px | 36px |
| sidebar width | 275px | 275px |
| composer radius | 22px | 22px |
| radius-lg / md | 12.5px / 10px | same |
| font-openai-sans | OpenAI Sans + system stack | same |

Artifacts: `cdp-dump.json` (2068 sheet vars), `cdp-resolved.json`.

## Product mapping

`frontend/src/styles/official-tokens.css` now uses **resolved hex** from CDP (not guesses).

## Still open

- Full official app shell (Electron chrome) vs our Tauri chrome
- Onboarding wizard screens
- Hover/active duals beyond primary
- Playwright pixel gates
