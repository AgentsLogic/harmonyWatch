# PowerShell script to build Android debug APK from command line
# This bypasses Android Studio's daemon management to avoid file locking issues

Write-Host "Building Android Debug APK..." -ForegroundColor Cyan
Write-Host ""

# Navigate to project root
$projectRoot = Split-Path -Parent $PSScriptRoot
Set-Location $projectRoot

# Navigate to Android directory
$androidDir = Join-Path $projectRoot "android"
Set-Location $androidDir

Write-Host "1. Stopping all Gradle daemons..." -ForegroundColor Yellow
& .\gradlew.bat --stop 2>&1 | Out-Null
Start-Sleep -Seconds 2

Write-Host "2. Killing any remaining Java processes..." -ForegroundColor Yellow
Get-Process -Name "java" -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
Start-Sleep -Seconds 2

Write-Host "3. Manually cleaning node_modules transform directories..." -ForegroundColor Yellow
# Find and delete all .transforms directories in node_modules
$transformsDirs = Get-ChildItem -Path $projectRoot -Recurse -Directory -Filter ".transforms" -ErrorAction SilentlyContinue | Where-Object { $_.FullName -like "*node_modules*" }
foreach ($dir in $transformsDirs) {
    try {
        Remove-Item -Path $dir.FullName -Recurse -Force -ErrorAction SilentlyContinue
        Write-Host "   Deleted: $($dir.FullName)" -ForegroundColor Gray
    } catch {
        Write-Host "   Could not delete: $($dir.FullName)" -ForegroundColor Yellow
    }
}
Start-Sleep -Seconds 1

Write-Host "4. Manually cleaning Android build intermediates..." -ForegroundColor Yellow
# Clean Android build directories that might be locked
$androidBuildDirs = @(
    "$projectRoot\android\app\build",
    "$projectRoot\android\build"
)
foreach ($dir in $androidBuildDirs) {
    if (Test-Path $dir) {
        try {
            Remove-Item -Path $dir -Recurse -Force -ErrorAction SilentlyContinue
            Write-Host "   Deleted: $dir" -ForegroundColor Gray
        } catch {
            Write-Host "   Could not fully delete: $dir (some files may be locked)" -ForegroundColor Yellow
        }
    }
}
Start-Sleep -Seconds 1

Write-Host "5. Running Gradle clean..." -ForegroundColor Yellow
& .\gradlew.bat clean --no-daemon 2>&1 | Out-Null

Write-Host "6. Building debug APK (this may take a few minutes)..." -ForegroundColor Yellow
Write-Host ""

# Build with explicit --no-daemon flag
& .\gradlew.bat assembleDebug --no-daemon

if ($LASTEXITCODE -eq 0) {
    Write-Host ""
    Write-Host "Build successful!" -ForegroundColor Green
    Write-Host ""
    $apkPath = Join-Path $projectRoot "android\app\build\outputs\apk\debug\app-debug.apk"
    if (Test-Path $apkPath) {
        $apkSize = (Get-Item $apkPath).Length / 1MB
        Write-Host "APK location: $apkPath" -ForegroundColor Cyan
        Write-Host "APK size: $([math]::Round($apkSize, 2)) MB" -ForegroundColor Cyan
    }
} else {
    Write-Host ""
    Write-Host "Build failed with exit code $LASTEXITCODE" -ForegroundColor Red
    exit $LASTEXITCODE
}
