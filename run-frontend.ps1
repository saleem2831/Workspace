    Set-Location (Join-Path $PSScriptRoot 'frontend')
    if (-not (Test-Path 'node_modules')) { Write-Host 'Installing frontend packages...'; npm install; if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE } }
    npm run dev
