param(
    [Parameter(Mandatory=$true)][string]$GamePath,
    [string]$Plugin,
    [Parameter(Mandatory=$true)][string]$SkseSources,
    [Parameter(Mandatory=$true)][string]$HttpSources,
    [string]$GameSources,
    [switch]$CompileOnly
)
$ErrorActionPreference = 'Stop'
$compiler = Join-Path $GamePath 'Papyrus Compiler\PapyrusCompiler.exe'
if (!(Test-Path -LiteralPath $compiler)) { throw 'Install the Skyrim Special Edition Creation Kit and extract its script sources first.' }
if (!$GameSources) {
    $GameSources = Join-Path $GamePath 'Data\Source\Scripts'
    if (!(Test-Path -LiteralPath $GameSources)) { $GameSources = Join-Path $GamePath 'Data\Scripts\Source' }
}
foreach ($path in @($SkseSources, $HttpSources, $GameSources)) {
    if (!(Test-Path -LiteralPath $path)) { throw "Missing build input: $path" }
}
if (!$CompileOnly -and (!$Plugin -or !(Test-Path -LiteralPath $Plugin) -or [IO.Path]::GetFileName($Plugin) -ne 'NPCWorkshopSkyrim.esp')) {
    throw 'Supply the Creation Kit plugin NPCWorkshopSkyrim.esp, or use -CompileOnly to compile scripts first.'
}
$stage = Join-Path $PSScriptRoot 'dist\NPCWorkshopSkyrim'
$source = Join-Path $PSScriptRoot 'mod\Source\Scripts'
$scripts = Join-Path $stage 'Scripts'
New-Item -ItemType Directory -Path $scripts -Force | Out-Null
$includes = "$source;$SkseSources;$HttpSources;$GameSources"
$flags = Join-Path $GameSources 'TESV_Papyrus_Flags.flg'
if (!(Test-Path -LiteralPath $flags)) { throw "Missing compiler flags: $flags" }
foreach ($name in @('NWBridgeQuest', 'NWPlayerAlias')) {
    & $compiler (Join-Path $source "$name.psc") "-i=$includes" "-o=$scripts" "-f=$flags"
    if ($LASTEXITCODE -ne 0) { throw "Papyrus compilation failed: $name" }
}
if ($CompileOnly) { Write-Output "Compiled scripts: $scripts (no ESP/package created)"; exit 0 }
$stagedPlugin = Join-Path $stage 'NPCWorkshopSkyrim.esp'
if ((Resolve-Path -LiteralPath $Plugin).Path -ne [IO.Path]::GetFullPath($stagedPlugin)) {
    Copy-Item -LiteralPath $Plugin -Destination $stagedPlugin -Force
}
$sourceStage = Join-Path $stage 'Source'
New-Item -ItemType Directory -Path $sourceStage -Force | Out-Null
Copy-Item -LiteralPath $source -Destination $sourceStage -Recurse -Force
Compress-Archive -Path (Join-Path $stage '*') -DestinationPath (Join-Path $PSScriptRoot 'dist\NPCWorkshopSkyrim.zip') -Force
Write-Output "Built $stage. Install with a dedicated mod-manager profile; native dependencies are separate."
