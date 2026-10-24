# The history audit's scheduled tasks (scripts/history-audit.mjs; libs/ranker/scripts/model/DECISIONS.md D86): every
# sport's replayed history re-recorded with origin/master's code and pushed, in the audit's own clone
# (C:\dev\qbr-audit), never the main checkout.
#
#   powershell -NoProfile -ExecutionPolicy Bypass -File scripts\history-audit.ps1 -Mode weekly          (run now)
#   powershell -NoProfile -ExecutionPolicy Bypass -File scripts\history-audit.ps1 -Mode nightly -DryRun (all but the push)
#   powershell -NoProfile -ExecutionPolicy Bypass -File scripts\history-audit.ps1 -Register             (create or replace the tasks)
#
# The tasks (the current user, while logged on, as desk-kick's: the push uses the owner's own git sign-in; each wakes
# the PC but the check):
#   SeasonRanker weekly audit    Mondays 3:30 AM: the cache rebuilt, every sport re-recorded, then the self-tune (D88:
#                                one knob change a sport at most, as data, that sport re-recorded) (before the 8 AM
#                                self-check workflow)
#   SeasonRanker nightly audit   daily 4:00 AM: every sport re-recorded on the cache as it is (skipped while the
#                                weekly runs, or when a run finished cleanly in the last 6 hours)
#   SeasonRanker audit check     every 15 minutes: a new model commit on origin/master, 30 minutes old, re-records
#                                (the audit's own and "Model desk:" commits never do)
# Logs to C:\dev\QBRanker2026\.cache\history-audit.log; each run's gate output in the clone's .cache\history-audit\<day>.

param(
  [ValidateSet('weekly', 'nightly', 'code', 'check')][string]$Mode = 'nightly',
  [switch]$DryRun,
  [switch]$Refit,
  [switch]$Register,
  [string]$Clone = 'C:\dev\qbr-audit',
  [string]$Main = 'C:\dev\QBRanker2026'
)

$ErrorActionPreference = 'Continue'

if ($Register) {
  $script = Join-Path $Clone 'scripts\history-audit.ps1'
  $principal = New-ScheduledTaskPrincipal -UserId "$env:USERDOMAIN\$env:USERNAME" -LogonType Interactive -RunLevel Limited
  $make = {
    param($name, $mode, $trigger, $wake, $hours, $about)
    $action = New-ScheduledTaskAction -Execute 'powershell.exe' `
      -Argument "-NoProfile -NonInteractive -WindowStyle Hidden -ExecutionPolicy Bypass -File `"$script`" -Mode $mode" `
      -WorkingDirectory $Clone
    $settings = New-ScheduledTaskSettingsSet -ExecutionTimeLimit (New-TimeSpan -Hours $hours) -AllowStartIfOnBatteries `
      -DontStopIfGoingOnBatteries -MultipleInstances IgnoreNew -StartWhenAvailable:$wake -WakeToRun:$wake
    Register-ScheduledTask -TaskName $name -Action $action -Trigger $trigger -Settings $settings -Principal $principal `
      -Description $about -Force | Out-Null
    Write-Output "registered '$name'"
  }
  & $make 'SeasonRanker weekly audit' 'weekly' (New-ScheduledTaskTrigger -Weekly -DaysOfWeek Monday -At '3:30AM') $true 14 `
    'History audit, weekly: the cache rebuilt and every sport re-recorded with origin/master (scripts/history-audit.mjs, D86).'
  & $make 'SeasonRanker nightly audit' 'nightly' (New-ScheduledTaskTrigger -Daily -At '4:00AM') $true 10 `
    'History audit, nightly: every sport re-recorded with origin/master on the cached fits (scripts/history-audit.mjs, D86).'
  $now = Get-Date
  $start = $now.Date.AddHours($now.Hour).AddMinutes(([Math]::Floor($now.Minute / 15) + 1) * 15)
  & $make 'SeasonRanker audit check' 'check' (New-ScheduledTaskTrigger -Once -At $start -RepetitionInterval (New-TimeSpan -Minutes 15)) $false 12 `
    'History audit, on code: a new model commit on origin/master, 30 minutes old, re-records every sport (scripts/history-audit.mjs, D86).'
  exit 0
}

$node = (Get-Command node -ErrorAction SilentlyContinue).Source
if (-not $node) { $node = 'C:\Program Files\nodejs\node.exe' }
$argv = @("$Clone\scripts\history-audit.mjs", '--mode', $Mode, '--main', $Main)
if ($DryRun) { $argv += '--dry' }
if ($Refit) { $argv += '--refit' }
& $node @argv
exit $LASTEXITCODE
