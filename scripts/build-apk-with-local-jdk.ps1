$ErrorActionPreference = "Stop"
$ProgressPreference = "SilentlyContinue"

$workspaceRoot = "c:\anis broger\shop\SHOP"
$jdkDir = Join-Path $workspaceRoot ".jdk"

# Clean up older JDK 17 if present
if (Test-Path $jdkDir) {
    $existingDirs = Get-ChildItem -Path $jdkDir -Directory
    if ($existingDirs.Count -gt 0 -and $existingDirs[0].Name -like "*17*") {
        Write-Host "Found older JDK 17. Cleaning it up to upgrade to JDK 21..." -ForegroundColor Yellow
        Remove-Item $jdkDir -Recurse -Force | Out-Null
    }
}

# 1. Download and Extract JDK 21 if not already present
$jdkSubDirs = @()
if (Test-Path $jdkDir) {
    $jdkSubDirs = Get-ChildItem -Path $jdkDir -Directory
}

if ($jdkSubDirs.Count -eq 0) {
    if (!(Test-Path $jdkDir)) {
        New-Item -ItemType Directory -Force -Path $jdkDir | Out-Null
    }
    
    $zipPath = Join-Path $jdkDir "jdk21.zip"
    Write-Host "Downloading Eclipse Temurin JDK 21 (Windows x64)..." -ForegroundColor Cyan
    
    # Use standard WebClient or Invoke-WebRequest
    [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
    Invoke-WebRequest -Uri "https://api.adoptium.net/v3/binary/latest/21/ga/windows/x64/jdk/hotspot/normal/eclipse" -OutFile $zipPath
    
    Write-Host "Extracting JDK 21..." -ForegroundColor Cyan
    Expand-Archive -Path $zipPath -DestinationPath $jdkDir -Force
    
    Remove-Item $zipPath -Force
    Write-Host "JDK 21 downloaded and extracted successfully." -ForegroundColor Green
    
    $jdkSubDirs = Get-ChildItem -Path $jdkDir -Directory
}

if ($jdkSubDirs.Count -eq 0) {
    Write-Error "Failed to locate extracted JDK directory."
}

# 2. Configure Environment Variables for this session
$javaHome = $jdkSubDirs[0].FullName
Write-Host "Setting JAVA_HOME to: $javaHome" -ForegroundColor Yellow

$env:JAVA_HOME = $javaHome
$env:PATH = "$javaHome\bin;$env:PATH"

# 2.5 Ensure local Android SDK is set up
Write-Host "Ensuring local Android SDK is set up..." -ForegroundColor Cyan
& (Join-Path $workspaceRoot "scripts\setup-local-sdk.ps1")

# 3. Run the APK build command
Write-Host "Running APK build command: npm.cmd run android:apk" -ForegroundColor Cyan
npm.cmd run android:apk

