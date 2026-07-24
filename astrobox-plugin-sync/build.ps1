$ErrorActionPreference = 'Stop'

$pluginRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$workspaceRoot = Split-Path -Parent $pluginRoot
$dist = Join-Path $pluginRoot 'dist'
$target = Join-Path $pluginRoot 'target\wasm32-wasip2\release\jslab_astrobox_sync.wasm'

cargo build --offline --manifest-path (Join-Path $pluginRoot 'Cargo.toml') --target wasm32-wasip2 --release
if ($LASTEXITCODE -ne 0) {
    throw "cargo build failed with exit code $LASTEXITCODE"
}

New-Item -ItemType Directory -Force $dist | Out-Null
Copy-Item -Force $target (Join-Path $dist 'jslab_sync.wasm')
Copy-Item -Force (Join-Path $pluginRoot 'manifest.json') (Join-Path $dist 'manifest.json')
Copy-Item -Force (Join-Path $workspaceRoot 'vela-quickapp\src\common\logo.png') (Join-Path $dist 'icon.png')

$archive = Join-Path $pluginRoot 'JSLab-Sync.abp'
$archiveZip = Join-Path $pluginRoot 'JSLab-Sync.zip'
Compress-Archive -Path (Join-Path $dist '*') -DestinationPath $archiveZip -Force
Move-Item -Force $archiveZip $archive
Write-Host "Built $archive"
