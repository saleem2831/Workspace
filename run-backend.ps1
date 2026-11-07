    Set-Location (Join-Path $PSScriptRoot 'backend')
    if (-not (Test-Path '.env')) { Write-Host 'Run node scripts/setup-local.mjs at the project root first.'; exit 1 }
    if (-not (Test-Path 'node_modules')) { Write-Host 'Installing backend packages...'; npm install; if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE } }
    npm run dev
