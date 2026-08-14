. (Join-Path $PSScriptRoot "internal\load_config.ps1")

# 生成 1..Int32Max 的随机 watchfaceId
$rng = New-Object System.Random
$max = [int]::MaxValue
$value = [math]::Round($rng.NextDouble() * $max, 0, [MidpointRounding]::AwayFromZero)
if ($value -lt 1) { $value = 1 }
$watchfaceId = ([int]$value).ToString()

$config.watchfaceId = $watchfaceId

$json = $config | ConvertTo-Json -Depth 10
Write-Utf8NoBom -Path (Join-Path $root "watchface.config.json") -Content ($json + "`r`n")

Write-Host "Generated watchfaceId: $watchfaceId"
