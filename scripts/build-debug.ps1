#!/usr/bin/env pwsh

# Debug Build Script for Codex-Tauri
# Purpose: Build debug version with full symbols and diagnostic output

Set-ErrorActionPreference "Stop"

Write-Host "=== Codex-Tauri Debug Build Script ===" -ForegroundColor Cyan
Write-Host "Date: $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')" -ForegroundColor Gray
Write-Host ""

# Configuration
$PROJECT_ROOT = Get-Location
$SRC_TAURI_DIR = Join-Path $PROJECT_ROOT "src-tauri"
$OUTPUT_DIR = Join-Path $PROJECT_ROOT "dist-debug"
$ENGINE_BINARY_TAG = "rust-v0.154.0"
$ENGINE_BINARY_NAME = "codex-app-server-x86_64-pc-windows-msvc.exe"

# Step 1: Ensure source directory exists
Write-Host "[1/6] Checking source directories..." -NoNewline
if (-not (Test-Path $SRC_TAURI_DIR)) {
    Write-Host " FAILED: src-tauri directory not found!" -ForegroundColor Red
    exit 1
}
Write-Host " OK" -ForegroundColor Green

# Step 2: Download engine binary if missing
Write-Host "[2/6] Ensuring official app-server binary..." -NoNewline
$BINARIES_DIR = Join-Path $SRC_TAURI_DIR "binaries"
New-Item -ItemType Directory -Force -Path $BINARIES_DIR | Out-Null

$engine_path = Join-Path $BINARIES_DIR $ENGINE_BINARY_NAME
if (-not (Test-Path $engine_path)) {
    Write-Host "`n[Downloading official engine binary]..." -ForegroundColor Yellow
    $url = "https://github.com/openai/codex/releases/download/$ENGINE_BINARY_TAG/$ENGINE_BINARY_NAME"
    Invoke-WebRequest -Uri $url -OutFile $engine_path
    
    $file_size = (Get-Item $engine_path).Length
    Write-Host "✓ Downloaded $($file_size / 1MB) MB binary to $BINARIES_DIR" -ForegroundColor Green
} else {
    Write-Host " OK (already present)" -ForegroundColor Green
}

# Step 3: Install frontend dependencies
Write-Host "[3/6] Checking frontend dependencies..." -NoNewline
$frontend_dir = Join-Path $PROJECT_ROOT "frontend"
if (-not (Test-Path (Join-Path $frontend_dir "node_modules"))) {
    Write-Host "`n[Installing npm packages]..." -ForegroundColor Yellow
    Push-Location $frontend_dir
    npm ci --no-audit --no-fund
    Pop-Location
    Write-Host "✓ Dependencies installed" -ForegroundColor Green
} else {
    Write-Host " OK (already installed)" -ForegroundColor Green
}

# Step 4: Typecheck frontend
Write-Host "[4/6] Running TypeScript typecheck..." -NoNewline
Push-Location $frontend_dir
$npm_result = npm run typecheck 2>&1
Pop-Location

if ($LASTEXITCODE -ne 0) {
    Write-Host " FAILED!" -ForegroundColor Red
    Write-Host "`nTypeScript errors detected - fix before continuing build:" -ForegroundColor Yellow
    Write-Host $npm_result
    exit 2
}
Write-Host " OK (all types valid)" -ForegroundColor Green

# Step 5: Clean previous debug builds
Write-Host "[5/6] Cleaning previous debug artifacts..." -NoNewline
if (Test-Path (Join-Path $SRC_TAURI_DIR "target\debug")) {
    Remove-Item -Recurse -Force (Join-Path $SRC_TAURI_DIR "target\debug") -ErrorAction SilentlyContinue
}
Write-Host " OK" -ForegroundColor Green

# Step 6: Build debug executable
Write-Host "[6/6] Building debug executable with full symbols..." -ForegroundColor Cyan

# Create Cargo profile override for debug mode
$cargo_toml_path = Join-Path $SRC_TAURI_DIR "Cargo.toml"
$cargo_toml_content = Get-Content $cargo_toml_path -Raw

# Append debug profile at the end of file
$debug_profile = @"

[profile.debug-build]
inherits = "dev"
opt-level = 1
debug = true
strip = false
incremental = true

"@

# Save modified Cargo.toml
Set-Content -Path $cargo_toml_path -Value ($cargo_toml_content + $debug_profile)

# Execute Tauri debug build
Push-Location $SRC_TAURI_DIR

Write-Host "`nStarting cargo tauri build in debug mode..." -ForegroundColor Yellow

try {
    $cargo_args = @(
        'tauri', 'build',
        '--target', 'x86_64-pc-windows-msvc',
        '--no-default-features',
        '--verbose',
        '--locked'
    )
    
    & cargo $cargo_args
        
    $build_status = $?
    
    if (-not $build_status) {
        throw "Tauri build failed"
    }
} catch {
    Write-Host "FAILED! $_" -ForegroundColor Red
    Pop-Location
    exit 3
}

Pop-Location

# Step 7: Package debug artifacts
Write-Host "`n[7/8] Packaging debug artifacts..." -ForegroundColor Cyan

New-Item -ItemType Directory -Force -Path $OUTPUT_DIR | Out-Null

Copy-Item -Path (Join-Path $SRC_TAURI_DIR "target\debug\Codex.exe") `
          -Destination $OUTPUT_DIR `
          -Force

Copy-Item -Path (Join-Path $SRC_TAURI_DIR "target\debug\Codex.pdb") `
          -Destination $OUTPUT_DIR `
          -Force

# Copy engine binary
Copy-Item -Path $engine_path `
          -Destination (Join-Path $OUTPUT_DIR "binaries\") `
          -Force

# Generate build manifest
$manifest = @{
    timestamp = Get-Date -Format "ISO8601"
    version = "Debug Build - $(Get-Date -Format 'yyyy-MM-dd_HH-mm-ss')"
    commit_hash = (git rev-parse HEAD)
    features = "debug_symbols=true,strip=false,optimize_level=1"
    notes = "Contains full PDB symbols for debugging stack traces"
} | ConvertTo-Json -Depth 5

$manifest_path = Join-Path $OUTPUT_DIR "BUILD_MANIFEST.json"
$manifest | Set-Content -Path $manifest_path

Write-Host "`n✅ Debug build complete!" -ForegroundColor Green
Write-Host "Executable location: $(Join-Path $OUTPUT_DIR 'Codex.exe')" -ForegroundColor Cyan
Write-Host "Symbols location: $(Join-Path $OUTPUT_DIR 'Codex.pdb')" -ForegroundColor Cyan
Write-Host "Manifest location: $(Join-Path $OUTPUT_DIR 'BUILD_MANIFEST.json')" -ForegroundColor Cyan

# Step 8: Quick verification
Write-Host "`n[8/8] Verifying debug build..." -ForegroundColor Cyan

$exe_size = (Get-Item (Join-Path $OUTPUT_DIR "Codex.exe")).Length
$pdb_size = (Get-Item (Join-Path $OUTPUT_DIR "Codex.pdb")).Length

Write-Host "✓ Executable size: $([math]::Round($exe_size / 1MB, 2)) MB" -ForegroundColor Green
Write-Host "✓ Symbol table size: $([math]::Round($pdb_size / 1MB, 2)) MB (contains debug info)" -ForegroundColor Green

Write-Host "`n🎯 Next steps:" -ForegroundColor Yellow
Write-Host "1. Run ./dist-debug/Codex.exe from PowerShell to see console logs" -ForegroundColor White
Write-Host "2. Attach debugger with VS Code or WinDbg for runtime analysis" -ForegroundColor White
Write-Host "3. Use bug report template in DEBUG_BUILD_GUIDE_AND_ISSUE_TRACKER.md" -ForegroundColor White

Write-Host "`n⚠️  IMPORTANT: This debug build contains sensitive information!" -ForegroundColor Red
Write-Host "   Do NOT distribute outside development team environment" -ForegroundColor Red
