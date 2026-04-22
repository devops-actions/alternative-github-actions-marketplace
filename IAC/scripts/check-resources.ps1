Param(
    [Parameter(Mandatory=$true)][string]$ResourceGroup,
    [string]$SubscriptionId = $null,
    [string]$Environment = 'dev',
    [string]$Location = 'westeurope',
    [string]$StaticWebAppLocation = 'West Europe',
    [string]$TemplateFile = 'IAC/main.bicep'
)

<#
.SYNOPSIS
    Pre-deploy duplicate resource check (best-effort).

.DESCRIPTION
    Runs an 'az deployment group what-if' against the provided resource group and template
    with common parameters to surface naming conflicts or errors before a real deployment.

    This script is opt-in and intended for CI usage. It requires the Azure CLI (az) and an
    authenticated session (e.g., azure/login in GitHub Actions). If the CLI or credentials
    are missing, the script will exit with a non-zero code describing the problem.

.EXAMPLE
    pwsh -File .\IAC\scripts\check-resources.ps1 -ResourceGroup my-rg -SubscriptionId xxxxx -Environment prod -Location "West Europe" -StaticWebAppLocation "West Europe"
#>

Write-Host "Starting pre-deploy duplicate resource check..."

# Ensure az is available
if (-not (Get-Command az -ErrorAction SilentlyContinue)) {
    Write-Error "Azure CLI (az) not found in PATH. Cannot perform duplicate check."
    exit 2
}

# Optionally set subscription
if ($SubscriptionId) {
    Write-Host "Setting Azure subscription to $SubscriptionId"
    $setResult = az account set --subscription $SubscriptionId 2>&1
    if ($LASTEXITCODE -ne 0) {
        Write-Error "Failed to set subscription: $setResult"
        exit 1
    }
}

# Build parameter list for what-if. Only include parameters that are provided.
$parameters = @()
if ($PSBoundParameters.ContainsKey('Environment')) { $parameters += "environment=$Environment" }
if ($PSBoundParameters.ContainsKey('Location')) { $parameters += "location=$Location" }
if ($PSBoundParameters.ContainsKey('StaticWebAppLocation')) { $parameters += "staticWebAppLocation=$StaticWebAppLocation" }

Write-Host "Running 'az deployment group what-if' to simulate deployment against resource group '$ResourceGroup'..."

# Run what-if. Capturing both stdout and stderr to inspect failures.
$whatIfOutput = az deployment group what-if --resource-group $ResourceGroup --template-file $TemplateFile --parameters $parameters --no-progress -o json 2>&1
$whatIfExit = $LASTEXITCODE

if ($whatIfExit -ne 0) {
    Write-Error "'az deployment group what-if' returned an error. Output:\n$whatIfOutput"
    exit 1
}

# Try to parse JSON output
try {
    $whatIfJson = $whatIfOutput | ConvertFrom-Json -ErrorAction Stop
} catch {
    Write-Error "Failed to parse what-if JSON output. Raw output:\n$whatIfOutput"
    exit 1
}

# Best-effort scan: look for common conflict keywords in the raw output
$raw = $whatIfOutput -join "`n"
if ($raw -match '(Conflict|AlreadyExists|PreconditionFailed|ConflictWithExistingResource)') {
    Write-Error "What-if output indicates possible existing resource name conflicts or errors:\n"
    $matches = Select-String -InputObject $raw -Pattern '(Conflict|AlreadyExists|PreconditionFailed|ConflictWithExistingResource)' -AllMatches
    $matches | ForEach-Object { Write-Error $_.Line }
    exit 1
}

Write-Host "What-if simulation completed. No obvious duplicate resource name conflicts detected."
Write-Host "Note: this is a best-effort check. For strict guarantees, run the full deployment in a safe test subscription or examine the what-if output locally."

exit 0
