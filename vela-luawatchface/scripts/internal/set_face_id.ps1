param(
  [Parameter(Mandatory = $true)]
  [string]$FacePath,

  [Parameter(Mandatory = $true)]
  [string]$WatchfaceId
)

$ErrorActionPreference = "Stop"

if (-not (Test-Path $FacePath)) {
  throw "Face file not found: $FacePath"
}
if ($WatchfaceId -notmatch "^[0-9]+$") {
  throw "Watchface ID must be numeric: $WatchfaceId"
}

$faceIdOffset = 40
$faceIdSize = 10
$bytes = [System.IO.File]::ReadAllBytes($FacePath)

if ($bytes.Length -lt ($faceIdOffset + $faceIdSize)) {
  throw "Face file is too small to patch watchface ID: $FacePath"
}

$expectedMagic = [byte[]](0x5A, 0xA5, 0x34, 0x12)
for ($i = 0; $i -lt $expectedMagic.Length; $i++) {
  if ($bytes[$i] -ne $expectedMagic[$i]) {
    throw "Unexpected face header, refusing to patch: $FacePath"
  }
}

$idBytes = [System.Text.Encoding]::ASCII.GetBytes($WatchfaceId)
if ($idBytes.Length -gt $faceIdSize) {
  throw "Watchface ID is too long for face header slot ($faceIdSize bytes): $WatchfaceId"
}

$bytes[5] = [byte]$faceIdSize
for ($i = 0; $i -lt $faceIdSize; $i++) {
  $bytes[$faceIdOffset + $i] = 0
}
[System.Array]::Copy($idBytes, 0, $bytes, $faceIdOffset, $idBytes.Length)

[System.IO.File]::WriteAllBytes($FacePath, $bytes)

$writtenId = [System.Text.Encoding]::ASCII.GetString($bytes, $faceIdOffset, $faceIdSize).Trim([char]0)
if ($writtenId -ne $WatchfaceId) {
  throw "Failed to patch watchface ID in $FacePath"
}

Write-Host "Patched face ID: $WatchfaceId"
