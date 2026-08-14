. (Join-Path $PSScriptRoot "load_config.ps1")

$resource = $config.resourceBin
$lvglVersion = if ($resource -and $resource.lvglVersion) { [int]$resource.lvglVersion } elseif ($config.lvglVersion) { [int]$config.lvglVersion } else { 9 }
$colorFormat = if ($resource -and $resource.colorFormat) { [string]$resource.colorFormat } else { "I8" }
$compress = if ($resource -and $resource.compress) { [string]$resource.compress } else { "NONE" }
$inputRel = if ($resource -and $resource.input) { [string]$resource.input } else { "watchface\fprj\images\preview.png" }
$outputDir = Join-Path $root "watchface\data"
$outputName = if ($resource -and $resource.name) { [string]$resource.name } else { "preview" }
$colorFormat = $colorFormat.ToUpperInvariant()
$compress = $compress.ToUpperInvariant()

$rgb565Dither = $resource -and $resource.rgb565Dither
$premultiply = $resource -and $resource.premultiply
$align = if ($resource -and $resource.align) { [int]$resource.align } else { 1 }
$background = if ($resource -and $resource.background) { [string]$resource.background } else { $null }

$inputPath = Join-Path $root $inputRel
if (-not (Test-Path $inputPath)) {
  Write-Error "preview image not found: $inputPath"
  exit 1
}

if ($lvglVersion -ne 8 -and $lvglVersion -ne 9) {
  Write-Error "resourceBin.lvglVersion must be 8 or 9"
  exit 1
}

if ($lvglVersion -eq 8 -and $compress -ne "NONE") {
  Write-Error "LVGL v8 converter only supports compress=NONE"
  exit 1
}

if ($lvglVersion -eq 8 -and $align -ne 1) {
  Write-Error "LVGL v8 converter only supports align=1"
  exit 1
}

$tool = if ($lvglVersion -eq 8) {
  Join-Path $root "watchface\tools\LVGLImage_v8.py"
} else {
  Join-Path $root "watchface\tools\LVGLImage.py"
}

if (-not (Test-Path $tool)) {
  Write-Error "converter not found: $tool"
  exit 1
}

if (-not (Test-Path $outputDir)) {
  New-Item -ItemType Directory -Path $outputDir | Out-Null
}

$pyArgs = @(
  $tool,
  "--cf", $colorFormat,
  "--output", $outputDir,
  "--name", $outputName
)

if ($lvglVersion -eq 9) {
  $pyArgs += @("--ofmt", "BIN", "--compress", $compress, "--align", $align)
}

if ($rgb565Dither) { $pyArgs += "--rgb565dither" }
if ($premultiply) { $pyArgs += "--premultiply" }
if ($background) { $pyArgs += @("--background", $background) }

$pyArgs += $inputPath

Write-Host "Generating preview.bin (LVGL v$lvglVersion, $colorFormat, $compress)..."
$venvPython = Join-Path $root ".venv\Scripts\python.exe"
$pythonExe = if (Test-Path $venvPython) { $venvPython } else { "python" }
& $pythonExe @pyArgs
if ($LASTEXITCODE -ne 0) {
  exit $LASTEXITCODE
}

$inputBase = [System.IO.Path]::GetFileNameWithoutExtension($inputPath)
$generatedFile = Join-Path $outputDir ($inputBase + ".bin")
$outFile = if ([string]::IsNullOrWhiteSpace($outputName)) {
  $generatedFile
} else {
  Join-Path $outputDir ($outputName + ".bin")
}
if (-not (Test-Path $outFile) -and $generatedFile -ne $outFile -and (Test-Path $generatedFile)) {
  Move-Item -Force -Path $generatedFile -Destination $outFile
}
if (-not (Test-Path $outFile)) {
  Write-Error "preview bin not generated: $outFile"
  exit 1
}

Write-Host "Generated: $outFile"
