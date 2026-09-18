# Official Codex CDP notes (Windows Store / MSIX)

## Status

- Store package launches via AUMID `OpenAI.Codex_2p2nqsd0c76g0!App` successfully.
- Direct `Start-Process` on `WindowsApps\...\ChatGPT.exe` → **Access denied**.
- `explorer.exe <exe> --remote-debugging-port=9222` launches the app but **does not open 9222**.
- Production Owl/Electron build likely **disables remote debugging** unless a debug fuse / env is present.

## Fallback (used)

1. **Static**: asar extract + CSS variable scrape (`css-vars-root.json`).
2. **Semi-dynamic**: load official `app-*.css` (and fonts) in Playwright/Chromium or a local static page; dump `getComputedStyle` / resolved tokens without the real IPC layer.
3. **True CDP** requires either:
   - unpackaged Electron rebuild of the same renderer (heavy),
   - or a debug-enabled Owl shell (not available in Store package).

## Paths

- Extract: `C:\Users\Administrator\Desktop\codex-asar-extract\webview`
- Main CSS: `webview/assets/app-dddf03d14541.css` (~820KB)
- Fonts: `OpenAISans-*.woff2`, `carlito-*.woff2`
