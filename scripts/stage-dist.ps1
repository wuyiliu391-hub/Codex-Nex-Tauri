# Stage the portable (no-install) build into dist/.
#
# Output: Codex-portable/ containing the shell exe and, when present, the
# WebView2 loader DLL. Nothing else.
#
# There is deliberately NO `binaries/` folder any more: the self-developed
# kernel is compiled into the shell exe, so the product is a single
# self-contained file. The old sidecar staging step (and its "engine missing"
# guard) was removed along with the engine download.
#
# Installers (NSIS/MSI) are disabled: `bundle.targets = []` in tauri.conf.json,
# so `cargo tauri build` produces only the raw exe.
$ErrorActionPreference = "Stop"

$root = Split-Path $PSScriptRoot -Parent
Set-Location $root

$dist = Join-Path $root "dist"
if (Test-Path $dist) {
  Remove-Item $dist -Recurse -Force
}
New-Item -ItemType Directory -Force -Path $dist | Out-Null

# Build output root: CI sets CARGO_TARGET_DIR to workspace/target; the local
# default is <repo>/target.
$releaseDirs = @(
  (Join-Path $root "target\release"),
  (Join-Path $root "src-tauri\target\release")
)
if ($env:CARGO_TARGET_DIR) {
  $releaseDirs += (Join-Path $env:CARGO_TARGET_DIR "release")
}

# ── locate the shell exe ────────────────────────────────────────────────────
# Tauri renames the binary to `productName` from tauri.conf.json ("Codex"),
# while a plain cargo build emits `codex-tauri.exe`. Accept either.
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
  throw "Release exe not found under target/*/release. Run 'cargo tauri build' first."
}

New-Item -ItemType Directory -Force -Path $portable | Out-Null
Copy-Item $shellExe -Destination (Join-Path $portable (Split-Path $shellExe -Leaf)) -Force
Write-Host ("staged portable {0}  ({1:N0} bytes)" -f (Split-Path $shellExe -Leaf), (Get-Item $shellExe).Length)

# WebView2Loader.dll only ships alongside the exe on some configurations; when
# it is absent the system WebView2 runtime is used instead.
foreach ($rd in $releaseDirs) {
  $dll = Join-Path $rd "WebView2Loader.dll"
  if (Test-Path $dll) {
    Copy-Item $dll -Destination (Join-Path $portable "WebView2Loader.dll") -Force
    Write-Host "staged portable WebView2Loader.dll"
    break
  }
}

# ── guard: no engine binary may reappear ────────────────────────────────────
# The kernel is in-process. If someone drops an engine exe back into
# src-tauri/binaries, fail loudly rather than silently shipping 300 MB.
$stray = Get-ChildItem -Path (Join-Path $root "src-tauri\binaries") -Filter "*.exe" -ErrorAction SilentlyContinue
if ($stray) {
  throw "Stray engine binary found: $($stray[0].FullName). The kernel is in-process; remove it."
}

Write-Host ""
Write-Host "Portable dist:"
Get-ChildItem $dist -Recurse -File | ForEach-Object {
  Write-Host ("  {0}  {1:N0} bytes" -f $_.FullName.Substring($dist.Length + 1), $_.Length)
}
Write-Host ""
Write-Host "Dist: $dist"
