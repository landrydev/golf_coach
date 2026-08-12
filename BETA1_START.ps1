[CmdletBinding()]
param(
  [switch]$Verify,
  [switch]$Reinstall
)

$ErrorActionPreference = "Stop"
$RepoRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$AppDir = Join-Path $RepoRoot "10_production_saas"
$HomePage = Join-Path $RepoRoot "BETA1_HOME.html"
$Port = 4175
$Origin = "http://127.0.0.1:$Port"

function Test-BetaReady {
  try {
    $response = Invoke-WebRequest -Uri "$Origin/__qa/status" -UseBasicParsing -TimeoutSec 2
    return $response.StatusCode -eq 200
  } catch {
    return $false
  }
}

function Open-BetaPages {
  Start-Process $HomePage
  Start-Process "$Origin/__qa/standard/app"
}

if (-not (Test-Path $AppDir)) {
  throw "10_production_saas was not found beside BETA1_START.ps1. Use the complete Beta 1 package or repository clone."
}
if (-not (Test-Path $HomePage)) {
  throw "BETA1_HOME.html is missing."
}

Write-Host ""
Write-Host "Roadmap Beta 1 — local full-feature experience" -ForegroundColor Cyan
Write-Host "Repository: $RepoRoot"
Write-Host "Application: $AppDir"
Write-Host ""

if (Test-BetaReady) {
  Write-Host "Beta 1 is already running at $Origin." -ForegroundColor Green
  Open-BetaPages
  return
}

$nodeText = (& node --version 2>$null).Trim()
if (-not $nodeText) {
  throw "Node.js was not found. Install Node.js 22.13 or newer, then run this launcher again."
}
$nodeVersionText = $nodeText.TrimStart("v").Split("-")[0]
$nodeVersion = [version]$nodeVersionText
if ($nodeVersion -lt [version]"22.13.0") {
  throw "Node.js $nodeVersionText is installed. Roadmap Beta 1 requires Node.js 22.13 or newer."
}
Write-Host "Node.js $nodeVersionText detected." -ForegroundColor Green

Push-Location $AppDir
try {
  if ($Reinstall -or -not (Test-Path (Join-Path $AppDir "node_modules"))) {
    Write-Host "Installing the locked dependency graph..." -ForegroundColor Yellow
    & npm ci --ignore-scripts
    if ($LASTEXITCODE -ne 0) {
      throw "npm ci failed with exit code $LASTEXITCODE."
    }
  } else {
    Write-Host "Existing node_modules detected. Use -Reinstall to replace it from package-lock.json."
  }

  if ($Verify) {
    Write-Host "Running the complete verification suite before launch..." -ForegroundColor Yellow
    & npm run verify
    if ($LASTEXITCODE -ne 0) {
      throw "npm run verify failed with exit code $LASTEXITCODE."
    }
  }
} finally {
  Pop-Location
}

$escapedAppDir = $AppDir.Replace("'", "''")
$serverCommand = @"
`$Host.UI.RawUI.WindowTitle = 'Roadmap Beta 1 server'
Set-Location -LiteralPath '$escapedAppDir'
`$env:VISUAL_REVIEW_PORT = '$Port'
npm run qa:functional:server
"@

Write-Host "Starting the local Beta 1 server in a separate PowerShell window..." -ForegroundColor Yellow
$serverArguments = @(
  "-NoProfile",
  "-ExecutionPolicy", "Bypass",
  "-NoExit",
  "-Command", $serverCommand
)
$serverProcess = Start-Process -FilePath "powershell.exe" -ArgumentList $serverArguments -PassThru

$ready = $false
for ($attempt = 1; $attempt -le 180; $attempt++) {
  if ($serverProcess.HasExited) {
    break
  }
  if (Test-BetaReady) {
    $ready = $true
    break
  }
  Start-Sleep -Seconds 2
}

if (-not $ready) {
  throw "The Beta 1 server did not become ready. Review the separate 'Roadmap Beta 1 server' window for the exact error."
}

Write-Host ""
Write-Host "Beta 1 is ready." -ForegroundColor Green
Write-Host "Experience guide: $HomePage"
Write-Host "Full coach workspace: $Origin/__qa/standard/app"
Write-Host "Full golfer experience: $Origin/__qa/standard/golfer"
Write-Host ""
Write-Host "The server uses synthetic local data and resets when the server window is closed." -ForegroundColor DarkGray
Write-Host "Close the separate 'Roadmap Beta 1 server' window when you are finished." -ForegroundColor DarkGray

Open-BetaPages
