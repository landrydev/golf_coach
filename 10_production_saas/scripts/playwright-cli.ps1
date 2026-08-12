[CmdletBinding(PositionalBinding = $false)]
param(
    [Parameter(Mandatory = $true)]
    [ValidatePattern('^[a-z0-9](?:[a-z0-9-]{0,78}[a-z0-9])?$')]
    [string]$CandidateId,

    [Parameter(Mandatory = $true)]
    [ValidatePattern('^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$')]
    [string]$Session,

    [ValidateRange(1, 65535)]
    [int]$Port = 4175,

    [Parameter(ValueFromRemainingArguments = $true)]
    [string[]]$CliArguments
)

$ErrorActionPreference = 'Stop'

if (-not $CliArguments -or $CliArguments.Count -eq 0) {
    throw 'Provide a Playwright CLI command such as open, snapshot, resize, screenshot, or tracing-start.'
}

$projectRoot = Split-Path -Parent $PSScriptRoot
$repositoryRoot = Split-Path -Parent $projectRoot
$outputRoot = Join-Path $repositoryRoot 'output\playwright'
$candidateDirectory = Join-Path $outputRoot $CandidateId
$cliPath = Join-Path $projectRoot 'node_modules\@playwright\cli\playwright-cli.js'
$manifestWriter = Join-Path $PSScriptRoot 'write-functional-qa-manifest.mjs'
$ledgerWriter = Join-Path $PSScriptRoot 'write-functional-qa-ledger.mjs'
$sourceIdentityWriter = Join-Path $PSScriptRoot 'source-identity.mjs'
$buildIdentityWriter = Join-Path $PSScriptRoot 'build-artifact-identity.mjs'
$manifestPath = Join-Path $candidateDirectory 'candidate-manifest.json'
$ledgerPath = Join-Path $candidateDirectory 'completion-ledger.json'
$sourceIdentityPath = Join-Path $candidateDirectory 'source-identity.json'
$buildIdentityPath = Join-Path $candidateDirectory 'build-identity.json'
$node = (Get-Command node -ErrorAction Stop).Source

if (-not (Test-Path -LiteralPath $cliPath -PathType Leaf)) {
    throw 'Pinned @playwright/cli is not installed. Run npm ci from 10_production_saas.'
}

if (-not (Test-Path -LiteralPath $manifestPath)) {
    foreach ($partialPath in @($ledgerPath, $sourceIdentityPath, $buildIdentityPath)) {
        if (Test-Path -LiteralPath $partialPath) {
            throw "Candidate setup is partial or ambiguous at $partialPath. Use a new CandidateId; immutable identity files are never overwritten."
        }
    }

    & $node $sourceIdentityWriter '--candidate' $CandidateId
    if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

    & $node $buildIdentityWriter '--candidate' $CandidateId
    if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

    & $node $manifestWriter `
        '--candidate' $CandidateId `
        '--origin' "http://127.0.0.1:$Port" `
        '--output-root' $outputRoot
    if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
}
elseif (-not (Test-Path -LiteralPath $ledgerPath -PathType Leaf)) {
    throw 'This is a historical v1/v2 candidate without an identity-bound completion ledger. Use a new CandidateId; historical artifacts remain read-only and ineligible.'
}
else {
    & $node $manifestWriter `
        '--candidate' $CandidateId `
        '--origin' "http://127.0.0.1:$Port" `
        '--output-root' $outputRoot
    if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
}

& $node $ledgerWriter '--candidate' $CandidateId '--output-root' $outputRoot
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Push-Location -LiteralPath $candidateDirectory
try {
    Write-Output "Playwright artifacts: $candidateDirectory"
    & $node $cliPath "-s=$Session" @CliArguments
    $cliExitCode = $LASTEXITCODE
}
finally {
    Pop-Location
}

exit $cliExitCode
