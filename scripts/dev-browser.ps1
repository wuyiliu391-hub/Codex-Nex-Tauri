# Browser dev launcher: ensures the official engine listens on the dev WS
# port, then starts vite in bridge mode. See docs/BROWSER-DEV.md.
$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
$listen = if ($env:CODEX_APP_SERVER_WS) {
  # accept both ws://host:port and bare host:port
  $u = $env:CODEX_APP_SERVER_WS -replace '^wss?://', ''
  ($u -split ':')[-1]
} else { 17457 }

function Test-Port([int]$port) {
  try {
    $c = [System.Net.Sockets.TcpClient]::new()
    $ok = $c.BeginConnect("127.0.0.1", $port, $null, $null).AsyncWaitHandle.WaitOne(300)
    $c.Close()
    return $ok
  } catch { return $false }
}

if (-not (Test-Port $listen)) {
  $engine = $env:CODEX_APP_SERVER
  if (-not $engine) {
    $engine = Join-Path $root "src-tauri\binaries\codex-app-server-x86_64-pc-windows-msvc.exe"
  }
  if (-not (Test-Path $engine)) {
    throw "engine binary not found: $engine`nSet CODEX_APP_SERVER or drop the official rust-v0.154.0 binary into src-tauri\binaries\ (see README)."
  }
  Write-Host "starting engine on port $listen ..." -NoNewline
  $argSets = @(
    @("app-server", "--listen", "ws://127.0.0.1:$listen"),  # multi-call codex.exe
    @("--listen", "ws://127.0.0.1:$listen")                  # standalone app-server
  )
  $started = $false
  foreach ($args in $argSets) {
    $p = Start-Process -FilePath $engine -ArgumentList $args -PassThru -WindowStyle Hidden
    Start-Sleep -Milliseconds 900
    if (-not $p.HasExited) { $started = $true; Write-Host " ok (pid $($p.Id), shape: $($args[0]) app-server)" ; break }
    Stop-Process -Id $p.Id -ErrorAction SilentlyContinue
  }
  if (-not $started) { throw "engine exited immediately for both CLI shapes" }
  $global:ENGINE_PID = $p.Id
} else {
  Write-Host "engine already listening on $listen"
}

Push-Location (Join-Path $root "frontend")
try { npm run dev:browser } finally { Pop-Location }
