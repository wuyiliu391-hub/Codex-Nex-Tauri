# Stage product installers into a flat dist/ folder.
# Output: NSIS/MSI desktop installers + a portable (no-install) Codex.exe.
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

$searchRoots = @(
  (Join-Path $root "target\release\bundle"),
  (Join-Path $root "src-tauri\target\release\bundle"),
  (Join-Path $root "target\release\bundle\nsis"),
  (Join-Path $root "target\release\bundle\msi")
)
foreach ($rd in $releaseDirs) {
  $searchRoots += @((Join-Path $rd "bundle"), (Join-Path $rd "bundle\nsis"), (Join-Path $rd "bundle\msi"))
}

$copied = New-Object System.Collections.Generic.List[string]
$seen = @{}

foreach ($rootDir in $searchRoots) {
  if (-not (Test-Path $rootDir)) { continue }
  Get-ChildItem -Path $rootDir -Recurse -File -ErrorAction SilentlyContinue |
    Where-Object {
      $_.Extension -in @(".exe", ".msi") -and
      $_.FullName -match "bundle[\\/](nsis|msi)[\\/]"
    } |
    ForEach-Object {
      if ($seen.ContainsKey($_.Name)) { return }
      $seen[$_.Name] = $true
      Copy-Item $_.FullName -Destination (Join-Path $dist $_.Name) -Force
      $copied.Add($_.Name) | Out-Null
      Write-Host ("staged {0}  ({1:N0} bytes)" -f $_.Name, $_.Length)
    }
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

if ($shellExe) {
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
    Write-Host "WARN: sidecar exe not found — portable Codex.exe will run without the engine"
  }
} else {
  Write-Host "WARN: release Codex.exe not found — skipping portable staging"
}

if ($copied.Count -eq 0) {
  throw "No NSIS/MSI installers found under target/**/bundle. Run cargo tauri build first."
}

Write-Host ""
Write-Host "Product installers (flat):"
Get-ChildItem $dist | ForEach-Object {
  Write-Host ("  {0}  {1:N0} bytes" -f $_.Name, $_.Length)
}
Write-Host ""
Write-Host "Dist: $dist"
