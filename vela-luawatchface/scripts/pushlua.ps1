param([switch]$Hot)

$ErrorActionPreference = "Stop"
. (Join-Path $PSScriptRoot "internal\load_config.ps1")

if (-not $Hot) {
  & (Join-Path $PSScriptRoot "internal\sync_watchface_list.ps1")
  if ($LASTEXITCODE) { exit $LASTEXITCODE }

  & (Join-Path $PSScriptRoot "internal\sync_watchface_config.ps1")
  if ($LASTEXITCODE) { exit $LASTEXITCODE }

  & (Join-Path $PSScriptRoot "internal\build_resource_bin.ps1")
  if ($LASTEXITCODE) { exit $LASTEXITCODE }

  & (Join-Path $PSScriptRoot "build_face.ps1")
  if ($LASTEXITCODE) { exit $LASTEXITCODE }
}

$watchfaceId = [string]$config.watchfaceId
if (-not $watchfaceId) {
  Write-Error "watchfaceId not found in watchface.config.json"
  exit 1
}

$destPath = "/data/app/watchface/market/$watchfaceId/"
$stampDir = ".hotreload"
$stampName = [DateTime]::UtcNow.ToString("yyyyMMddTHHmmssfffZ")
$stampLocal = Join-Path $env:TEMP $stampName
[System.IO.File]::WriteAllBytes($stampLocal, @())

$appDir = Join-Path $root "watchface\fprj\app"
$reloader = Join-Path $root "scripts\reloader.lua"

Write-Host "=========================================="
if ($Hot) {
  Write-Host "[HOT] Delete dir: ${destPath}lua"
} else {
  Write-Host "Delete dir: $destPath"
}
Write-Host "Push app contents: $appDir\* > $destPath"
Write-Host "Push user main as _app_main.lua"
Write-Host "Inject:     $reloader > ${destPath}lua/main.lua"
if (-not $Hot) {
  Write-Host "Push resource.bin, preview.bin, watchface_list.json"
}
Write-Host "Push stamp: $stampName"
Write-Host "=========================================="

if ($Hot) {
  & adb shell "rm -rf '${destPath}lua'"
  & adb shell "rm -rf '${destPath}${stampDir}'"
  & adb shell "mkdir '${destPath}${stampDir}'"
} else {
  & adb shell "rm -rf '$destPath'"
  & adb shell "mkdir '$destPath'"
  & adb shell "mkdir '${destPath}${stampDir}'"
}

# 镜像真机：将 fprj/app 下的每个子目录和文件推送到设备
Get-ChildItem -Path $appDir -Directory | ForEach-Object { & adb push $_.FullName $destPath }
Get-ChildItem -Path $appDir -File | ForEach-Object { & adb push $_.FullName $destPath }

# 用户 main.lua 推送为 _app_main.lua，再用重载器覆盖 main.lua
& adb push (Join-Path $appDir "lua\main.lua") "${destPath}lua/_app_main.lua"
& adb push $reloader "${destPath}lua/main.lua"

if (-not $Hot) {
  $dataDir = Join-Path $root "watchface\data"
  & adb push (Join-Path $dataDir "resource.bin") $destPath
  & adb push (Join-Path $dataDir "preview.bin") $destPath
  & adb push (Join-Path $dataDir "watchface_list.json") "/data/app/watchface/"
}

& adb push $stampLocal "${destPath}${stampDir}/${stampName}"

Remove-Item -Force $stampLocal -ErrorAction SilentlyContinue

if (-not $Hot) {
  & adb reboot
  if ($LASTEXITCODE) { exit $LASTEXITCODE }
}
