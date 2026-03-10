# PowerShell script to clean Android build directories
# This helps resolve Windows file locking issues

Write-Host "Cleaning Android build directories..." -ForegroundColor Yellow

# Stop any running Gradle daemons
Write-Host "Stopping Gradle daemons..." -ForegroundColor Cyan
& .\gradlew.bat --stop 2>&1 | Out-Null

# Remove build directories
$buildDirs = @(
    "app\build",
    "build",
    ".gradle"
)

foreach ($dir in $buildDirs) {
    if (Test-Path $dir) {
        Write-Host "Removing $dir..." -ForegroundColor Cyan
        try {
            Remove-Item -Path $dir -Recurse -Force -ErrorAction SilentlyContinue
            Write-Host "  ✓ Removed $dir" -ForegroundColor Green
        } catch {
            Write-Host "  ⚠ Could not fully remove $dir (some files may be locked)" -ForegroundColor Yellow
        }
    }
}

Write-Host "`nCleanup complete!" -ForegroundColor Green
Write-Host "You can now:" -ForegroundColor Cyan
Write-Host "  1. Open Android Studio" -ForegroundColor White
Write-Host "  2. Run: npm run build:capacitor" -ForegroundColor White
Write-Host "  3. Build from Android Studio" -ForegroundColor White
