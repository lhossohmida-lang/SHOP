$ErrorActionPreference = "Stop"
$ProgressPreference = "SilentlyContinue"

$workspaceRoot = "c:\anis broger\shop\SHOP"
$sdkDir = Join-Path $workspaceRoot ".sdk"
$cmdlineToolsDir = Join-Path $sdkDir "cmdline-tools"
$latestDir = Join-Path $cmdlineToolsDir "latest"

# Clean up partial downloads or folders if latest is not complete
if (!(Test-Path $latestDir)) {
    Write-Host "Local Android SDK not found or incomplete. Cleaning up and setting it up..." -ForegroundColor Cyan
    
    # Clean up zip and temp dirs if they exist
    $zipPath = Join-Path $sdkDir "cmdline-tools.zip"
    if (Test-Path $zipPath) {
        Remove-Item $zipPath -Force | Out-Null
    }
    $tempExtract = Join-Path $sdkDir "temp_extract"
    if (Test-Path $tempExtract) {
        Remove-Item $tempExtract -Recurse -Force | Out-Null
    }
    if (Test-Path $latestDir) {
        Remove-Item $latestDir -Recurse -Force | Out-Null
    }

    if (!(Test-Path $sdkDir)) {
        New-Item -ItemType Directory -Force -Path $sdkDir | Out-Null
    }
    if (!(Test-Path $cmdlineToolsDir)) {
        New-Item -ItemType Directory -Force -Path $cmdlineToolsDir | Out-Null
    }

    Write-Host "Downloading Android SDK Command-line Tools (Windows) via curl..." -ForegroundColor Cyan
    $downloadUrl = "https://dl.google.com/android/repository/commandlinetools-win-14742923_latest.zip"
    
    # Run curl.exe with -L (follow redirects) and -o (output file)
    & curl.exe -L -o "$zipPath" "$downloadUrl"
    
    if (!(Test-Path $zipPath) -or (Get-Item $zipPath).Length -lt 1000000) {
        Write-Error "Failed to download cmdline-tools.zip or file is too small."
    }

    Write-Host "Extracting Command-line Tools..." -ForegroundColor Cyan
    Expand-Archive -Path $zipPath -DestinationPath $tempExtract -Force
    
    # The ZIP extracts a 'cmdline-tools' folder. Move its content to 'latest'
    $extractedCmdlineTools = Join-Path $tempExtract "cmdline-tools"
    Move-Item -Path $extractedCmdlineTools -Destination $latestDir -Force
    
    Remove-Item $tempExtract -Recurse -Force | Out-Null
    Remove-Item $zipPath -Force | Out-Null
    Write-Host "Command-line Tools set up successfully." -ForegroundColor Green
}

$sdkmanager = Join-Path $latestDir "bin\sdkmanager.bat"
if (!(Test-Path $sdkmanager)) {
    Write-Error "sdkmanager.bat not found at: $sdkmanager"
}

# 2. Configure ANDROID_HOME environment variable for this session
$env:ANDROID_HOME = $sdkDir
Write-Host "Setting ANDROID_HOME to: $env:ANDROID_HOME" -ForegroundColor Yellow

# Create local.properties file to make it persistent for Gradle builds
$localPropertiesPath = Join-Path $workspaceRoot "android\local.properties"
$sdkPathEscaped = $sdkDir.Replace('\', '/')
"sdk.dir=$sdkPathEscaped" | Out-File -FilePath $localPropertiesPath -Encoding ascii -Force
Write-Host "Created/Updated android/local.properties with sdk.dir=$sdkPathEscaped" -ForegroundColor Green

# 3. Accept Licenses and Install platform-tools, platforms;android-35, build-tools;35.0.0
Write-Host "Accepting Android SDK Licenses..." -ForegroundColor Cyan
$y = @("y") * 50
$y | & $sdkmanager --sdk_root=$sdkDir --licenses

Write-Host "Installing platform-tools, platforms;android-35, build-tools;35.0.0..." -ForegroundColor Cyan
$y | & $sdkmanager --sdk_root=$sdkDir "platform-tools" "platforms;android-35" "build-tools;35.0.0"

Write-Host "Local Android SDK Setup Complete!" -ForegroundColor Green
