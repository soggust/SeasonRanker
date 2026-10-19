# Kicks the bettor (.github/workflows/model-desk.yml) from the owner's PC when GitHub's own schedule hasn't
# started it lately. GitHub's free cron is unreliable for this repo: measured 2026-10-12 to 10-19 it fired the
# hourly desk about 5.7 times a day, a median 4.0 hours apart, the worst gap 10.3 hours, so the Bot priced games
# after the news had moved their lines. This is the backup: the Windows scheduled task "SeasonRanker desk kick"
# runs it hourly at :12, around the clock, only while the owner is logged on (no wake, no stored password).
#
#   powershell -NoProfile -ExecutionPolicy Bypass -File scripts\desk-kick.ps1           (kick if due)
#   powershell -NoProfile -ExecutionPolicy Bypass -File scripts\desk-kick.ps1 -DryRun   (say what it would do)
#   powershell -NoProfile -ExecutionPolicy Bypass -File scripts\desk-kick.ps1 -Register (create or replace the task)
#
# It dispatches the desk only when no desk run, scheduled or kicked, started in the last 50 minutes and none is
# queued or running (the workflow's concurrency group would hold a second one anyway; a queued one means
# GitHub is behind, and another adds nothing). It uses the owner's own gh sign-in (no token here) and the
# dispatch's defaults (no reason, no re-price), as kick-update.mjs --desk does. Logs to .cache/desk-kick.log.
# Never runs the bettor itself.

param(
  [switch]$DryRun,
  [switch]$Register,
  [int]$RecentMinutes = 50
)

# (Continue, not Stop: Windows PowerShell 5.1 turns a native command's stderr into errors that Stop would throw on)
$ErrorActionPreference = 'Continue'
$Root = Split-Path -Parent $PSScriptRoot
$Log = Join-Path $Root '.cache\desk-kick.log'
$Workflow = 'model-desk.yml'
$TaskName = 'SeasonRanker desk kick'

New-Item -ItemType Directory -Force (Split-Path -Parent $Log) | Out-Null
function Say([string]$line) {
  $tag = if ($DryRun) { ' (dry)' } else { '' }
  $entry = "$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')$tag`: $line"
  Add-Content -Path $Log -Value $entry -Encoding utf8
  Write-Output $entry
}

if ($Register) {
  # (hourly at :12 from the next hour, indefinitely; the current user, only while logged on, no wake; a missed
  # start isn't made up later (StartWhenAvailable off: the next :12 comes soon enough); 5 minutes at most)
  $script = Join-Path $PSScriptRoot 'desk-kick.ps1'
  $action = New-ScheduledTaskAction -Execute 'powershell.exe' `
    -Argument "-NoProfile -NonInteractive -WindowStyle Hidden -ExecutionPolicy Bypass -File `"$script`"" `
    -WorkingDirectory $Root
  $now = Get-Date
  $start = $now.Date.AddHours($now.Hour).AddMinutes(12)
  if ($start -le $now) { $start = $start.AddHours(1) }
  $trigger = New-ScheduledTaskTrigger -Once -At $start -RepetitionInterval (New-TimeSpan -Hours 1)
  $settings = New-ScheduledTaskSettingsSet -ExecutionTimeLimit (New-TimeSpan -Minutes 5) `
    -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -MultipleInstances IgnoreNew
  $principal = New-ScheduledTaskPrincipal -UserId "$env:USERDOMAIN\$env:USERNAME" -LogonType Interactive -RunLevel Limited
  Register-ScheduledTask -TaskName $TaskName -Action $action -Trigger $trigger -Settings $settings `
    -Principal $principal -Description 'Dispatches model-desk.yml when no run started in the last 50 minutes (scripts/desk-kick.ps1).' `
    -Force | Out-Null
  Write-Output "registered '$TaskName': hourly at :12 from $start"
  exit 0
}

$gh = (Get-Command gh -ErrorAction SilentlyContinue).Source
if (-not $gh) { $gh = 'C:\Program Files\GitHub CLI\gh.exe' }
if (-not (Test-Path $gh)) { Say 'gh not found; nothing done'; exit 1 }

Push-Location $Root
try {
  $json = & $gh run list --workflow $Workflow --limit 10 --json 'status,createdAt,event' 2>$null
  if ($LASTEXITCODE -ne 0 -or -not $json) { Say "couldn't list the desk's runs (gh exit $LASTEXITCODE); nothing done"; exit 1 }
  # (one string, then each run on its own: 5.1's ConvertFrom-Json hands back a JSON array as one object)
  $runs = @(($json -join "`n") | ConvertFrom-Json | ForEach-Object { $_ })

  $busy = $runs | Where-Object { $_.status -ne 'completed' } | Select-Object -First 1
  if ($busy) { Say "a run is already $($busy.status) ($($busy.event)); nothing to do"; exit 0 }

  # (Windows PowerShell 5.1's ConvertFrom-Json already reads the ISO times as dates; a newer one leaves strings)
  $latest = $runs | ForEach-Object { ([DateTime]$_.createdAt).ToUniversalTime() } | Sort-Object -Descending | Select-Object -First 1
  if ($latest) {
    $ago = [int]([DateTime]::UtcNow - $latest).TotalMinutes
    if ($ago -lt $RecentMinutes) { Say "one started $ago minutes ago; nothing to do"; exit 0 }
    $since = "the last started $ago minutes ago"
  } else { $since = 'no runs listed' }

  if ($DryRun) { Say "would dispatch $Workflow ($since)"; exit 0 }
  & $gh workflow run $Workflow --ref master 2>&1 | Out-Null
  if ($LASTEXITCODE -ne 0) { Say "couldn't dispatch $Workflow (gh exit $LASTEXITCODE)"; exit 1 }
  Say "dispatched $Workflow ($since)"
} finally {
  Pop-Location
}
