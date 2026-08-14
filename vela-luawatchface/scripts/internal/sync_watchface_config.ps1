. (Join-Path $PSScriptRoot "load_config.ps1")

function Convert-ToSnakeCase {
  param([string]$Value)
  if ([string]::IsNullOrWhiteSpace($Value)) { return "" }
  $s = $Value -creplace '([A-Z]+)([A-Z][a-z])', '$1_$2'
  $s = $s -creplace '([a-z0-9])([A-Z])', '$1_$2'
  $s = $s -creplace '[^A-Za-z0-9]+', '_'
  $s = $s -creplace '_+', '_'
  return $s.Trim('_').ToLowerInvariant()
}

if (-not $config.projectName) { throw "Missing projectName in watchface.config.json" }
if (-not $config.watchfaceId) { throw "Missing watchfaceId in watchface.config.json" }

$projectName = [string]$config.projectName
$watchfaceId = [string]$config.watchfaceId
$appModule = "app.$(Convert-ToSnakeCase $projectName)"

if ($watchfaceId -notmatch "^[0-9]+$") {
  throw "watchfaceId must be numeric: $watchfaceId"
}

$parsedId = 0
if (-not [int64]::TryParse($watchfaceId, [ref]$parsedId)) {
  throw "watchfaceId is too large: $watchfaceId"
}
if ($parsedId -lt 1 -or $parsedId -gt [int]::MaxValue) {
  throw "watchfaceId must be within 1..$([int]::MaxValue): $watchfaceId"
}

$fprjDir = Join-Path $root "watchface\fprj"
$fprjPath = Join-Path $fprjDir ("{0}.fprj" -f $projectName)
$mainLuaPath = Join-Path $root "watchface\fprj\app\lua\main.lua"

if (-not (Test-Path $fprjPath)) {
  $existing = Get-ChildItem -Path $fprjDir -Filter "*.fprj" -File
  if ($existing.Count -eq 1) {
    $targetName = [System.IO.Path]::GetFileName($fprjPath)
    Rename-Item -Path $existing[0].FullName -NewName $targetName
  } elseif ($existing.Count -eq 0) {
    throw "No .fprj found under watchface/fprj"
  } else {
    throw "Multiple .fprj files found under watchface/fprj; cannot decide which to rename"
  }
}

if (Test-Path $fprjPath) {
  $fprjText = Get-Content -Raw -Encoding Unicode $fprjPath
  $fprjText = [regex]::Replace(
    $fprjText,
    '(<Screen\s+Title=")[^"]*(")',
    "`$1$projectName`$2",
    1
  )
  Set-Content -Encoding Unicode -Path $fprjPath -Value $fprjText
}

if (Test-Path $mainLuaPath) {
  $mainText = Get-Content -Raw -Encoding UTF8 $mainLuaPath
  $mainText = [regex]::Replace(
    $mainText,
    '(?m)^local app_module = ".*"$',
    ('local app_module = "{0}"' -f $appModule),
    1
  )
  $mainText = [regex]::Replace(
    $mainText,
    '(?m)^local project_name = ".*"$',
    ('local project_name = "{0}"' -f $projectName),
    1
  )
  Write-Utf8NoBom -Path $mainLuaPath -Content $mainText
}

Write-Host "Synced watchface config."
