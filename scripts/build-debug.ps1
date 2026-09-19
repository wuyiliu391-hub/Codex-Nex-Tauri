#!/usr/bin/env pwsh
# Debug build with full symbols, for crash triage and profiling.
#
# The self-developed kernel is compiled into the shell, so there is no engine
# binary to download and no `[profile.debug-build]` to append: this uses the
# `dev` profile via `cargo tauri build --debug`, with full symbols forced on by
# environment variables (the root Cargo.toml sets debug = "limited" for dev).
#
# Output: dist-debug/ containing the exe and, when produced, its .pdb.

$ErrorActionPreference = "Stop"

$root = Split-Path $PSScriptRoot -Parent
Set-Location $root

Write-Host "=== Codex-Tauri debug build ===" -ForegroundColor Cyan
Write-Host "root: $root" -ForegroundColor Gray
Write-Host ""

# ── preflight ───────────────────────────────────────────────────────────────
Write-Host "[1/4] Checking toolchain..." -NoNewline
foreach ($tool in @("cargo", "cargo-tauri")) {
    if (-not (Get-Command $tool -ErrorAction SilentlyContinue)) {
        Write-Host " FAILED" -ForegroundColor Red
        throw "'$tool' not found on PATH. Install Rust and the Tauri CLI (cargo install tauri-cli)."
    }
}
Write-Host " OK" -ForegroundColor Green

# The frontend must exist: tauri.conf.json `frontendDist` points at
# ../frontend/dist, which is gitignored and absent on a fresh checkout.
Write-Host "[2/4] Building frontend..." -NoNewline
Push-Location (Join-Path $root "frontend")
try {
    if (-not (Test-Path "node_modules")) {
        npm ci --no-audit --no-fund
        if ($LASTEXITCODE -ne 0) { throw "npm ci failed" }
    }
    npm run build
    if ($LASTEXITCODE -ne 0) { throw "frontend build failed" }
} finally {
    Pop-Location
}
Write-Host " OK" -ForegroundColor Green

# ── build ───────────────────────────────────────────────────────────────────
Write-Host "[3/4] cargo tauri build --debug..." -ForegroundColor Cyan
$env:CARGO_PROFILE_DEV_DEBUG = "true"
$env:CARGO_PROFILE_DEV_STRIP = "false"
Push-Location (Join-Path $root "src-tauri")
try {
    cargo tauri build --debug
    if ($LASTEXITCODE -ne 0) { throw "cargo tauri build --debug failed" }
} finally {
    Pop-Location
}

# ── stage ───────────────────────────────────────────────────────────────────
# Resolve artifacts by glob: the Tauri CLI renames the binary to `productName`
# ("Codex"), while a plain cargo build emits `codex-tauri.exe`.
Write-Host "[4/4] Staging artifacts..." -NoNewline
$target = if ($env:CARGO_TARGET_DIR) { $env:CARGO_TARGET_DIR } else { Join-Path $root "target" }
$debugDir = Join-Path $target "debug"
$bin = Get-ChildItem -Path $debugDir -Filter "*.exe" -File -ErrorAction SilentlyContinue |
    Sort-Object Length -Descending | Select-Object -First 1
if (-not $bin) { throw "no exe found under $debugDir" }

$out = Join-Path $root "dist-debug"
if (Test-Path $out) { Remove-Item $out -Recurse -Force }
New-Item -ItemType Directory -Force -Path $out | Out-Null
Copy-Item $bin.FullName -Destination $out -Force

$pdb = Join-Path $bin.DirectoryName ($bin.BaseName + ".pdb")
if (Test-Path $pdb) { Copy-Item $pdb -Destination $out -Force }
Write-Host " OK" -ForegroundColor Green

Write-Host ""
Get-ChildItem $out | ForEach-Object {
    Write-Host ("  {0}  {1:N0} bytes" -f $_.Name, $_.Length)
}
Write-Host ""
Write-Host "Debug build: $out" -ForegroundColor Cyan
