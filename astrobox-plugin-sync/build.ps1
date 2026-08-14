$ErrorActionPreference = 'Stop'

$pluginRoot = [System.IO.Path]::GetFullPath((Split-Path -Parent $MyInvocation.MyCommand.Path))
$dist = [System.IO.Path]::GetFullPath((Join-Path $pluginRoot 'dist'))
$target = Join-Path $pluginRoot 'target\wasm32-wasip2\release\jslab_astrobox_sync.wasm'
$icon = Join-Path $pluginRoot 'icon.png'

$expectedDist = Join-Path $pluginRoot 'dist'
if (-not $dist.Equals($expectedDist, [System.StringComparison]::OrdinalIgnoreCase)) {
    throw "Refusing to clean unexpected dist path: $dist"
}
if (-not (Test-Path -LiteralPath $icon -PathType Leaf)) {
    throw "Plugin icon is missing: $icon"
}

$cargoCommand = Get-Command cargo -ErrorAction SilentlyContinue
if ($cargoCommand) {
    $cargoExe = $cargoCommand.Source
} else {
    $cargoExe = Join-Path $env:USERPROFILE '.cargo\bin\cargo.exe'
}
if (-not (Test-Path -LiteralPath $cargoExe -PathType Leaf)) {
    throw "cargo is missing; install the Rust stable toolchain first"
}

& $cargoExe build --offline --manifest-path (Join-Path $pluginRoot 'Cargo.toml') --target wasm32-wasip2 --release
if ($LASTEXITCODE -ne 0) {
    throw "cargo build failed with exit code $LASTEXITCODE"
}

if (Test-Path -LiteralPath $dist) {
    Remove-Item -LiteralPath $dist -Recurse -Force
}
New-Item -ItemType Directory -Path $dist | Out-Null
Copy-Item -Force $target (Join-Path $dist 'jslab_sync.wasm')
Copy-Item -Force (Join-Path $pluginRoot 'manifest.json') (Join-Path $dist 'manifest.json')
Copy-Item -Force $icon (Join-Path $dist 'icon.png')

$archive = Join-Path $pluginRoot 'JSLab-Sync.abp'
$archiveZip = Join-Path $pluginRoot 'JSLab-Sync.zip'
$packageFiles = @(
    (Join-Path $dist 'manifest.json'),
    (Join-Path $dist 'icon.png'),
    (Join-Path $dist 'jslab_sync.wasm')
)
Compress-Archive -LiteralPath $packageFiles -DestinationPath $archiveZip -Force
Move-Item -Force $archiveZip $archive
Write-Host "Built $archive"
