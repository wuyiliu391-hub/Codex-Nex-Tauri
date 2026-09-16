$ErrorActionPreference = "Stop"
# Cloud/dev build helper. Requires Rust + Tauri CLI on PATH.
Set-Location $PSScriptRoot\..

$sidecar = "src-tauri\binaries\codex-app-server-x86_64-pc-windows-msvc.exe"
if (-not (Test-Path $sidecar)) {
  Write-Warning "Sidecar missing: $sidecar (engine will be offline until provided)"
}

Push-Location src-tauri
try {
  cargo check --message-format=short
  if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
  cargo tauri build
} finally {
  Pop-Location
}

Write-Host "Done. See src-tauri\target\release\"
