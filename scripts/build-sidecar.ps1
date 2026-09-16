$ErrorActionPreference = "Stop"
<#
.SYNOPSIS
  Build the official codex-app-server sidecar from the local codex-rust tree.

.DESCRIPTION
  Requires:
    - Rust toolchain (stable, x86_64-pc-windows-msvc)
    - Official source at CODEX_RUST_PATH (default:
      ..\codex-rust-v0.154.0\codex-rs relative to this repo)

  Produces:
    src-tauri\binaries\codex-app-server-x86_64-pc-windows-msvc.exe

  Shell-only CI does NOT run this script. Use it on a machine that has the
  official tree, or in the optional CI job.
#>

param(
  [string]$CodexRustPath = $env:CODEX_RUST_PATH,
  [switch]$Release = $true,
  [switch]$SkipBuild
)

$repoRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
$outDir = Join-Path $repoRoot "src-tauri\binaries"
$outExe = Join-Path $outDir "codex-app-server-x86_64-pc-windows-msvc.exe"

if (-not $CodexRustPath) {
  $candidates = @(
    (Join-Path $repoRoot "..\codex-rust-v0.154.0\codex-rs"),
    (Join-Path $repoRoot "..\codex-rs"),
    "C:\Users\Administrator\Desktop\codex-rust-v0.154.0\codex-rs"
  )
  foreach ($c in $candidates) {
    if (Test-Path (Join-Path $c "Cargo.toml")) {
      $CodexRustPath = (Resolve-Path $c).Path
      break
    }
  }
}

if (-not $CodexRustPath -or -not (Test-Path (Join-Path $CodexRustPath "Cargo.toml"))) {
  Write-Error "codex-rust workspace not found. Set CODEX_RUST_PATH or place the tree next to Codex-Tauri."
}

Write-Host "Using official tree: $CodexRustPath"

$profile = if ($Release) { "release" } else { "debug" }
$builtExe = Join-Path $CodexRustPath "target\$profile\codex-app-server.exe"

if (-not $SkipBuild) {
  Push-Location $CodexRustPath
  try {
    Write-Host "cargo build -p codex-app-server $(if ($Release) { '--release' })"
    if ($Release) {
      cargo build -p codex-app-server --release
    } else {
      cargo build -p codex-app-server
    }
    if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
  } finally {
    Pop-Location
  }
}

if (-not (Test-Path $builtExe)) {
  Write-Error "Build finished but binary missing: $builtExe"
}

New-Item -ItemType Directory -Force -Path $outDir | Out-Null
Copy-Item $builtExe $outExe -Force
Write-Host "Installed sidecar -> $outExe"

# Also drop a bare copy next to the Tauri binary for PATH-less local runs.
$bare = Join-Path $outDir "codex-app-server.exe"
Copy-Item $builtExe $bare -Force
Write-Host "Installed bare copy  -> $bare"

# Sanity: --listen flag exists (prints usage / errors on unknown flag).
Write-Host "Smoke: codex-app-server --help (first lines)"
& $outExe --help 2>&1 | Select-Object -First 15

Write-Host "Done. Engine will spawn this binary with --listen ws://127.0.0.1:17457"
