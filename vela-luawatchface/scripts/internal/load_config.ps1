$ErrorActionPreference = "Stop"

# 定位项目根目录（从 scripts/internal/ 往上两级）
$_configRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot "..\..\"))
$_configPath = Join-Path $_configRoot "watchface.config.json"
if (-not (Test-Path $_configPath)) {
  throw "watchface.config.json not found at $_configPath"
}

$config = Get-Content -Raw -Encoding UTF8 $_configPath | ConvertFrom-Json
$root = $_configRoot

$utf8NoBom = New-Object System.Text.UTF8Encoding $false
function Write-Utf8NoBom {
  param([string]$Path, [string]$Content)
  [System.IO.File]::WriteAllText($Path, $Content, $utf8NoBom)
}
