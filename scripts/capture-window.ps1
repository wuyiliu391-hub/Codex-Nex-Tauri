# Capture the official Codex / ChatGPT main window to PNG.
# Usage: powershell -File scripts/capture-window.ps1 -OutFile docs/visual\shot.png [-TitleMatch ChatGPT]
param(
  [Parameter(Mandatory = $true)][string]$OutFile,
  [string]$TitleMatch = "ChatGPT",
  [int]$WaitMs = 800
)
Add-Type -AssemblyName System.Drawing
Add-Type @"
using System;
using System.Runtime.InteropServices;
public class Win32Cap {
  [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr hWnd, out RECT rect);
  [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr hWnd);
  [StructLayout(LayoutKind.Sequential)] public struct RECT { public int Left, Top, Right, Bottom; }
}
"@

$proc = Get-Process | Where-Object {
  $_.MainWindowTitle -like "*$TitleMatch*" -or ($_.ProcessName -eq "ChatGPT" -and $_.MainWindowHandle -ne 0)
} | Select-Object -First 1

if (-not $proc) {
  # Fallback: any ChatGPT process with a non-zero handle after a short wait
  Start-Sleep -Milliseconds $WaitMs
  $proc = Get-Process -Name ChatGPT -ErrorAction SilentlyContinue |
    Where-Object { $_.MainWindowHandle -ne 0 } | Select-Object -First 1
}
if (-not $proc -or $proc.MainWindowHandle -eq 0) {
  Write-Error "No ChatGPT/Codex main window found"
  exit 1
}

$hwnd = $proc.MainWindowHandle
[Win32Cap]::SetForegroundWindow($hwnd) | Out-Null
Start-Sleep -Milliseconds $WaitMs

$rect = New-Object Win32Cap+RECT
[Win32Cap]::GetWindowRect($hwnd, [ref]$rect) | Out-Null
$w = $rect.Right - $rect.Left
$h = $rect.Bottom - $rect.Top
if ($w -le 0 -or $h -le 0) {
  Write-Error "Bad window rect $w x $h"
  exit 1
}

$bmp = New-Object System.Drawing.Bitmap($w, $h)
$g = [System.Drawing.Graphics]::FromImage($bmp)
$g.CopyFromScreen($rect.Left, $rect.Top, 0, 0, $bmp.Size)
$dir = Split-Path -Parent $OutFile
if ($dir -and -not (Test-Path $dir)) { New-Item -ItemType Directory -Force -Path $dir | Out-Null }
$bmp.Save($OutFile, [System.Drawing.Imaging.ImageFormat]::Png)
$g.Dispose(); $bmp.Dispose()
Write-Host "SAVED $OutFile ${w}x${h} hwnd=$hwnd title='$($proc.MainWindowTitle)'"
