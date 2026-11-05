[CmdletBinding()]
param([string]$Proxy)

$ErrorActionPreference = 'Stop'
$projectRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$localRoot = Join-Path $projectRoot '.local/dependencies'
New-Item -ItemType Directory -Force -Path $localRoot | Out-Null

function Test-Digest([string]$Path, [string]$Expected) {
    return (Test-Path -LiteralPath $Path -PathType Leaf) -and (Get-FileHash -LiteralPath $Path -Algorithm SHA256).Hash.Equals($Expected, [StringComparison]::OrdinalIgnoreCase)
}

function Get-Dependency([string]$Url, [string]$Path) {
    $parameters = @{ Uri = $Url; OutFile = $Path; UseBasicParsing = $true }
    if ($Proxy) { $parameters.Proxy = $Proxy }
    Invoke-WebRequest @parameters
}

$aar = Join-Path $projectRoot 'app/libs/xms-wearable-lib_1.4_release.aar'
$aarHash = '9c40fd1c5409bb948523d503af71e2978ae522c35636afe7d64f474c0f6bc195'
if (-not (Test-Digest $aar $aarHash)) {
    $archive = Join-Path $localRoot 'xiaomi-interconnect.zip'
    Get-Dependency 'https://cdn.cnbj3-fusion.fds.api.mi-img.com/quickapp-vela/interconnect_dev_test_demo.zip' $archive
    Add-Type -AssemblyName System.IO.Compression.FileSystem
    $zip = [IO.Compression.ZipFile]::OpenRead($archive)
    $staged = Join-Path $localRoot 'xms-wearable.aar'
    try {
        $entry = $zip.GetEntry('interconnect_dev_test_demo/libs/xms-wearable-lib_1.4_release.aar')
        if (-not $entry) { throw 'The official archive does not contain the expected XMS SDK.' }
        [IO.Compression.ZipFileExtensions]::ExtractToFile($entry, $staged, $true)
    } finally { $zip.Dispose() }
    if (-not (Test-Digest $staged $aarHash)) { throw 'XMS SDK checksum mismatch; existing SDK was not replaced.' }
    New-Item -ItemType Directory -Force -Path (Split-Path -Parent $aar) | Out-Null
    Copy-Item -LiteralPath $staged -Destination $aar -Force
}

$source = Join-Path $projectRoot 'third-party/sora-editor-0.24.4-source.zip'
$sourceHash = 'b738baf5a37b724a7b918b1ffc7e94f2ea78e0926285150618bee67197ce580f'
if (-not (Test-Digest $source $sourceHash)) {
    $staged = Join-Path $localRoot 'sora-editor-0.24.4-source.zip'
    Get-Dependency 'https://codeload.github.com/Rosemoe/sora-editor/zip/refs/tags/0.24.4' $staged
    if (-not (Test-Digest $staged $sourceHash)) { throw 'Sora source checksum mismatch; existing source archive was not replaced.' }
    New-Item -ItemType Directory -Force -Path (Split-Path -Parent $source) | Out-Null
    Copy-Item -LiteralPath $staged -Destination $source -Force
}
Write-Host 'XMS SDK and corresponding Sora sources are present and verified.'
