# Runs the desk's watcher (scripts/desk-watch.mjs, DECISIONS.md D55) from the owner's PC: one poll of the free
# sources (ESPN's DraftKings lines and injury lists, the reporters' Bluesky posts), and a dispatch of
# .github/workflows/model-desk.yml when something material is pending and the rate allows. Never runs the bettor
# itself and never spends an Odds API credit. The Windows scheduled task "SeasonRanker desk watch" runs it every
# 5 minutes, around the clock, only while the owner is logged on (no wake, no stored password); the hourly
# "SeasonRanker desk kick" (desk-kick.ps1) stays the backstop.
#
#   powershell -NoProfile -ExecutionPolicy Bypass -File scripts\desk-watch.ps1           (one poll)
#   powershell -NoProfile -ExecutionPolicy Bypass -File scripts\desk-watch.ps1 -DryRun   (say what it would do)
#   powershell -NoProfile -ExecutionPolicy Bypass -File scripts\desk-watch.ps1 -Register (create or replace the task)
#
# Logs to .cache/desk-watch.log; its state in .cache/desk-watch.json.

param(
  [switch]$DryRun,
  [switch]$Register,
  [int]$EveryMinutes = 5
)

$ErrorActionPreference = 'Continue'
$Root = Split-Path -Parent $PSScriptRoot
$TaskName = 'SeasonRanker desk watch'
$Node = (Get-Command node -ErrorAction SilentlyContinue).Source
if (-not $Node) { $Node = 'C:\Program Files\nodejs\node.exe' }

if ($Register) {
  # (every EveryMinutes minutes from the next whole 5, indefinitely; the current user, only while logged on, no
  # wake; a missed start isn't made up (the next comes in minutes); 4 minutes at most, one at a time)
  $script = Join-Path $PSScriptRoot 'desk-watch.ps1'
  $action = New-ScheduledTaskAction -Execute 'powershell.exe' `
    -Argument "-NoProfile -NonInteractive -WindowStyle Hidden -ExecutionPolicy Bypass -File `"$script`"" `
    -WorkingDirectory $Root
  $now = Get-Date
  $start = $now.Date.AddHours($now.Hour).AddMinutes([math]::Ceiling(($now.Minute + 1) / 5) * 5)
  $trigger = New-ScheduledTaskTrigger -Once -At $start -RepetitionInterval (New-TimeSpan -Minutes $EveryMinutes)
  $settings = New-ScheduledTaskSettingsSet -ExecutionTimeLimit (New-TimeSpan -Minutes 4) `
    -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -MultipleInstances IgnoreNew
  $principal = New-ScheduledTaskPrincipal -UserId "$env:USERDOMAIN\$env:USERNAME" -LogonType Interactive -RunLevel Limited
  Register-ScheduledTask -TaskName $TaskName -Action $action -Trigger $trigger -Settings $settings `
    -Principal $principal -Description "Polls ESPN's lines and injuries and the reporters' posts; dispatches model-desk.yml on a material change (scripts/desk-watch.mjs)." `
    -Force | Out-Null
  Write-Output "registered '$TaskName': every $EveryMinutes minutes from $start"
  exit 0
}

Push-Location $Root
try {
  $args_ = @('scripts/desk-watch.mjs')
  if ($DryRun) { $args_ += '--dry' }
  & $Node @args_
  exit $LASTEXITCODE
} finally {
  Pop-Location
}
