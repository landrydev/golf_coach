[CmdletBinding()]
param(
  [int]$Port = 4182
)

$ErrorActionPreference = "Stop"
$RepoRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$AppDir = Join-Path $RepoRoot "10_production_saas"

if (-not (Test-Path $AppDir)) {
  throw "10_production_saas was not found beside BETA2_SERVER.ps1."
}

$Host.UI.RawUI.WindowTitle = "Roadmap Beta 2 server"
Set-Location -LiteralPath $AppDir
$env:VISUAL_REVIEW_PORT = [string]$Port

Write-Host "Roadmap Beta 2 server" -ForegroundColor Cyan
Write-Host "Local origin: http://127.0.0.1:$Port"
Write-Host "Keep this window open while using Beta 2."
Write-Host ""

& node scripts/functional-qa-server.mjs
if ($LASTEXITCODE -ne 0) {
  throw "Beta 2 server exited with code $LASTEXITCODE."
}
