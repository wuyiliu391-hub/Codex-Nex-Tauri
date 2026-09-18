param(
  [int]$Seconds = 100,
  [int]$IntervalSec = 2,
  [switch]$QuickDumpOnSight
)
$ErrorActionPreference = "Stop"
Add-Type -AssemblyName UIAutomationClient
Add-Type -AssemblyName UIAutomationTypes
$AE = [System.Windows.Automation.AutomationElement]
$TS = [System.Windows.Automation.TreeScope]

$dumped = $false
for ($t = 0; $t -lt $Seconds; $t += $IntervalSec) {
  $mp = @(Get-Process | Where-Object { $_.MainWindowHandle -ne 0 -and $_.ProcessName -match '^(Codex|ChatGPT)$' })
  $uiaN = 0
  $uiaNames = @()
  try {
    $kids = $AE::RootElement.FindAll($TS::Children, [System.Windows.Automation.Condition]::TrueCondition)
    foreach ($w in $kids) {
      try {
        $c = $w.Current
        $pn = ""
        try { $pn = (Get-Process -Id $c.ProcessId -ErrorAction Stop).ProcessName } catch { }
        if ($pn -match '^(Codex|ChatGPT)$' -or $c.Name -match 'Codex|ChatGPT') {
          $uiaN++
          $uiaNames += ($c.Name + "/" + $pn + "/" + $c.ClassName)
        }
      } catch { }
    }
  } catch { }
  $line = "t=" + $t + "s procs=" + $mp.Count + " uia=" + $uiaN
  if ($mp.Count -gt 0) {
    $line += " main=[" + (($mp | ForEach-Object { $_.ProcessName + ":" + $_.Id + ":'" + $_.MainWindowTitle + "'" }) -join ";") + "]"
  }
  if ($uiaNames.Count -gt 0) { $line += " uiawin=[" + ($uiaNames -join ";") + "]" }
  Write-Host $line
  if ($QuickDumpOnSight -and (-not $dumped) -and $uiaN -gt 0) {
    $dumped = $true
    Write-Host "TRIGGER quick dump..."
    & (Join-Path $PSScriptRoot "uia-dump.ps1") -MaxNodes 600 -MaxDepth 8 -TimeBudgetSec 25
  }
  Start-Sleep -Seconds $IntervalSec
}
Write-Host "watch done"
