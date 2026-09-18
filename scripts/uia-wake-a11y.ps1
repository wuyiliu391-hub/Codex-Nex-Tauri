param(
  [string]$Mode = "Set",
  [int]$SettleSec = 10
)
$ErrorActionPreference = "Stop"

$code = @"
using System;
using System.Runtime.InteropServices;
public static class NativeA11y {
  [DllImport("user32.dll", SetLastError=true)]
  public static extern bool SystemParametersInfo(uint a, uint p, IntPtr v, uint f);
  [DllImport("user32.dll")]
  public static extern bool SetForegroundWindow(IntPtr h);
  [DllImport("user32.dll")]
  public static extern bool ShowWindow(IntPtr h, int n);
  [DllImport("user32.dll")]
  public static extern bool IsIconic(IntPtr h);
}
"@
Add-Type -TypeDefinition $code

function Get-ScreenReaderFlag {
  $p = [System.Runtime.InteropServices.Marshal]::AllocHGlobal(4)
  try {
    [System.Runtime.InteropServices.Marshal]::WriteInt32($p, 0)
    [NativeA11y]::SystemParametersInfo(0x0046, 0, $p, 0) | Out-Null
    return [System.Runtime.InteropServices.Marshal]::ReadInt32($p)
  } finally {
    [System.Runtime.InteropServices.Marshal]::FreeHGlobal($p)
  }
}

function Set-ScreenReaderFlag([int]$v) {
  $ok = [NativeA11y]::SystemParametersInfo(0x0047, [uint32]$v, [IntPtr]::Zero, 0)
  return $ok
}

if ($Mode -eq "Restore") {
  $ok = Set-ScreenReaderFlag 0
  Write-Host ("Restore SPI_SETSCREENREADER=0 ok=" + $ok + " now=" + (Get-ScreenReaderFlag))
  exit 0
}

if ($Mode -eq "Get") {
  Write-Host ("SPI_GETSCREENREADER=" + (Get-ScreenReaderFlag))
  exit 0
}

# Mode Set
Write-Host ("before=" + (Get-ScreenReaderFlag))
$ok = Set-ScreenReaderFlag 1
Write-Host ("set=1 ok=" + $ok + " now=" + (Get-ScreenReaderFlag))

# Foreground the Codex/ChatGPT window to trigger renderer a11y init
$w = Get-Process | Where-Object { $_.MainWindowHandle -ne 0 -and $_.ProcessName -match '^(Codex|ChatGPT)$' } | Select-Object -First 1
if ($w) {
  $h = $w.MainWindowHandle
  if ([NativeA11y]::IsIconic($h)) { [NativeA11y]::ShowWindow($h, 9) | Out-Null }
  [NativeA11y]::SetForegroundWindow($h) | Out-Null
  Write-Host ("foregrounded pid=" + $w.Id + " title=" + $w.MainWindowTitle)
} else {
  Write-Host "WARN no Codex window to foreground"
}

Write-Host ("settling " + $SettleSec + "s for renderer a11y init...")
Start-Sleep -Seconds $SettleSec
Write-Host "wake done (flag left ON; run -Mode Restore after dumps)"
