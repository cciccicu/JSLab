param([switch]$Release)
$ErrorActionPreference = 'Stop'
Push-Location (Split-Path -Parent $PSScriptRoot)
try {
    & (Join-Path $PSScriptRoot 'prepare-dependencies.ps1')
    if ($Release -and !(Test-Path -LiteralPath 'keystore.properties')) {
        throw 'Release 需要与 Vela 应用一致的签名。先运行 scripts/import-vela-signing.ps1，或按 keystore.properties.example 配置。'
    }
    $variant = if ($Release) { 'Release' } else { 'Debug' }
    & .\gradlew.bat ':app:testDebugUnitTest' ':app:lintDebug' ":app:assemble$variant" '--console=plain'
    if ($LASTEXITCODE -ne 0) { throw 'Android 构建或检查失败。' }
    & node 'scripts/verify-vela-compat.mjs'
    if ($LASTEXITCODE -ne 0) { throw 'Vela v2 协议兼容性检查失败。' }
    $variantDirectory = $variant.ToLowerInvariant()
    $sourceApk = "app/build/outputs/apk/$variantDirectory/app-$variantDirectory.apk"
    New-Item -ItemType Directory -Path 'dist' -Force | Out-Null
    $suffix = if ($Release) { '' } else { '-debug' }
    $outputApk = "dist/JSLab-Sync-1.0.1$suffix.apk"
    Copy-Item -LiteralPath $sourceApk -Destination $outputApk -Force
    New-Item -ItemType Directory -Path 'dist/third-party' -Force | Out-Null
    Copy-Item -LiteralPath 'third-party/sora-editor-0.24.4-source.zip','third-party/sora-editor-0.24.4-source.zip.sha256' -Destination 'dist/third-party' -Force
    Copy-Item -LiteralPath '../docs/third-party/android-editor.md' -Destination 'dist/third-party/THIRD_PARTY_NOTICES.md' -Force
    $hash = (Get-FileHash -LiteralPath $outputApk -Algorithm SHA256).Hash.ToLowerInvariant()
    Set-Content -LiteralPath "$outputApk.sha256" -Value "$hash  $(Split-Path -Leaf $outputApk)" -Encoding UTF8
    Write-Host "已生成 $outputApk"
} finally { Pop-Location }
