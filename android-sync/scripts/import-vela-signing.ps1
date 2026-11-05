param(
    [string]$Certificate = '../vela-quickapp/sign/certificate.pem',
    [string]$PrivateKey = '../vela-quickapp/sign/private.pem'
)
$ErrorActionPreference = 'Stop'
Push-Location (Split-Path -Parent $PSScriptRoot)
try {
    if (Test-Path -LiteralPath 'keystore.properties') { throw 'keystore.properties 已存在，未覆盖任何签名配置。' }
    if (Test-Path -LiteralPath '.local/jslab-sync.p12') { throw '.local/jslab-sync.p12 已存在，未覆盖已有密钥。' }
    $certificatePath = (Resolve-Path -LiteralPath $Certificate).Path
    $privateKeyPath = (Resolve-Path -LiteralPath $PrivateKey).Path
    $opensslCommand = (Get-Command openssl -ErrorAction Stop).Source
    New-Item -ItemType Directory -Path '.local' -Force | Out-Null
    $passwordBytes = New-Object byte[] 32
    $randomSource = [System.Security.Cryptography.RandomNumberGenerator]::Create()
    try { $randomSource.GetBytes($passwordBytes) } finally { $randomSource.Dispose() }
    $signingPassword = [Convert]::ToBase64String($passwordBytes)
    $env:JSLAB_ANDROID_IMPORT_PASSWORD = $signingPassword
    try {
        & $opensslCommand pkcs12 -export -in $certificatePath -inkey $privateKeyPath -out '.local/jslab-sync.p12' -name jslab -passout env:JSLAB_ANDROID_IMPORT_PASSWORD
        if ($LASTEXITCODE -ne 0) { throw '签名导入失败，请检查证书与私钥是否匹配。' }
    } finally {
        Remove-Item Env:JSLAB_ANDROID_IMPORT_PASSWORD -ErrorAction SilentlyContinue
    }
    $properties = @(
        'storeFile=.local/jslab-sync.p12', 'storeType=PKCS12',
        "storePassword=$signingPassword", 'keyAlias=jslab', "keyPassword=$signingPassword"
    ) -join "`n"
    [System.IO.File]::WriteAllText((Join-Path (Get-Location) 'keystore.properties'), $properties, (New-Object System.Text.UTF8Encoding $false))
    Write-Host '已在本子项目创建本地 PKCS12 和签名配置；原 Vela 文件未修改。'
    & $opensslCommand x509 -in $certificatePath -noout -fingerprint -sha256
} finally { Pop-Location }
