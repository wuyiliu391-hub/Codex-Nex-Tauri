$ErrorActionPreference = "Stop"
# Cloud/dev build helper. Requires Rust + Tauri CLI on PATH.
# Product output: flat installers under dist/ (self-contained NSIS/MSI).
Set-Location $PSScriptRoot\..

$sidecar = "src-tauri\binaries\codex-app-server-x86_64-pc-windows-msvc.exe"
if (-not (Test-Path $sidecar)) {
  throw "Sidecar missing: $sidecar`nDownload official rust-v0.154.0 binary into src-tauri\binaries\ (see docs/ARCHITECTURE.md). Installers embed this engine."
}

Push-Location src-tauri
try {
  # Product/CI path is shell-only; runner args go after `--`.
  cargo tauri build -- --no-default-features
  if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
} finally {
  Pop-Location
}

& (Join-Path $PSScriptRoot "stage-dist.ps1")
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Write-Host "Done. Desktop product installers are in dist\ (not target\)."
