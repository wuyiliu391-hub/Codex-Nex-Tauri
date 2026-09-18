param([string]$Tag = "", [string]$File = "", [int]$MaxLines = 300, [switch]$Full)
$ErrorActionPreference = "Stop"
Add-Type -AssemblyName System.Web.Extensions
if ($File -eq "") {
  $dir = Join-Path $PSScriptRoot "..\docs\uia"
  $f = Get-ChildItem (Join-Path $dir ("uia-tree-*-" + $Tag + ".json")) -ErrorAction SilentlyContinue | Sort-Object LastWriteTime -Descending | Select-Object -First 1
  if (-not $f) { Write-Host ("compact: no file tag=" + $Tag); exit 1 }
  $File = $f.FullName
}
$text = [System.IO.File]::ReadAllText($File)
$ser = New-Object System.Web.Script.Serialization.JavaScriptSerializer
$ser.MaxJsonLength = 60000000
$ser.RecursionLimit = 100
$j = $ser.DeserializeObject($text)
Write-Host ("== " + [System.IO.Path]::GetFileName($File) + " nodes=" + $j['meta']['nodes'])
$script:root = $j['tree']
if (-not $Full) {
  function Find-Content($n) {
    if ($n['ct'] -eq "Group" -and $n['cls'] -like "*MainContentSurface*") { $script:root = $n; return $true }
    if ($n.ContainsKey('kids')) { foreach ($k in $n['kids']) { if (Find-Content $k) { return $true } } }
    return $false
  }
  [void](Find-Content $j['tree'])
}
$script:n = 0
function G($n, $key) { if ($n.ContainsKey($key)) { return $n[$key] } else { return $null } }
function Show-C($n, $ind) {
  if ($script:n -ge $MaxLines) { return }
  $ct = G $n 'ct'
  if ($ct -eq "Image") { return }
  if (($ct -eq "Pane" -or $ct -eq "Group") -and -not (G $n 'name') -and -not (G $n 'aid')) {
    if ($n.ContainsKey('kids')) { foreach ($k in $n['kids']) { Show-C $k $ind } }
    return
  }
  $fl = ""
  $aid = G $n 'aid'; if ($aid) { $fl += " #" + $aid }
  $tog = G $n 'tog'; if ($tog) { $fl += " tog=" + $tog }
  $exp = G $n 'exp'; if ($exp) { $fl += " exp=" + $exp }
  $v = G $n 'val'; if ($v) { $vs = [string]$v; if ($vs.Length -gt 60) { $vs = $vs.Substring(0,60) + ".." }; $fl += ' val="' + $vs + '"' }
  if (G $n 'off') { $fl += " OFF" }
  if (G $n 'dis') { $fl += " DIS" }
  if (G $n 'sel') { $fl += " SEL" }
  Write-Host ($ind + (G $n 'd') + ":" + $ct + " '" + (G $n 'name') + "'" + $fl)
  $script:n++
  if ($n.ContainsKey('kids')) { foreach ($k in $n['kids']) { Show-C $k ("  " + $ind) } }
}
Show-C $script:root ""
Write-Host ("-- lines=" + $script:n)
