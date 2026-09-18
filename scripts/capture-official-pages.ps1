# Walk official Codex UI: screenshot major pages into docs/visual/.
$ErrorActionPreference = "Stop"
$root = "C:\Users\Administrator\Desktop\Codex-Tauri"
Set-Location $root
$vis = Join-Path $root "docs\visual"
if (-not (Test-Path $vis)) { New-Item -ItemType Directory -Force -Path $vis | Out-Null }

function Shot([string]$name) {
  powershell -NoProfile -ExecutionPolicy Bypass -File scripts\capture-window.ps1 -OutFile "docs\visual\$name.png" -TitleMatch ChatGPT
}
function Act([string[]]$uiaArgs) {
  powershell -NoProfile -ExecutionPolicy Bypass -File scripts\uia-act.ps1 @uiaArgs
}

Act @("-Name", ([char]0x8FD4 + [char]0x56DE + [char]0x5E94 + [char]0x7528), "-Do", "Invoke", "-Quiet") | Out-Null
Start-Sleep -Milliseconds 700
Shot "p01-home"

Act @("-Keys", "^,", "-Quiet") | Out-Null
Start-Sleep -Milliseconds 900
Shot "p02-settings-general"

# Tab names as Unicode codepoints to avoid encoding issues
$tabs = @(
  @{ n = "$([char]0x5BFC)$([char]0x5165)"; f = "p03-settings-import" },
  @{ n = "$([char]0x5916)$([char]0x89C2)"; f = "p04-settings-appearance" },
  @{ n = "$([char]0x8BED)$([char]0x97F3)"; f = "p05-settings-voice" },
  @{ n = "$([char]0x914D)$([char]0x7F6E)"; f = "p06-settings-config" },
  @{ n = "$([char]0x4E2A)$([char]0x6027)$([char]0x5316)"; f = "p07-settings-personal" },
  @{ n = "$([char]0x5BA0)$([char]0x7269)"; f = "p08-settings-pets" },
  @{ n = "$([char]0x8D26)$([char]0x6237)"; f = "p09-settings-account" },
  @{ n = "$([char]0x7535)$([char]0x8111)$([char]0x64CD)$([char]0x63A7)"; f = "p10-settings-cua" },
  @{ n = "$([char]0x63D2)$([char]0x4EF6)"; f = "p11-settings-plugins" },
  @{ n = "$([char]0x6D4F)$([char]0x89C8)$([char]0x5668)"; f = "p12-settings-browser" },
  @{ n = "Git"; f = "p13-settings-git" }
)
foreach ($t in $tabs) {
  Write-Host "TAB $($t.n) -> $($t.f)"
  Act @("-Name", $t.n, "-Do", "Invoke", "-Quiet") | Out-Null
  Start-Sleep -Milliseconds 600
  Shot $t.f
}

Act @("-Name", "$([char]0x8FD4)$([char]0x56DE)$([char]0x5E94)$([char]0x7528)", "-Do", "Invoke", "-Quiet") | Out-Null
Start-Sleep -Milliseconds 700
Shot "p14-home-after-settings"

foreach ($pair in @(
  @{ n = "Pull Request"; f = "p15-pullrequests" },
  @{ n = "$([char]0x5B9A)$([char]0x65F6)$([char]0x4EFB)$([char]0x52A1)"; f = "p16-scheduled" },
  @{ n = "$([char]0x63D2)$([char]0x4EF6)"; f = "p17-plugins-nav" }
)) {
  Write-Host "NAV $($pair.n)"
  Act @("-Name", $pair.n, "-Do", "Invoke", "-Quiet") | Out-Null
  Start-Sleep -Milliseconds 700
  Shot $pair.f
}

Act @("-Name", "$([char]0x8FD4)$([char]0x56DE)$([char]0x5E94)$([char]0x7528)", "-Do", "Invoke", "-Quiet") | Out-Null
Start-Sleep -Milliseconds 600
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\click-and-shot.ps1 -X 720 -Y 564 -OutFile "docs\visual\p18-model-menu.png"
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\click-and-shot.ps1 -X 390 -Y 564 -OutFile "docs\visual\p19-permission-menu.png"
Get-ChildItem docs\visual\p*.png | Select-Object Name,Length