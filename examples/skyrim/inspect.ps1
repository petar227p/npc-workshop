param([string]$GamePath)
$ErrorActionPreference = 'Stop'
if (!$GamePath) {
    $steamRoots = @('C:\Program Files (x86)\Steam')
    foreach ($registry in @('HKCU:\Software\Valve\Steam', 'HKLM:\SOFTWARE\WOW6432Node\Valve\Steam')) {
        $entry = Get-ItemProperty $registry -ErrorAction SilentlyContinue
        if ($entry.SteamPath) { $steamRoots += $entry.SteamPath }
        if ($entry.InstallPath) { $steamRoots += $entry.InstallPath }
    }
    $libraries = @($steamRoots)
    foreach ($steamRoot in ($steamRoots | Select-Object -Unique)) {
        $vdf = Join-Path $steamRoot 'steamapps\libraryfolders.vdf'
        if (Test-Path -LiteralPath $vdf) {
            foreach ($match in [regex]::Matches((Get-Content -LiteralPath $vdf -Raw), '"path"\s+"([^"]+)"')) {
                $libraries += $match.Groups[1].Value.Replace('\\', '\')
            }
        }
    }
    foreach ($library in ($libraries | Select-Object -Unique)) {
        $candidate = Join-Path $library 'steamapps\common\Skyrim Special Edition'
        if (Test-Path -LiteralPath (Join-Path $candidate 'SkyrimSE.exe')) { $GamePath = $candidate; break }
    }
}
if (!$GamePath) { throw 'Skyrim not found. Run again with -GamePath <installation directory>.' }
$GamePath = (Resolve-Path -LiteralPath $GamePath).Path
$exe = Get-Item -LiteralPath (Join-Path $GamePath 'SkyrimSE.exe')
$runtimeVersion = $exe.VersionInfo.FileVersion.Replace('.', '-')
$checks = @('skse64_loader.exe', 'Data\SKSE\Plugins\SKSE_HTTP.dll', "Data\SKSE\Plugins\versionlib-$runtimeVersion.bin", 'CreationKit.exe', 'Papyrus Compiler\PapyrusCompiler.exe')
$files = foreach ($relative in $checks) {
    $path = Join-Path $GamePath $relative
    $file = Get-Item -LiteralPath $path -ErrorAction SilentlyContinue
    [pscustomobject]@{ File = $relative; Present = [bool]$file; Version = if ($file) { $file.VersionInfo.FileVersion } else { $null } }
}
[pscustomobject]@{
    GamePath = $GamePath; ExecutableVersion = $exe.VersionInfo.FileVersion
    SteamManifestPresent = Test-Path -LiteralPath (Join-Path $GamePath '..\..\appmanifest_489830.acf')
    Tools = @($files)
    Note = 'Presence/version checks only. Native DLL compatibility requires an SKSE load and HTTP smoke test.'
} | ConvertTo-Json -Depth 5
