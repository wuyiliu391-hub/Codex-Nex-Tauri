param(
  [string]$Name = "",
  [string]$Ct = "",
  [int]$Index = 0,
  [string]$Do = "List",
  [string]$Value = "",
  [string]$Keys = "",
  [string]$ProcRegex = "^(Codex|ChatGPT)$",
  [string]$WindowTitle = "",
  [int]$PostSec = 2,
  [string]$DumpTag = "",
  [switch]$DumpOutline,
  [switch]$ShortCls,
  [string]$OutlineMatch = "",
  [string]$OutlineMatchCt = "",
  [switch]$Quiet,
  [switch]$NoFg
)
$ErrorActionPreference = "Stop"
Add-Type -AssemblyName UIAutomationClient
Add-Type -AssemblyName UIAutomationTypes
Add-Type -TypeDefinition "using System; using System.Runtime.InteropServices; public static class W32A { [DllImport(`"user32.dll`")] public static extern bool IsIconic(IntPtr h); [DllImport(`"user32.dll`")] public static extern bool ShowWindow(IntPtr h, int n); [DllImport(`"user32.dll`")] public static extern bool SetForegroundWindow(IntPtr h); [DllImport(`"user32.dll`")] public static extern bool SetCursorPos(int X, int Y); [DllImport(`"user32.dll`")] public static extern void mouse_event(uint dwFlags, uint dx, uint dy, uint dwData, UIntPtr dwExtraInfo); }"
$AE = [System.Windows.Automation.AutomationElement]
$TS = [System.Windows.Automation.TreeScope]
$walker = [System.Windows.Automation.TreeWalker]::ControlViewWalker

function Get-AppProcs {
  $pkg = Get-AppxPackage | Where-Object { $_.Name -eq "OpenAI.Codex" } | Select-Object -First 1
  $hits = @()
  foreach ($p in (Get-Process)) {
    $path = ""
    try { $path = $p.Path } catch { $path = "" }
    if ($pkg -and $path -and $path.StartsWith($pkg.InstallLocation, [System.StringComparison]::OrdinalIgnoreCase)) {
      $hits += $p
    } elseif ($p.ProcessName -match $ProcRegex) {
      $hits += $p
    }
  }
  return $hits
}

foreach ($p in (Get-AppProcs)) {
  try { if ($p.MainWindowHandle -ne 0 -and [W32A]::IsIconic($p.MainWindowHandle)) { [W32A]::ShowWindow($p.MainWindowHandle, 9) | Out-Null; Write-Host ("restored pid=" + $p.Id) } } catch { }
}
Start-Sleep -Milliseconds 800

$wins = @()
$kids = $AE::RootElement.FindAll($TS::Children, [System.Windows.Automation.Condition]::TrueCondition)
foreach ($w in $kids) {
  try {
    $c = $w.Current
    $pn = ""
    try { $pn = (Get-Process -Id $c.ProcessId -ErrorAction Stop).ProcessName } catch { }
    if ($pn -match $ProcRegex -or $c.Name -match "Codex") {
      $r = $c.BoundingRectangle
      $wins += [pscustomobject]@{ Name=$c.Name; Proc=$pn; W=[int]$r.Width; H=[int]$r.Height; Handle=$c.NativeWindowHandle }
    }
  } catch { }
}
Write-Host ("windows: " + $wins.Count)
foreach ($w in $wins) { Write-Host ("  - [" + $w.W + "x" + $w.H + "] " + $w.Name + " /" + $w.Proc) }

$target = $null
if ($WindowTitle -ne "") { $target = $wins | Where-Object { $_.Name -match $WindowTitle } | Select-Object -First 1 }
else { $target = $wins | Where-Object { $_.W -ge 200 -and $_.H -ge 150 } | Sort-Object { $_.W * $_.H } -Descending | Select-Object -First 1 }
if (-not $target) { $target = $wins | Select-Object -First 1 }
if (-not $target) { throw "no window" }
Write-Host ("target: " + $target.Name)
$rootEl = $AE::FromHandle((New-Object System.IntPtr($target.Handle)))

$script:matches = @()
function Find-El($el, $depth) {
  if ($depth -gt 30) { return }
  $hit = $true
  $c = $null
  try { $c = $el.Current } catch { return }
  $nm = ""
  try { $nm = $c.Name } catch { }
  if ($Name -ne "" -and $nm -notmatch $Name) { $hit = $false }
  $ctName = ""
  try { $ctName = $c.ControlType.ProgrammaticName.Split(".")[-1] } catch { }
  if ($Ct -ne "" -and $ctName -ne $Ct) { $hit = $false }
  if ($hit) {
    $flags = ""
    try { $p=$null; if ($el.TryGetCurrentPattern([System.Windows.Automation.InvokePattern]::Pattern, [ref]$p)) { $flags += "I" } } catch { }
    try { $p=$null; if ($el.TryGetCurrentPattern([System.Windows.Automation.ExpandCollapsePattern]::Pattern, [ref]$p)) { $flags += "X" } } catch { }
    try { $p=$null; if ($el.TryGetCurrentPattern([System.Windows.Automation.TogglePattern]::Pattern, [ref]$p)) { $flags += "T" } } catch { }
    try { $p=$null; if ($el.TryGetCurrentPattern([System.Windows.Automation.ValuePattern]::Pattern, [ref]$p)) { $flags += "V" } } catch { }
    $r = $c.BoundingRectangle
    $script:matches += [pscustomobject]@{ El=$el; D=$depth; Ct=$ctName; Nm=$nm; Flags=$flags; Rect=([int]$r.X,[int]$r.Y,[int]$r.Width,[int]$r.Height) }
  }
  try {
    $ch = $walker.GetFirstChild($el)
    while ($ch -ne $null) { Find-El $ch ($depth+1); try { $ch = $walker.GetNextSibling($ch) } catch { $ch = $null } }
  } catch { }
}
if ($Name -ne "" -or $Ct -ne "") { Find-El $rootEl 0 }
Write-Host ("matches: " + $script:matches.Count)
$i = 0
foreach ($m in ($script:matches | Select-Object -First 30)) {
  Write-Host ("  #$i d=" + $m.D + " " + $m.Ct + " '" + $m.Nm + "' [" + $m.Flags + "] rect=" + ($m.Rect -join ","))
  $i++
}

if ($Do -ne "List" -and $script:matches.Count -gt 0) {
  $m = $script:matches[$Index]
  $el = $m.El
  Write-Host ("action $Do on #$Index " + $m.Ct + " '" + $m.Nm + "'")
  try { $el.SetFocus() } catch { }
  Start-Sleep -Milliseconds 300
  try {
    if ($Do -eq "Invoke") { $p = $el.GetCurrentPattern([System.Windows.Automation.InvokePattern]::Pattern); $p.Invoke() }
    elseif ($Do -eq "Expand") { $p = $el.GetCurrentPattern([System.Windows.Automation.ExpandCollapsePattern]::Pattern); $p.Expand() }
    elseif ($Do -eq "Collapse") { $p = $el.GetCurrentPattern([System.Windows.Automation.ExpandCollapsePattern]::Pattern); $p.Collapse() }
    elseif ($Do -eq "Toggle") { $p = $el.GetCurrentPattern([System.Windows.Automation.TogglePattern]::Pattern); $p.Toggle() }
    elseif ($Do -eq "SetValue") { $p = $el.GetCurrentPattern([System.Windows.Automation.ValuePattern]::Pattern); $p.SetValue($Value) }
    elseif ($Do -eq "Click") {
      if (-not $NoFg) { try { [W32A]::SetForegroundWindow((New-Object System.IntPtr($target.Handle))) | Out-Null } catch { } }
      Start-Sleep -Milliseconds 400
      $pt = $null
      try { $pt = $el.GetClickablePoint() } catch { }
      if ($pt -eq $null) { $rr = $el.Current.BoundingRectangle; $pt = New-Object System.Windows.Point(($rr.X + $rr.Width / 2), ($rr.Y + $rr.Height / 2)) }
      [W32A]::SetCursorPos([int]$pt.X, [int]$pt.Y) | Out-Null
      Start-Sleep -Milliseconds 150
      [W32A]::mouse_event(0x02, 0, 0, 0, [UIntPtr]::Zero)
      Start-Sleep -Milliseconds 80
      [W32A]::mouse_event(0x04, 0, 0, 0, [UIntPtr]::Zero)
    }
    elseif ($Do -eq "Focus") { }
    Write-Host "action done"
  } catch {
    Write-Host ("primary action failed: " + $_.Exception.Message)
    try {
      $p2 = $el.GetCurrentPattern([System.Windows.Automation.InvokePattern]::Pattern); $p2.Invoke()
      Write-Host "fallback Invoke done"
    } catch { Write-Host ("fallback Invoke also failed: " + $_.Exception.Message) }
  }
}

if ($Keys -ne "") {
  if (-not $NoFg) { try { [W32A]::SetForegroundWindow((New-Object System.IntPtr($target.Handle))) | Out-Null } catch { } }
  Start-Sleep -Milliseconds 400
  $sh = New-Object -ComObject WScript.Shell
  $sh.SendKeys($Keys)
  Write-Host ("sent keys: " + $Keys)
}

if ($PostSec -gt 0) { Start-Sleep -Seconds $PostSec }

if ($DumpTag -ne "") {
  $dargs = @{ Tag = $DumpTag }
  if ($DumpOutline) { $dargs["Outline"] = $true }
  if ($ShortCls) { $dargs["ShortCls"] = $true }
  if ($OutlineMatch -ne "") { $dargs["OutlineMatch"] = $OutlineMatch }
  if ($OutlineMatchCt -ne "") { $dargs["OutlineMatchCt"] = $OutlineMatchCt }
  if ($Quiet) { $dargs["Quiet"] = $true }
  & (Join-Path $PSScriptRoot "uia-dump.ps1") @dargs
}
