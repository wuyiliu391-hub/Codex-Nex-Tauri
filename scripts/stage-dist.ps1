# Stage the portable (no-install) build into dist/.
# Output: Codex-portable/ with the shell exe, the WebView2 loader DLL (when
# present) and the official engine under binaries/ — nothing else.
# Installers (NSIS/MSI) are disabled for now: bundle.targets = [] in
# tauri.conf.json, so cargo tauri build produces only the raw exe.
$ErrorActionPreference = "Stop"

$root = Split-Path $PSScriptRoot -Parent
Set-Location $root

$dist = Join-Path $root "dist"
if (Test-Path $dist) {
  Remove-Item $dist -Recurse -Force
}
New-Item -ItemType Directory -Force -Path $dist | Out-Null

# Build output root: CI sets CARGO_TARGET_DIR to workspace/target; local
# default is src-tauri/target (tauri workspace) or target/.
$releaseDirs = @(
  (Join-Path $root "target\release"),
  (Join-Path $root "src-tauri\target\release")
)
if ($env:CARGO_TARGET_DIR) {
  $releaseDirs += (Join-Path $env:CARGO_TARGET_DIR "release")
}

# ── Portable build (no installer needed) ────────────────────────────────────
# Codex.exe embeds the frontend; next to it go the WebView2 loader DLL (when
# present) and the official engine under binaries/ — the sidecar resolver
# (sidecar.rs) checks current_exe()/binaries/ on startup.
$portable = Join-Path $dist "Codex-portable"
$shellExe = $null
foreach ($rd in $releaseDirs) {
  foreach ($name in @("Codex.exe", "codex-tauri.exe")) {
    $candidate = Join-Path $rd $name
    if (Test-Path $candidate) { $shellExe = $candidate; break }
  }
  if ($shellExe) { break }
}

if (-not $shellExe) {
  throw "Release Codex.exe not found under target/*/release. Run cargo tauri build first."
}

New-Item -ItemType Directory -Force -Path $portable | Out-Null
Copy-Item $shellExe -Destination (Join-Path $portable (Split-Path $shellExe -Leaf)) -Force
Write-Host ("staged portable {0}  ({1:N0} bytes)" -f (Split-Path $shellExe -Leaf), (Get-Item $shellExe).Length)

foreach ($rd in $releaseDirs) {
  $dll = Join-Path $rd "WebView2Loader.dll"
  if (Test-Path $dll) {
    Copy-Item $dll -Destination (Join-Path $portable "WebView2Loader.dll") -Force
    Write-Host "staged portable WebView2Loader.dll"
    break
  }
}

$sidecarDir = Join-Path $root "src-tauri\binaries"
$sidecar = Get-ChildItem -Path $sidecarDir -Filter "codex-app-server-*.exe" -ErrorAction SilentlyContinue | Select-Object -First 1
if ($sidecar) {
  New-Item -ItemType Directory -Force -Path (Join-Path $portable "binaries") | Out-Null
  Copy-Item $sidecar.FullName -Destination (Join-Path $portable "binaries" $sidecar.Name) -Force
  Write-Host ("staged portable binaries/{0}  ({1:N0} bytes)" -f $sidecar.Name, $sidecar.Length)
} else {
  throw "Sidecar exe not found under src-tauri/binaries — portable Codex.exe would run without the engine."
}

Write-Host ""
Write-Host "Portable dist:"
Get-ChildItem $dist -Recurse -File | ForEach-Object {
  Write-Host ("  {0}  {1:N0} bytes" -f $_.FullName.Substring($dist.Length + 1), $_.Length)
}
Write-Host ""
Write-Host "Dist: $dist"
