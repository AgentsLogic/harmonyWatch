# PowerShell script to clean ALL Android build directories
# This includes both android/ and node_modules/ build directories
# Run this before building to prevent Windows file locking issues

# Detect script location and set paths accordingly
$scriptPath = Split-Path -Parent $MyInvocation.MyCommand.Path
$scriptName = Split-Path -Leaf $MyInvocation.MyCommand.Path

# Determine if we're in android/ directory or project root
if (Test-Path "gradlew.bat") {
    # We're in android/ directory
    $androidDir = Get-Location
    $projectRoot = Split-Path -Parent $androidDir
    $nodeModulesPath = Join-Path $projectRoot "node_modules"
} else {
    # We're in project root, need to find android directory
    if (Test-Path "android\gradlew.bat") {
        $projectRoot = Get-Location
        $androidDir = Join-Path $projectRoot "android"
        $nodeModulesPath = Join-Path $projectRoot "node_modules"
    } else {
        Write-Host "[ERROR] Cannot find android directory. Please run from project root or android/ directory." -ForegroundColor Red
        exit 1
    }
}

Write-Host "Cleaning all Android build directories..." -ForegroundColor Yellow
Write-Host "Android directory: $androidDir" -ForegroundColor Gray
Write-Host "Project root: $projectRoot" -ForegroundColor Gray

# Stop any running Gradle daemons
Write-Host ""
Write-Host "Stopping Gradle daemons..." -ForegroundColor Cyan
$gradlewPath = Join-Path $androidDir "gradlew.bat"
if (Test-Path $gradlewPath) {
    Push-Location $androidDir
    & .\gradlew.bat --stop 2>&1 | Out-Null
    Pop-Location
    Write-Host "  [OK] Gradle daemons stopped" -ForegroundColor Green
} else {
    Write-Host "  [WARN] gradlew.bat not found, skipping Gradle daemon stop" -ForegroundColor Yellow
}

# Kill any Java/Gradle processes that might be holding file locks
Write-Host "Killing any remaining Java/Gradle processes..." -ForegroundColor Cyan
$javaProcesses = Get-Process | Where-Object {$_.ProcessName -like "*java*" -or $_.ProcessName -like "*gradle*"} -ErrorAction SilentlyContinue
if ($javaProcesses) {
    foreach ($proc in $javaProcesses) {
        try {
            Stop-Process -Id $proc.Id -Force -ErrorAction SilentlyContinue
        } catch {
            # Silently continue
        }
    }
    Write-Host "  [OK] Killed $($javaProcesses.Count) Java/Gradle processes" -ForegroundColor Green
} else {
    Write-Host "  [OK] No Java/Gradle processes found" -ForegroundColor Green
}

# Wait a moment for file handles to be released
Start-Sleep -Seconds 1

# Clean android/ build directories
Write-Host ""
Write-Host "Cleaning android/ build directories..." -ForegroundColor Cyan
$androidBuildDirs = @(
    "app\build",
    "build",
    ".gradle"
)

Push-Location $androidDir
foreach ($dir in $androidBuildDirs) {
    if (Test-Path $dir) {
        try {
            Remove-Item -Path $dir -Recurse -Force -ErrorAction SilentlyContinue
            Write-Host "  [OK] Removed $dir" -ForegroundColor Green
        } catch {
            Write-Host "  [WARN] Could not fully remove $dir (some files may be locked)" -ForegroundColor Yellow
        }
    }
}
Pop-Location

# Clean node_modules build directories (Capacitor plugins)
Write-Host ""
Write-Host "Cleaning node_modules build directories..." -ForegroundColor Cyan

if (Test-Path $nodeModulesPath) {
    # Find all .transforms directories in node_modules (these cause file locking issues)
    $transformsDirs = Get-ChildItem -Path $nodeModulesPath -Recurse -Directory -Filter ".transforms" -ErrorAction SilentlyContinue
    
    if ($transformsDirs -and $transformsDirs.Count -gt 0) {
        Write-Host "  Found $($transformsDirs.Count) .transforms directories to clean..." -ForegroundColor Cyan
        $cleanedCount = 0
        foreach ($dir in $transformsDirs) {
            try {
                $relativePath = $dir.FullName.Replace((Resolve-Path $nodeModulesPath).Path + "\", "")
                Remove-Item -Path $dir.FullName -Recurse -Force -ErrorAction SilentlyContinue
                $cleanedCount++
            } catch {
                # Silently continue - some files may be locked
            }
        }
        Write-Host "  [OK] Cleaned $cleanedCount .transforms directories" -ForegroundColor Green
    } else {
        Write-Host "  [OK] No .transforms directories found in node_modules" -ForegroundColor Green
    }
    
    # Find and clean ALL build directories in Capacitor plugins
    # This includes nested build directories like @capacitor\android\capacitor\build
    Write-Host "  Searching for build directories in Capacitor plugins..." -ForegroundColor Cyan
    
    # Find all build directories in node_modules that are in Capacitor-related packages
    $allBuildDirs = Get-ChildItem -Path $nodeModulesPath -Recurse -Directory -Filter "build" -ErrorAction SilentlyContinue | 
        Where-Object { 
            $_.FullName -like "*@capacitor*" -or 
            $_.FullName -like "*@revenuecat*" -or 
            $_.FullName -like "*@mediagrid*" -or
            $_.FullName -like "*capacitor*"
        }
    
    $buildDirsCleaned = 0
    if ($allBuildDirs -and $allBuildDirs.Count -gt 0) {
        Write-Host "  Found $($allBuildDirs.Count) build directories to clean..." -ForegroundColor Cyan
        foreach ($buildDir in $allBuildDirs) {
            try {
                $relativePath = $buildDir.FullName.Replace((Resolve-Path $nodeModulesPath).Path + "\", "")
                Remove-Item -Path $buildDir.FullName -Recurse -Force -ErrorAction SilentlyContinue
                $buildDirsCleaned++
            } catch {
                # Silently continue - some files may be locked
            }
        }
        Write-Host "  [OK] Cleaned $buildDirsCleaned build directories" -ForegroundColor Green
    } else {
        Write-Host "  [OK] No build directories found in Capacitor plugins" -ForegroundColor Green
    }
    
    # Also find and clean intermediates directories (these cause issues too)
    $intermediatesDirs = Get-ChildItem -Path $nodeModulesPath -Recurse -Directory -Filter "intermediates" -ErrorAction SilentlyContinue | 
        Where-Object { 
            $_.FullName -like "*@capacitor*" -or 
            $_.FullName -like "*@revenuecat*" -or 
            $_.FullName -like "*@mediagrid*" -or
            $_.FullName -like "*capacitor*"
        }
    
    $intermediatesCleaned = 0
    if ($intermediatesDirs -and $intermediatesDirs.Count -gt 0) {
        Write-Host "  Found $($intermediatesDirs.Count) intermediates directories to clean..." -ForegroundColor Cyan
        foreach ($intermediatesDir in $intermediatesDirs) {
            try {
                Remove-Item -Path $intermediatesDir.FullName -Recurse -Force -ErrorAction SilentlyContinue
                $intermediatesCleaned++
            } catch {
                # Silently continue
            }
        }
        Write-Host "  [OK] Cleaned $intermediatesCleaned intermediates directories" -ForegroundColor Green
    }
    
    # Also find and clean generated directories
    $generatedDirs = Get-ChildItem -Path $nodeModulesPath -Recurse -Directory -Filter "generated" -ErrorAction SilentlyContinue | 
        Where-Object { 
            $_.FullName -like "*@capacitor*" -or 
            $_.FullName -like "*@revenuecat*" -or 
            $_.FullName -like "*@mediagrid*" -or
            $_.FullName -like "*capacitor*"
        }
    
    $generatedCleaned = 0
    if ($generatedDirs -and $generatedDirs.Count -gt 0) {
        Write-Host "  Found $($generatedDirs.Count) generated directories to clean..." -ForegroundColor Cyan
        foreach ($generatedDir in $generatedDirs) {
            try {
                Remove-Item -Path $generatedDir.FullName -Recurse -Force -ErrorAction SilentlyContinue
                $generatedCleaned++
            } catch {
                # Silently continue
            }
        }
        Write-Host "  [OK] Cleaned $generatedCleaned generated directories" -ForegroundColor Green
    }
} else {
    Write-Host "  [WARN] node_modules directory not found" -ForegroundColor Yellow
}

Write-Host ""
Write-Host "[OK] Cleanup complete!" -ForegroundColor Green
Write-Host ""
Write-Host "You can now:" -ForegroundColor Cyan
Write-Host "  1. Run: npm run build:capacitor" -ForegroundColor White
Write-Host "  2. Build from Android Studio" -ForegroundColor White
