param(
    [string]$Passcode = ""
)

$ErrorActionPreference = "Stop"

$projectDir = Split-Path -Parent $PSScriptRoot
$repoDir = Split-Path -Parent $projectDir
$telegramDir = Join-Path $repoDir "Telegram Bot"
$configPath = Join-Path $telegramDir "config.json"

if (-not (Test-Path -LiteralPath $configPath)) {
    throw "Telegram Bot config not found: $configPath"
}

$config = Get-Content -LiteralPath $configPath -Raw | ConvertFrom-Json
$serviceAccountName = [string]$config.google_service_account_file
$serviceAccountPath = Join-Path $telegramDir $serviceAccountName

if (-not (Test-Path -LiteralPath $serviceAccountPath)) {
    throw "Service account file not found: $serviceAccountPath"
}

$serviceAccount = Get-Content -LiteralPath $serviceAccountPath -Raw | ConvertFrom-Json
$sheetLocation = [string]$config.google_spreadsheet

if ($sheetLocation -match "/spreadsheets/d/([^/]+)") {
    $sheetId = $Matches[1]
} elseif ($sheetLocation.Trim()) {
    $sheetId = $sheetLocation.Trim()
} else {
    throw "google_spreadsheet is missing from Telegram Bot/config.json"
}

$envPath = Join-Path $projectDir ".env.local"

if (-not $Passcode -and (Test-Path -LiteralPath $envPath)) {
    $existingPasscode = Get-Content -LiteralPath $envPath |
        Where-Object { $_ -match "^ORDER_ENTRY_PASSCODE=" } |
        Select-Object -First 1
    if ($existingPasscode) {
        $Passcode = $existingPasscode.Substring("ORDER_ENTRY_PASSCODE=".Length)
    }
}

if (-not $Passcode) {
    $Passcode = "CHANGE_ME_BEFORE_DEPLOYING"
}

$privateKey = ([string]$serviceAccount.private_key).
    Replace("`r", "").
    Replace("`n", "\n")

$customerPrefix = if ($config.customer_id_prefix) {
    [string]$config.customer_id_prefix
} else {
    "500100"
}

$lines = @(
    "GOOGLE_SHEET_ID=$sheetId",
    "GOOGLE_SERVICE_ACCOUNT_EMAIL=$([string]$serviceAccount.client_email)",
    "GOOGLE_PRIVATE_KEY=`"$privateKey`"",
    "ORDER_ENTRY_PASSCODE=$Passcode",
    "CUSTOMER_ID_PREFIX=$customerPrefix",
    "ORDER_ENTRY_TIMEZONE=Asia/Kolkata"
)

[System.IO.File]::WriteAllLines(
    $envPath,
    $lines,
    [System.Text.UTF8Encoding]::new($false)
)

Write-Output "Imported Telegram Bot Google Sheets configuration into OrderEntryWeb/.env.local."
Write-Output "Set a strong ORDER_ENTRY_PASSCODE before deploying."
