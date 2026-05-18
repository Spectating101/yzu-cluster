param(
    [string]$TaskName = "SharpeRenaissance-CoinGecko-Failover",
    [string]$StartTime = "08:30",
    [int]$RandomDelayMinutes = 30,
    [string]$ControllerPublicKey = "ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIN2VBtD4VjVTvYSn5QeztFdtR4hfZdH7jNSekdotIMfC phyrexian@optiplex"
)

$ErrorActionPreference = "Stop"

$ScriptPath = $MyInvocation.MyCommand.Path
$Root = Split-Path -Parent (Split-Path -Parent $ScriptPath)
$Runner = Join-Path $Root "scripts\run_coingecko_daily_failover.ps1"

if (-not (Test-Path -LiteralPath $Runner)) {
    throw "Runner script not found: $Runner"
}

$sshDir = Join-Path $env:USERPROFILE ".ssh"
$authorizedKeys = Join-Path $sshDir "authorized_keys"
New-Item -ItemType Directory -Force -Path $sshDir | Out-Null
if (-not (Test-Path -LiteralPath $authorizedKeys)) {
    New-Item -ItemType File -Force -Path $authorizedKeys | Out-Null
}

$keyLine = $ControllerPublicKey.Trim()
if (-not $keyLine) {
    throw "ControllerPublicKey cannot be empty"
}

$existing = Get-Content -LiteralPath $authorizedKeys -ErrorAction SilentlyContinue
if (-not ($existing -contains $keyLine)) {
    Add-Content -LiteralPath $authorizedKeys -Value $keyLine
    Write-Host "✅ Added controller SSH key to $authorizedKeys"
} else {
    Write-Host "✅ Controller SSH key already present in $authorizedKeys"
}

$action = New-ScheduledTaskAction `
    -Execute "powershell.exe" `
    -Argument "-NoProfile -ExecutionPolicy Bypass -File `"$Runner`""

$trigger = New-ScheduledTaskTrigger -Daily -At $StartTime
if ($RandomDelayMinutes -gt 0) {
    $trigger.RandomDelay = "PT${RandomDelayMinutes}M"
}

$settings = New-ScheduledTaskSettingsSet `
    -StartWhenAvailable `
    -AllowStartIfOnBatteries `
    -DontStopIfGoingOnBatteries `
    -MultipleInstances IgnoreNew `
    -ExecutionTimeLimit (New-TimeSpan -Hours 3)

$principal = New-ScheduledTaskPrincipal `
    -UserId $env:USERNAME `
    -LogonType Interactive `
    -RunLevel Limited

Register-ScheduledTask `
    -TaskName $TaskName `
    -Action $action `
    -Trigger $trigger `
    -Settings $settings `
    -Principal $principal `
    -Description "Sharpe-Renaissance CoinGecko daily failover updater" `
    -Force | Out-Null

Write-Host "✅ Installed scheduled task: $TaskName"
Get-ScheduledTask -TaskName $TaskName | Format-List TaskName,State,Author
