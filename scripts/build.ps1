# Cloud/dev build helper. Requires Rust + Tauri CLI on PATH.
#
# The self-developed kernel is compiled into the shell, so there is no engine
# binary to fetch or embed. Output: dist/Codex-portable/ (see stage-dist.ps1).
$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot\..

Push-Location src-tauri
try {
  cargo tauri build
  if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
} finally {
  Pop-Location
}

& (Join-Path $PSScriptRoot "stage-dist.ps1")
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Write-Host "Done. Portable build is in dist\ (not target\)."
