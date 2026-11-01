param(
    [Parameter(Mandatory=$true)][string]$GamePath,
    [string]$Plugin,
    [Parameter(Mandatory=$true)][string]$SkseSources,
    [Parameter(Mandatory=$true)][string]$HttpSources,
    [string]$GameSources,
    [string]$OutputDirectory,
    [switch]$CompileOnly,
    [switch]$BootstrapUiCompiler
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
if (!$OutputDirectory) { $OutputDirectory = Join-Path $PSScriptRoot 'dist\NPCWorkshopSkyrim' }
$stage = [IO.Path]::GetFullPath($OutputDirectory)
# A failed compiler/build never changes the previous complete release.
$work = $stage
if (!$CompileOnly) { $work = Join-Path $PSScriptRoot ('dist\build-' + [Guid]::NewGuid().ToString('N')) }
$source = Join-Path $PSScriptRoot 'mod\Source\Scripts'
$scripts = Join-Path $work 'Scripts'
New-Item -ItemType Directory -Path $scripts -Force | Out-Null
$includes = "$source;$SkseSources;$HttpSources;$GameSources"
$flags = Join-Path $GameSources 'TESV_Papyrus_Flags.flg'
if (!(Test-Path -LiteralPath $flags)) { throw "Missing compiler flags: $flags" }
foreach ($name in @('NWBridgeQuest', 'NWPlayerAlias', 'NWBrannActor')) {
    & $compiler (Join-Path $source "$name.psc") "-i=$includes" "-o=$scripts" "-f=$flags"
    if ($LASTEXITCODE -ne 0) { throw "Papyrus compilation failed: $name" }
}
if ($CompileOnly) { Write-Output "Compiled scripts: $scripts (no ESP/package created)"; exit 0 }
$uiArgs = @((Join-Path $PSScriptRoot 'ui\build.py'), '--output', (Join-Path $work 'Interface\NPCWorkshop\Conversation.swf'))
if ($BootstrapUiCompiler) { $uiArgs += '--bootstrap' }
& python @uiArgs
if ($LASTEXITCODE -ne 0) { throw 'Conversation SWF compilation failed.' }
& python (Join-Path $PSScriptRoot 'package_mod.py') --compiled $work --plugin $Plugin --output $stage --papyrus-compiler $compiler --skse-sources $SkseSources --http-sources $HttpSources --game-sources $GameSources
if ($LASTEXITCODE -ne 0) { throw 'Mod archive creation failed.' }
Write-Output "Built $stage.zip. Install the verified ZIP with a dedicated mod-manager profile; native dependencies are separate."
