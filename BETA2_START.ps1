[CmdletBinding()]
param(
  [switch]$Verify,
  [switch]$Reinstall
)

$ErrorActionPreference = "Stop"
$RepoRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$AppDir = Join-Path $RepoRoot "10_production_saas"
$HomePage = Join-Path $RepoRoot "BETA2_HOME.html"
$ServerScript = Join-Path $RepoRoot "BETA2_SERVER.ps1"
$Port = 4182
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

foreach ($required in @($AppDir, $HomePage, $ServerScript)) {
  if (-not (Test-Path $required)) {
    throw "Required Beta 2 file is missing: $required"
  }
}

Write-Host ""
Write-Host "Roadmap Beta 2 - premium low-admin experience" -ForegroundColor Cyan
Write-Host "Repository: $RepoRoot"
Write-Host "Application: $AppDir"
Write-Host ""

if (Test-BetaReady) {
  Write-Host "Beta 2 is already running at $Origin." -ForegroundColor Green
  Open-BetaPages
  return
}

$nodeCommand = Get-Command node -ErrorAction SilentlyContinue
if (-not $nodeCommand) {
  throw "Node.js was not found. Install Node.js 22.13 or newer, then run this launcher again."
}
$nodeVersionText = (& node --version).Trim().TrimStart("v").Split("-")[0]
$nodeVersion = [version]$nodeVersionText
if ($nodeVersion -lt [version]"22.13.0") {
  throw "Node.js $nodeVersionText is installed. Roadmap Beta 2 requires Node.js 22.13 or newer."
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

  Write-Host "Building Beta 2..." -ForegroundColor Yellow
  & npm run build
  if ($LASTEXITCODE -ne 0) {
    throw "npm run build failed with exit code $LASTEXITCODE."
  }

  if ($Verify) {
    Write-Host "Running the complete verification suite..." -ForegroundColor Yellow
    & npm run verify
    if ($LASTEXITCODE -ne 0) {
      throw "npm run verify failed with exit code $LASTEXITCODE."
    }
  }
} finally {
  Pop-Location
}

Write-Host "Starting Beta 2 in a separate PowerShell window..." -ForegroundColor Yellow
$serverArguments = @(
  "-NoProfile",
  "-ExecutionPolicy", "Bypass",
  "-NoExit",
  "-File", $ServerScript,
  "-Port", [string]$Port
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
  throw "Beta 2 did not become ready. Review the separate Roadmap Beta 2 server window."
}

Write-Host ""
Write-Host "Beta 2 is ready." -ForegroundColor Green
Write-Host "Experience guide: $HomePage"
Write-Host "Coach experience: $Origin/__qa/standard/app"
Write-Host "Golfer publication: $Origin/__qa/standard/golfer"
Write-Host ""
Write-Host "Synthetic scenario data resets when the server window closes." -ForegroundColor DarkGray
Write-Host "Close the Roadmap Beta 2 server window when finished." -ForegroundColor DarkGray

Open-BetaPages
