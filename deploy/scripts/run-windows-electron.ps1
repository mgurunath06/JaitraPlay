$ErrorActionPreference = "Stop"
$ProgressPreference = "SilentlyContinue"

$repositoryRoot = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
$electronPackage = Get-Content (Join-Path $repositoryRoot "node_modules\electron\package.json") -Raw | ConvertFrom-Json
$electronVersion = $electronPackage.version
$runtimeRoot = Join-Path $repositoryRoot ".local\windows-electron\$electronVersion"
$electronExe = Join-Path $runtimeRoot "electron.exe"

if (-not (Test-Path $electronExe)) {
    $downloadRoot = Join-Path $repositoryRoot ".local\downloads"
    New-Item -ItemType Directory -Path $downloadRoot -Force | Out-Null
    New-Item -ItemType Directory -Path $runtimeRoot -Force | Out-Null

    $archiveName = "electron-v$electronVersion-win32-x64.zip"
    $archivePath = Join-Path $downloadRoot $archiveName
    $checksumsPath = Join-Path $downloadRoot "SHASUMS256-$electronVersion.txt"
    $releaseBase = "https://github.com/electron/electron/releases/download/v$electronVersion"

    if (-not (Test-Path $archivePath)) {
        Write-Host "Downloading Windows Electron $electronVersion from the official release..."
        Invoke-WebRequest -Uri "$releaseBase/$archiveName" -OutFile $archivePath
    }
    if (-not (Test-Path $checksumsPath)) {
        Invoke-WebRequest -Uri "$releaseBase/SHASUMS256.txt" -OutFile $checksumsPath
    }

    $checksumLine = Get-Content $checksumsPath | Where-Object { $_ -match "[ *]$([regex]::Escape($archiveName))$" } | Select-Object -First 1
    if (-not $checksumLine) {
        throw "Official checksum for $archiveName was not found"
    }
    $expectedHash = ($checksumLine -split "\s+")[0].ToUpperInvariant()
    $actualHash = (Get-FileHash -Path $archivePath -Algorithm SHA256).Hash
    if ($actualHash -ne $expectedHash) {
        Remove-Item $archivePath -Force
        throw "Electron archive checksum verification failed"
    }

    Expand-Archive -Path $archivePath -DestinationPath $runtimeRoot -Force
    Remove-Item $archivePath, $checksumsPath -Force
}

$env:JAITRA_UI_DEV_URL = "http://127.0.0.1:5173"
$env:JAITRA_CORE_URL = "http://127.0.0.1:8765"
Remove-Item Env:ELECTRON_RUN_AS_NODE -ErrorAction SilentlyContinue

$coreDeadline = (Get-Date).AddSeconds(45)
$health = $null
Write-Host "Waiting for the JAITRA core service..."
while ((Get-Date) -lt $coreDeadline) {
    try {
        $health = Invoke-RestMethod -Uri "$env:JAITRA_CORE_URL/api/v1/health" -TimeoutSec 2
        if ($health.ready) {
            break
        }
        Start-Sleep -Milliseconds 300
    }
    catch {
        Start-Sleep -Milliseconds 300
    }
}
if (-not $health -or -not $health.ready) {
    throw "JAITRA core did not become ready at $env:JAITRA_CORE_URL within 45 seconds. Start the 'JAITRA: Core' task and try again."
}

Write-Host "Starting Windows-native JAITRA Play thick client..."
Set-Location $repositoryRoot
$electronProcess = Start-Process -FilePath $electronExe -ArgumentList $repositoryRoot -PassThru -Wait
exit $electronProcess.ExitCode
