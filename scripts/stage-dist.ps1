# Stage product installers into a flat dist/ folder.
# Output: only NSIS/MSI desktop installers — no target/ tree, no raw shell exe.
$ErrorActionPreference = "Stop"

$root = Split-Path $PSScriptRoot -Parent
Set-Location $root

$dist = Join-Path $root "dist"
if (Test-Path $dist) {
  Remove-Item $dist -Recurse -Force
}
New-Item -ItemType Directory -Force -Path $dist | Out-Null

$searchRoots = @(
  (Join-Path $root "target\release\bundle"),
  (Join-Path $root "src-tauri\target\release\bundle"),
  (Join-Path $root "target\release\bundle\nsis"),
  (Join-Path $root "target\release\bundle\msi")
)

# Also honor CARGO_TARGET_DIR when set (CI points it at workspace/target).
if ($env:CARGO_TARGET_DIR) {
  $searchRoots += @(
    (Join-Path $env:CARGO_TARGET_DIR "release\bundle"),
    (Join-Path $env:CARGO_TARGET_DIR "release\bundle\nsis"),
    (Join-Path $env:CARGO_TARGET_DIR "release\bundle\msi")
  )
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
