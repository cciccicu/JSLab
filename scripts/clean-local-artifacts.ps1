# Preview or remove reproducible local caches. Release archives and signing material are retained.
[CmdletBinding(SupportsShouldProcess = $true)]
param([switch]$Apply)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$workspaceRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$prefix = $workspaceRoot + [IO.Path]::DirectorySeparatorChar
$gitRoot = & git -C $workspaceRoot rev-parse --show-toplevel
if ($LASTEXITCODE -ne 0 -or [IO.Path]::GetFullPath($gitRoot.Trim()) -ne $workspaceRoot) {
    throw 'Run this script from a JSLab Git checkout.'
}

$candidates = @(
    '.codex-temp',
    'vela-quickapp/build',
    'vela-rpk-template/build',
    'astrobox-plugin-sync/target',
    'jslab-cloud/generated',
    'android-sync/build',
    'android-sync/app/build',
    'vela-luawatchface/watchface/data',
    'vela-luawatchface/watchface/fprj/output',
    'vela-luawatchface/watchface/tools/__pycache__'
)
$plan = foreach ($relative in $candidates) {
    $absolute = [IO.Path]::GetFullPath((Join-Path $workspaceRoot $relative))
    if (-not $absolute.StartsWith($prefix, [StringComparison]::OrdinalIgnoreCase)) { throw "Path outside workspace: $relative" }
    if (-not (Test-Path -LiteralPath $absolute)) { continue }
    $cursor = $absolute
    while ($cursor -ne $workspaceRoot) {
        if ((Get-Item -LiteralPath $cursor -Force).Attributes -band [IO.FileAttributes]::ReparsePoint) {
            throw "Refusing linked path: $cursor"
        }
        $cursor = [IO.Path]::GetDirectoryName($cursor)
    }
    $tracked = @(& git -C $workspaceRoot ls-files -- $relative)
    if ($LASTEXITCODE -ne 0 -or $tracked.Count) { throw "Refusing tracked path: $relative" }
    & git -C $workspaceRoot check-ignore --quiet -- $relative
    if ($LASTEXITCODE -ne 0) { throw "Path is not ignored: $relative" }
    $entries = @(Get-ChildItem -LiteralPath $absolute -Force -Recurse)
    if (@($entries | Where-Object { $_.Attributes -band [IO.FileAttributes]::ReparsePoint }).Count) {
        Write-Warning "Skipped cache containing a link: $relative"
        continue
    }
    $bytes = ($entries | Where-Object { -not $_.PSIsContainer } | Measure-Object Length -Sum).Sum
    [pscustomobject]@{ Relative = $relative; Absolute = $absolute; Bytes = [long]$bytes }
}
foreach ($item in $plan) {
    if ($Apply) {
        if ($PSCmdlet.ShouldProcess($item.Absolute, 'Remove ignored generated cache')) {
            Remove-Item -LiteralPath $item.Absolute -Recurse -Force
        }
    } else { Write-Output ("PREVIEW {0} ({1:N0} bytes)" -f $item.Relative, $item.Bytes) }
}
if (-not $Apply) { Write-Output 'Use -Apply to remove the listed caches. Dependencies, local tools, signatures and releases are retained.' }
