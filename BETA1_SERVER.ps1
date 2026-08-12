[CmdletBinding()]
param(
  [int]$Port = 4175
)

$ErrorActionPreference = "Stop"
$RepoRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$AppDir = Join-Path $RepoRoot "10_production_saas"

if (-not (Test-Path $AppDir)) {
  throw "10_production_saas was not found beside BETA1_SERVER.ps1."
}

$Host.UI.RawUI.WindowTitle = "Roadmap Beta 1 server"
Set-Location -LiteralPath $AppDir
$env:VISUAL_REVIEW_PORT = [string]$Port

Write-Host "Roadmap Beta 1 server" -ForegroundColor Cyan
Write-Host "Local origin: http://127.0.0.1:$Port"
Write-Host "Keep this window open while using Beta 1."
Write-Host ""

& npm run qa:functional:server
if ($LASTEXITCODE -ne 0) {
  throw "Beta 1 server exited with code $LASTEXITCODE."
}
