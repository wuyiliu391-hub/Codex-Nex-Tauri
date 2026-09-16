# Click a point in the ChatGPT window by client-relative coords, then screenshot.
param(
  [Parameter(Mandatory=$true)][int]$X,
  [Parameter(Mandatory=$true)][int]$Y,
  [string]$OutFile = "docs/visual/after-click.png",
  [int]$WaitMs = 700
)
Add-Type @"
using System;
using System.Runtime.InteropServices;
public class WClick {
  [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr h);
  [DllImport("user32.dll")] public static extern bool SetCursorPos(int X, int Y);
  [DllImport("user32.dll")] public static extern void mouse_event(uint f, uint dx, uint dy, uint d, UIntPtr e);
  [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr h, out RECT r);
  [StructLayout(LayoutKind.Sequential)] public struct RECT { public int Left,Top,Right,Bottom; }
}
"@
$p = Get-Process -Name ChatGPT -ErrorAction SilentlyContinue | Where-Object { $_.MainWindowHandle -ne 0 } | Select-Object -First 1
if (-not $p) { Write-Error "no window"; exit 1 }
[WClick]::SetForegroundWindow($p.MainWindowHandle) | Out-Null
Start-Sleep -Milliseconds 200
$r = New-Object WClick+RECT
[WClick]::GetWindowRect($p.MainWindowHandle, [ref]$r) | Out-Null
$absX = $r.Left + $X
$absY = $r.Top + $Y
[WClick]::SetCursorPos($absX, $absY) | Out-Null
Start-Sleep -Milliseconds 100
# left down/up
[WClick]::mouse_event(0x0002, 0, 0, 0, [UIntPtr]::Zero)
Start-Sleep -Milliseconds 40
[WClick]::mouse_event(0x0004, 0, 0, 0, [UIntPtr]::Zero)
Start-Sleep -Milliseconds $WaitMs
powershell -NoProfile -ExecutionPolicy Bypass -File "$PSScriptRoot\capture-window.ps1" -OutFile $OutFile -TitleMatch ChatGPT
