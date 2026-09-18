param(
  [string]$OutDir = "",
  [int]$MaxDepth = 40,
  [int]$MaxNodes = 8000,
  [int]$TimeBudgetSec = 100,
  [int]$LaunchTimeoutSec = 45,
  [string]$WindowTitle = "",
  [string]$View = "Control",
  [string]$ProcRegex = "^(Codex|ChatGPT)$",
  [switch]$NoLaunch,
  [switch]$Outline,
  [string]$Tag = "",
  [switch]$ShortCls,
  [string]$OutlineMatch = "",
  [string]$OutlineMatchCt = "",
  [switch]$Quiet
)
$ErrorActionPreference = "Stop"

Add-Type -AssemblyName UIAutomationClient
Add-Type -AssemblyName UIAutomationTypes
Add-Type -TypeDefinition "using System; using System.Runtime.InteropServices; public static class W32 { [DllImport(`"user32.dll`")] public static extern bool IsIconic(IntPtr h); [DllImport(`"user32.dll`")] public static extern bool ShowWindow(IntPtr h, int n); }"

function Restore-CodexWindows {
  foreach ($p in (Get-CodexProcs)) {
    try {
      $h = $p.MainWindowHandle
      if ($h -ne 0 -and [W32]::IsIconic($h)) {
        [W32]::ShowWindow($h, 9) | Out-Null
        Write-Host ("restored minimized window pid=" + $p.Id)
      }
    } catch { }
  }
}

$AE = [System.Windows.Automation.AutomationElement]
$TS = [System.Windows.Automation.TreeScope]

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
if (-not $OutDir) { $OutDir = Join-Path $repoRoot "docs\uia" }
New-Item -ItemType Directory -Force -Path $OutDir | Out-Null

$walker = if ($View -eq "Raw") {
  [System.Windows.Automation.TreeWalker]::RawViewWalker
} else {
  [System.Windows.Automation.TreeWalker]::ControlViewWalker
}

function Get-CodexPackage {
  Get-AppxPackage | Where-Object { $_.Name -eq "OpenAI.Codex" } | Select-Object -First 1
}

function Get-CodexProcs {
  $pkg = Get-CodexPackage
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

function Start-CodexApp {
  $pkg = Get-CodexPackage
  if (-not $pkg) { throw "OpenAI.Codex package not found" }
  $manifest = Join-Path $pkg.InstallLocation "AppxManifest.xml"
  [xml]$xml = Get-Content $manifest
  $appId = $xml.Package.Applications.Application.Id | Select-Object -First 1
  if (-not $appId) { $appId = "App" }
  $aumid = $pkg.PackageFamilyName + "!" + $appId
  Write-Host "Launching $aumid"
  Start-Process ("shell:AppsFolder\" + $aumid)
}

function Get-TopWindows {
  $pkg = Get-CodexPackage
  $list = @()
  try {
    $kids = $AE::RootElement.FindAll($TS::Children, [System.Windows.Automation.Condition]::TrueCondition)
  } catch { return $list }
  foreach ($w in $kids) {
    try {
      $c = $w.Current
      $pn = ""; $pp = ""
      try { $pr = Get-Process -Id $c.ProcessId -ErrorAction Stop; $pn = $pr.ProcessName; try { $pp = $pr.Path } catch { } } catch { }
      $inPkg = ($pkg -and $pp -and $pp.StartsWith($pkg.InstallLocation, [System.StringComparison]::OrdinalIgnoreCase))
      $nameHit = ($c.Name -match "Codex")
      $procHit = ($pn -match $ProcRegex)
      if (-not ($inPkg -or $procHit -or $nameHit)) { continue }
      $r = $c.BoundingRectangle
      $rule = if ($inPkg) { "pkg" } elseif ($procHit) { "proc" } else { "name" }
      $list += [ordered]@{
        name = $c.Name; class = $c.ClassName; automationId = $c.AutomationId
        pid = $c.ProcessId; proc = $pn; rule = $rule
        handle = ($c.NativeWindowHandle)
        rect = @{ x = [int]$r.X; y = [int]$r.Y; w = [int]$r.Width; h = [int]$r.Height }
        isOffscreen = $c.IsOffscreen
      }
    } catch { }
  }
  return $list
}

$script:nodeCount = 0
$script:maxDepthSeen = 0
$script:truncated = ""
$script:deadline = (Get-Date).AddSeconds($TimeBudgetSec)
$script:typeHist = @{}

function Convert-Node($el, $depth) {
  if ($script:truncated -ne "") { return $null }
  if (($script:nodeCount % 200) -eq 0 -and (Get-Date) -gt $script:deadline) {
    $script:truncated = "time-budget"; return $null
  }
  if ($script:nodeCount -ge $MaxNodes) { $script:truncated = "node-budget"; return $null }
  if ($depth -gt $MaxDepth) { return [ordered]@{ truncatedDepth = $true } }
  $script:nodeCount++
  if ($depth -gt $script:maxDepthSeen) { $script:maxDepthSeen = $depth }
  if (($script:nodeCount % 2000) -eq 0) {
    Write-Host ("  ... nodes=" + $script:nodeCount + " depth=" + $depth + " elapsed=" + [int]((Get-Date) - ($script:deadline.AddSeconds(-$TimeBudgetSec))).TotalSeconds + "s")
  }
  $node = [ordered]@{ d = $depth }
  try {
    $c = $el.Current
    $ct = "?"
    try { $ct = $c.ControlType.ProgrammaticName.Split(".")[-1] } catch { }
    $node.ct = $ct
    if ($script:typeHist.ContainsKey($ct)) { $script:typeHist[$ct]++ } else { $script:typeHist[$ct] = 1 }
    try { $v = $c.Name; if ($v) { $node.name = $v } } catch { }
    try { $v = $c.AutomationId; if ($v) { $node.aid = $v } } catch { }
    try { $v = $c.ClassName; if ($v) { $node.cls = $v } } catch { }
    try {
      $r = $c.BoundingRectangle
      $node.rect = @([int]$r.X, [int]$r.Y, [int]$r.Width, [int]$r.Height)
    } catch { }
    try { if ($c.IsOffscreen) { $node.off = $true } } catch { }
    try { if (-not $c.IsEnabled) { $node.dis = $true } } catch { }
    $tp = $null
    try {
      if ($el.TryGetCurrentPattern([System.Windows.Automation.TogglePattern]::Pattern, [ref]$tp)) {
        $node.tog = $tp.Current.ToggleState.ToString()
      }
    } catch { }
    $ep = $null
    try {
      if ($el.TryGetCurrentPattern([System.Windows.Automation.ExpandCollapsePattern]::Pattern, [ref]$ep)) {
        $node.exp = $ep.Current.ExpandCollapseState.ToString()
      }
    } catch { }
    $vp = $null
    try {
      if ($el.TryGetCurrentPattern([System.Windows.Automation.ValuePattern]::Pattern, [ref]$vp)) {
        $sv = $vp.Current.Value
        if ($sv -and $sv.Length -lt 500) { $node.val = $sv }
      }
    } catch { }
    try {
      $si = $el.GetCurrentPropertyValue($AE::SelectionItemIsSelectedProperty)
      if ($si -eq $true) { $node.sel = $true }
    } catch { }
  } catch {
    $node.unavail = $true
    return $node
  }
  $kids = @()
  try {
    $child = $walker.GetFirstChild($el)
    while ($child -ne $null) {
      $cn = Convert-Node $child ($depth + 1)
      if ($cn -ne $null) { $kids += $cn }
      if ($script:truncated -ne "") { break }
      try { $child = $walker.GetNextSibling($child) } catch { $child = $null }
    }
  } catch { }
  if ($kids.Count -gt 0) { $node.kids = $kids }
  return $node
}

function Show-Outline($n, $ind) {
  $extra = ""
  if ($n.aid) { $extra += " #" + $n.aid }
  if ($n.rect) { $extra += " [" + $n.rect[2] + "x" + $n.rect[3] + "]" }
  if ($n.tog) { $extra += " tog=" + $n.tog }
  if ($n.exp) { $extra += " exp=" + $n.exp }
  if ($n.val) { $v = $n.val; if ($v.Length -gt 60) { $v = $v.Substring(0,60) + ".." }; $extra += ' val="' + $v + '"' }
  if ($n.off) { $extra += " OFF" }
  if ($n.dis) { $extra += " DIS" }
  if ($n.sel) { $extra += " SEL" }
  $c = $n.cls
  if ($ShortCls -and $c -and $c.Length -gt 90) { $c = $c.Substring(0, 90) + "..." }
  Write-Host ($ind + $n.d + ":" + $n.ct + " '" + $n.name + "' cls=" + $c + $extra)
  if ($n.kids) { foreach ($k in $n.kids) { Show-Outline $k ("  " + $ind) } }
}

# ---- main ----
$pkg = Get-CodexPackage
if ($pkg) { Write-Host ("Package: " + $pkg.PackageFullName) } else { Write-Host "Package: NOT FOUND" }

$procs = Get-CodexProcs
if ($procs.Count -eq 0 -and (-not $NoLaunch)) {
  Write-Host "Codex not running, launching..."
  Start-CodexApp
}
$launchDeadline = (Get-Date).AddSeconds($LaunchTimeoutSec)
$windows = @()
Restore-CodexWindows
while ((Get-Date) -lt $launchDeadline) {
  $windows = @(Get-TopWindows)
  if ($windows.Count -gt 0) { break }
  Write-Host "waiting for Codex window..."
  Start-Sleep -Seconds 3
}
$procs = Get-CodexProcs
Write-Host ("Codex procs: " + (($procs | ForEach-Object { $_.Id }) -join ","))
if ($windows.Count -eq 0) {
  Write-Host "DIAG all top-level windows:"
  try {
    $all = $AE::RootElement.FindAll($TS::Children, [System.Windows.Automation.Condition]::TrueCondition)
    Write-Host ("  total=" + $all.Count)
    $n = 0
    foreach ($w in $all) {
      if ($n -ge 40) { break }
      try {
        $c = $w.Current
        $pn = ""
        try { $pn = (Get-Process -Id $c.ProcessId -ErrorAction Stop).ProcessName } catch { }
        $r = $c.BoundingRectangle
        Write-Host ("  - [" + [int]$r.Width + "x" + [int]$r.Height + "] '" + $c.Name + "' cls=" + $c.ClassName + " proc=" + $pn)
        $n++
      } catch { }
    }
  } catch { Write-Host ("  enum failed: " + $_) }
}
Write-Host ("Top windows: " + $windows.Count)
foreach ($w in $windows) {
  Write-Host (("  - [" + $w.rect.w + "x" + $w.rect.h + "] " + $w.name + " (" + $w.class + "/" + $w.proc + "/" + $w.rule + ")"))
}

$target = $null
if ($WindowTitle -ne "") {
  $target = $windows | Where-Object { $_.name -match $WindowTitle } | Select-Object -First 1
} else {
  $target = $windows | Where-Object { $_.rect.w -ge 200 -and $_.rect.h -ge 150 } | Sort-Object { $_.rect.w * $_.rect.h } -Descending | Select-Object -First 1
  if (-not $target) { $target = $windows | Select-Object -First 1 }
}
if (-not $target) { throw "No Codex window found" }
Write-Host ("Target: " + $target.name + " handle=" + $target.handle)

$rootEl = $AE::FromHandle((New-Object System.IntPtr($target.handle)))
if (-not $rootEl) { throw "FromHandle failed" }

$ts = Get-Date -Format "yyyyMMdd-HHmmss"
$tree = Convert-Node $rootEl 0

$meta = [ordered]@{
  app = "OpenAI.Codex"; package = ($pkg.PackageFullName)
  capturedAt = (Get-Date).ToString("o"); view = $View
  targetWindow = $target.name; targetRect = $target.rect
  nodes = $script:nodeCount; maxDepth = $script:maxDepthSeen
  truncated = $script:truncated; maxNodes = $MaxNodes; maxDepthLimit = $MaxDepth
}
$doc = [ordered]@{ meta = $meta; typeHistogram = $script:typeHist; windows = $windows; tree = $tree }
$json = $doc | ConvertTo-Json -Depth 100
$utf8 = New-Object System.Text.UTF8Encoding($false)
$tagSuffix = if ($Tag -ne "") { "-" + $Tag } else { "" }
$outFile = Join-Path $OutDir ("uia-tree-" + $ts + $tagSuffix + ".json")
[System.IO.File]::WriteAllText($outFile, $json, $utf8)
$size = (Get-Item $outFile).Length

if ($Quiet) { Write-Host ("qsum tag=" + $Tag + " nodes=" + $script:nodeCount + " size=" + $size + " depth=" + $script:maxDepthSeen + " out=" + (Split-Path $outFile -Leaf)) } else {
Write-Host "==== SUMMARY ===="
Write-Host ("out=" + $outFile)
Write-Host ("size=" + $size + " nodes=" + $script:nodeCount + " maxDepth=" + $script:maxDepthSeen + " truncated=" + $script:truncated)
Write-Host "typeHistogram:"
foreach ($k in ($script:typeHist.Keys | Sort-Object { $script:typeHist[$_] } -Descending | Select-Object -First 25)) {
  Write-Host ("  " + $k + "=" + $script:typeHist[$k])
}
$lvl1 = @()
if ($tree.kids) { foreach ($k in $tree.kids) { $lvl1 += ($k.ct + ":" + $k.name) } }
Write-Host ("L1children(" + $lvl1.Count + "): " + ($lvl1 -join " | "))
}
function Show-Matching($n) {
  $mm = $true
  if ($OutlineMatch -ne "") { if (-not $n.name -or $n.name -notmatch $OutlineMatch) { $mm = $false } }
  if ($OutlineMatchCt -ne "" -and $n.ct -ne $OutlineMatchCt) { $mm = $false }
  if ($mm -and ($OutlineMatch -ne "" -or $OutlineMatchCt -ne "")) { Show-Outline $n ""; return }
  if ($n.kids) { foreach ($k in $n.kids) { Show-Matching $k } }
}
if ($Outline) {
  Write-Host "==== OUTLINE ===="
  if ($OutlineMatch -ne "" -or $OutlineMatchCt -ne "") { Show-Matching $tree }
  else { Show-Outline $tree "" }
}
