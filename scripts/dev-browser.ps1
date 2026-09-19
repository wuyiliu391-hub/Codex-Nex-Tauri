# Browser dev launcher: starts the Vite dev server in browser-bridge mode.
#
# The self-developed kernel is in-process, so there is NO engine to launch and
# no WebSocket port to wait for. `npm run dev:browser` aliases the Tauri API
# onto `frontend/app/devbridge/*`, which replays the command surface locally
# (see docs/BROWSER-DEV.md).
#
# This script used to start the official codex-app-server sidecar and wait for
# port 17457; that whole step is gone with the sidecar.
$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot

if ($env:CODEX_APP_SERVER_WS -or $env:CODEX_APP_SERVER) {
    Write-Host "note: CODEX_APP_SERVER* env vars are ignored — there is no external engine." -ForegroundColor Yellow
}

Push-Location (Join-Path $root "frontend")
try {
    Write-Host "starting vite in browser-bridge mode (no engine needed)..." -ForegroundColor Cyan
    npm run dev:browser
} finally {
    Pop-Location
}
