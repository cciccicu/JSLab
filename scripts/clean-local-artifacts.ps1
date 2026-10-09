<#
.SYNOPSIS
Preview or remove JSLab temporary directories, build caches and obsolete packages.
.EXAMPLE
.\scripts\clean-local-artifacts.ps1
.EXAMPLE
.\scripts\clean-local-artifacts.ps1 -Apply
.EXAMPLE
.\scripts\clean-local-artifacts.ps1 -Apply -WhatIf
#>
[CmdletBinding(SupportsShouldProcess = $true)]
param([switch]$Apply)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$workspaceRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$rootPrefix = $workspaceRoot + [IO.Path]::DirectorySeparatorChar
$gitRoot = & git -C $workspaceRoot rev-parse --show-toplevel
if ($LASTEXITCODE -ne 0 -or [IO.Path]::GetFullPath($gitRoot.Trim()) -ne $workspaceRoot) {
    throw 'The script must belong to the root of the JSLab Git repository.'
}

function Resolve-SafeTarget([string]$RelativePath) {
    $absolute = [IO.Path]::GetFullPath((Join-Path $workspaceRoot $RelativePath))
    if (-not $absolute.StartsWith($rootPrefix, [StringComparison]::OrdinalIgnoreCase)) {
        throw "Target outside workspace: $RelativePath"
    }
    $cursor = $absolute
    while ($cursor -ne $workspaceRoot) {
        if (Test-Path -LiteralPath $cursor) {
            $item = Get-Item -LiteralPath $cursor -Force
            if ($item.Attributes -band [IO.FileAttributes]::ReparsePoint) {
                throw "Refusing to follow a link or junction: $cursor"
            }
        }
        $cursor = [IO.Path]::GetDirectoryName($cursor)
    }
    return $absolute
}

# Keep dependencies, signing keys, device documentation, user artwork and current packages.
$candidatePaths = [Collections.Generic.List[string]]::new()
@(
    '.codex-temp',
    'astrobox-plugin-sync/target',
    'astrobox-plugin-sync/release-archive',
    'ccicc-plugin-cloud/release-archive',
    'ccicc-plugin-cloud/development-kit/dist',
    'ccicc-plugin-cloud/jslab-cloud/dist',
    'vela-quickapp/build',
    'vela-quickapp/release-archive',
    'vela-quickapp/diagnostics/ui-performance-app/build',
    'vela-luawatchface/build',
    'vela-luawatchface/dist',
    'vela-luawatchface/watchface/data',
    'vela-luawatchface/watchface/fprj/output',
    'vela-luawatchface/watchface/tools/__pycache__',
    'vela-quickapp/scripts/__pycache__'
) | ForEach-Object { $candidatePaths.Add($_) }

$app = Get-Content -LiteralPath (Join-Path $workspaceRoot 'vela-quickapp/src/manifest.json') -Encoding UTF8 -Raw | ConvertFrom-Json
$diagnostic = Get-Content -LiteralPath (Join-Path $workspaceRoot 'vela-quickapp/diagnostics/ui-performance-app/src/manifest.json') -Encoding UTF8 -Raw | ConvertFrom-Json
$astro = Get-Content -LiteralPath (Join-Path $workspaceRoot 'astrobox-plugin-sync/manifest.json') -Encoding UTF8 -Raw | ConvertFrom-Json
$cloud = Get-Content -LiteralPath (Join-Path $workspaceRoot 'ccicc-plugin-cloud/jslab-cloud/manifest.json') -Encoding UTF8 -Raw | ConvertFrom-Json
$distRules = @(
    @{ Path = 'vela-quickapp/dist'; Keep = @("$($app.package).debug.$($app.versionName).rpk", "$($app.package).release.$($app.versionName).rpk") },
    @{ Path = 'vela-quickapp/diagnostics/ui-performance-app/dist'; Keep = @("$($diagnostic.package).debug.$($diagnostic.versionName).rpk", "$($diagnostic.package).release.$($diagnostic.versionName).rpk") },
    @{ Path = 'astrobox-plugin-sync/dist'; Keep = @("JSLab-Sync-$($astro.version).abp") },
    @{ Path = 'ccicc-plugin-cloud/dist'; Keep = @("$($cloud.id)-$($cloud.version).zip") }
)
foreach ($rule in $distRules) {
    $directory = Resolve-SafeTarget $rule.Path
    if (-not (Test-Path -LiteralPath $directory)) { continue }
    foreach ($item in Get-ChildItem -LiteralPath $directory -Force) {
        if ($rule.Keep -contains $item.Name) {
            Write-Output "KEEP $($rule.Path)/$($item.Name)"
        } else {
            $candidatePaths.Add("$($rule.Path)/$($item.Name)")
        }
    }
}

# Validate every candidate before deleting anything.
$plan = @(
    foreach ($relative in $candidatePaths) {
        $absolute = Resolve-SafeTarget $relative
        if (-not (Test-Path -LiteralPath $absolute)) { continue }
        $tracked = @(& git -C $workspaceRoot ls-files -- $relative)
        if ($LASTEXITCODE -ne 0) { throw "Git tracking check failed: $relative" }
        if ($tracked.Count -gt 0) { throw "Refusing to delete tracked files: $relative" }
        & git -C $workspaceRoot check-ignore --quiet -- $relative
        if ($LASTEXITCODE -ne 0) { throw "Target must be Git-ignored before cleanup: $relative" }
        $item = Get-Item -LiteralPath $absolute -Force
        $entries = if ($item.PSIsContainer) { @(Get-ChildItem -LiteralPath $absolute -Recurse -Force) } else { @($item) }
        if (@($entries | Where-Object { $_.Attributes -band [IO.FileAttributes]::ReparsePoint }).Count -gt 0) {
            throw "Refusing a directory containing links or junctions: $relative"
        }
        $files = @($entries | Where-Object { -not $_.PSIsContainer })
        $bytes = [long]0
        foreach ($file in $files) { $bytes += $file.Length }
        [pscustomobject]@{ Relative = $relative; Absolute = $absolute; Files = $files.Count; Bytes = $bytes }
    }
)
$totalBytes = [long]0
$totalFiles = 0
foreach ($entry in $plan) {
    $totalBytes += $entry.Bytes
    $totalFiles += $entry.Files
    Write-Output ('CLEAN {0}: {1} files, {2:N2} MiB' -f $entry.Relative, $entry.Files, ($entry.Bytes / 1MB))
}
Write-Output ('Plan: {0} targets, {1} files, {2:N2} MiB.' -f $plan.Count, $totalFiles, ($totalBytes / 1MB))
if (-not $Apply) {
    Write-Output 'Preview only. Pass -Apply to delete these targets; current packages are kept.'
    return
}
foreach ($entry in $plan) {
    # Repeat boundary/tracking checks immediately before each removal.
    $absolute = Resolve-SafeTarget $entry.Relative
    $tracked = @(& git -C $workspaceRoot ls-files -- $entry.Relative)
    if ($LASTEXITCODE -ne 0 -or $tracked.Count -gt 0) { throw "Tracking changed: $($entry.Relative)" }
    if ($PSCmdlet.ShouldProcess($absolute, 'Delete ignored temporary or obsolete build artifact')) {
        Remove-Item -LiteralPath $absolute -Recurse -Force
        if (Test-Path -LiteralPath $absolute) { throw "Cleanup did not remove: $absolute" }
    }
}
Write-Output 'Cleanup finished.'
