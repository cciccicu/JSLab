param(
  [string]$FaceName,
  [string]$FaceId,
  [string]$CompilerPath
)

$ErrorActionPreference = "Stop"
. (Join-Path $PSScriptRoot "internal\load_config.ps1")

$projectName = [string]$config.projectName
$watchfaceId = [string]$config.watchfaceId

if (-not $FaceName) { $FaceName = "$projectName.face" }
if (-not $FaceId) { $FaceId = $watchfaceId }

if (-not $FaceId) { throw "watchfaceId not found in watchface.config.json" }
if (-not $projectName) { throw "projectName not found in watchface.config.json" }

$compilerExe = if ($CompilerPath) { (Resolve-Path -LiteralPath $CompilerPath).Path } else { Join-Path $root '../.local-tools/watchface/Compiler.exe' }
$fprj = Join-Path $root "watchface\fprj\$projectName.fprj"
$fprjOutput = Join-Path $root "watchface\fprj\output"
$outDir = Join-Path $root "bin"

if (-not (Test-Path $compilerExe)) { throw "Compiler.exe not found: $compilerExe" }
# This compiler automatically uploads when adb.exe is beside its executable.
# A build must never connect to a device; deployment uses pushlua.ps1 separately.
$compilerAdb = Join-Path (Split-Path -Parent $compilerExe) 'adb.exe'
if (Test-Path -LiteralPath $compilerAdb -PathType Leaf) {
  throw 'Use a compiler directory without adb.exe. Automatic device upload is not allowed during a build.'
}

& (Join-Path $PSScriptRoot "internal\sync_watchface_config.ps1")
if (-not (Test-Path $fprj)) { throw "Project .fprj not found: $fprj" }

if (-not (Test-Path $fprjOutput)) { New-Item -ItemType Directory -Path $fprjOutput | Out-Null }
if (-not (Test-Path $outDir)) { New-Item -ItemType Directory -Path $outDir | Out-Null }

Write-Host "=========================================="
Write-Host "Compiler: $compilerExe"
Write-Host "Project : $fprj"
Write-Host "Output  : $outDir $FaceName $FaceId"
Write-Host "=========================================="

& $compilerExe -b $fprj $outDir $FaceName $FaceId
if ($LASTEXITCODE) { throw "Build failed." }

$facePath = Join-Path $outDir $FaceName
& (Join-Path $PSScriptRoot "internal\set_face_id.ps1") -FacePath $facePath -WatchfaceId $FaceId

Write-Host "Done: $facePath"

$resourceDir = Join-Path $root "watchface\data"
$resourceBin = Join-Path $resourceDir "resource.bin"

if (-not (Test-Path $resourceDir)) { New-Item -ItemType Directory -Path $resourceDir | Out-Null }

Copy-Item -Force -Path $facePath -Destination $resourceBin
Write-Host "Generated: $resourceBin"
