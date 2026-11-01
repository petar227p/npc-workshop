"""Create and verify a deterministic, allowlisted Skyrim demo package (stdlib only)."""
import argparse
import hashlib
import json
from pathlib import Path
import shutil
import struct
import tempfile
import zipfile

HERE = Path(__file__).resolve().parent
SCRIPTS = ('NWBridgeQuest', 'NWPlayerAlias', 'NWBrannActor')
ASSETS = (
    'meshes/actors/character/facegendata/facegeom/NPCWorkshopSkyrim.esp/00000800.nif',
    'textures/actors/character/facegendata/facetint/NPCWorkshopSkyrim.esp/00000800.dds',
)
STAMP = 946684800  # 2000-01-01 UTC, metadata only; never a gameplay/session timestamp.
ZIP_DATE = (2000, 1, 1, 0, 0, 0)
MANIFEST = 'NPCWorkshop-manifest.json'
EXPECTED_FILES = {
    'NPCWorkshopSkyrim.esp', 'Interface/NPCWorkshop/Conversation.swf', 'NPCWorkshop-README.txt', *ASSETS,
    *(f'Scripts/{s}.pex' for s in SCRIPTS), *(f'Source/Scripts/{s}.psc' for s in SCRIPTS),
    *(f'Source/UI/{s}' for s in ('ConversationMenu.as', 'build.py', 'toolchain.json')),
}


def sha(data):
    return hashlib.sha256(data).hexdigest()


def json_bytes(value):
    return (json.dumps(value, indent=2, sort_keys=True, ensure_ascii=True) + '\n').encode()


def normalize_pex(data):
    """Normalize only Skyrim PEX build/source metadata; retain string table and code.

    Layout reference: Orvid/Caprica, Caprica/pex/PexFile.cpp and PexDebugInfo.cpp.
    Skyrim is big endian, version 3.1/3.2, game ID 1. Unknown formats fail closed.
    """
    if len(data) < 16 or data[:8] not in (bytes.fromhex('fa57c0de03010001'), bytes.fromhex('fa57c0de03020001')):
        raise ValueError('Unsupported Skyrim PEX header')
    offset = 16

    def read_string():
        nonlocal offset
        if offset + 2 > len(data):
            raise ValueError('Truncated PEX string length')
        size = struct.unpack_from('>H', data, offset)[0]
        offset += 2
        end = offset + size
        if end > len(data):
            raise ValueError('Truncated PEX string')
        result = data[offset:end]
        offset = end
        return result

    source = read_string().replace(b'\\', b'/').split(b'/')[-1]
    read_string()  # compiler user
    read_string()  # compiler computer
    body_start = offset
    if offset + 2 > len(data):
        raise ValueError('Truncated PEX string table')
    count = struct.unpack_from('>H', data, offset)[0]
    offset += 2
    for _ in range(count):
        read_string()
    if offset >= len(data) or data[offset] not in (0, 1):
        raise ValueError('Invalid PEX debug flag')
    body = bytearray(data[body_start:])
    if data[offset] == 1:
        if offset + 11 > len(data):
            raise ValueError('Truncated PEX debug header')
        struct.pack_into('>Q', body, offset + 1 - body_start, STAMP)
    strings = (source, b'NPCWorkshop', b'reproducible')
    return data[:8] + struct.pack('>Q', STAMP) + b''.join(struct.pack('>H', len(s)) + s for s in strings) + body


def validate_names(payload):
    names = list(payload)
    if len({n.lower() for n in names}) != len(names):
        raise ValueError('Case-insensitive package path collision')
    for name in names:
        if not name or '\\' in name or ':' in name or name.startswith('/') or any(p in ('', '.', '..') for p in name.split('/')):
            raise ValueError(f'Unsafe package path: {name}')


def verify_archive(path):
    with zipfile.ZipFile(path) as archive:
        names = archive.namelist()
        if len(set(names)) != len(names):
            raise ValueError('Duplicate archive entries')
        validate_names(names)
        if archive.testzip() is not None:
            raise ValueError('ZIP integrity check failed')
        manifest = json.loads(archive.read(MANIFEST))
        if manifest['schema'] != 1 or set(names) != set(manifest['files']) | {MANIFEST}:
            raise ValueError('Archive/manifest file list mismatch')
        for name, expected in manifest['files'].items():
            data = archive.read(name)
            if expected != {'sha256': sha(data), 'bytes': len(data)}:
                raise ValueError(f'Archive/manifest content mismatch: {name}')
        for name in [*(f'Scripts/{s}.pex' for s in SCRIPTS), 'NPCWorkshopSkyrim.esp', 'Interface/NPCWorkshop/Conversation.swf', *ASSETS]:
            if name not in manifest['files']:
                raise ValueError(f'Missing runtime file: {name}')
        if set(manifest['files']) != EXPECTED_FILES:
            raise ValueError('Package allowlist mismatch')
        return manifest


def write_archive(payload, provenance, path):
    validate_names(payload)
    manifest = {
        'schema': 1, 'package': 'NPCWorkshopSkyrim', 'native_protocol': 2,
        'target_runtime': 'Skyrim 1.7.104.0 / SKSE 2.3.1',
        'runtime_verification': 'pending_gameplay_checks',
        'metadata_epoch': STAMP, 'build_inputs': provenance,
        'files': {n: {'sha256': sha(d), 'bytes': len(d)} for n, d in sorted(payload.items())},
    }
    entries = {**payload, MANIFEST: json_bytes(manifest)}
    with zipfile.ZipFile(path, 'w', compression=zipfile.ZIP_STORED) as archive:
        for name, data in sorted(entries.items()):
            info = zipfile.ZipInfo(name, date_time=ZIP_DATE)
            info.create_system = 3
            info.external_attr = 0o100644 << 16
            archive.writestr(info, data)
    verify_archive(path)
    return entries


def package(args):
    compiled, plugin, output = args.compiled.resolve(), args.plugin.resolve(), args.output.resolve()
    if plugin.name != 'NPCWorkshopSkyrim.esp':
        raise ValueError('Expected NPCWorkshopSkyrim.esp')
    payload = {'NPCWorkshopSkyrim.esp': plugin.read_bytes()}
    for name in SCRIPTS:
        payload[f'Scripts/{name}.pex'] = normalize_pex((compiled / f'Scripts/{name}.pex').read_bytes())
        payload[f'Source/Scripts/{name}.psc'] = (HERE / f'mod/Source/Scripts/{name}.psc').read_bytes()
    swf = (compiled / 'Interface/NPCWorkshop/Conversation.swf').read_bytes()
    if swf[:4] not in (b'FWS\x08', b'CWS\x08'):
        raise ValueError('Expected Flash 8 conversation SWF')
    payload['Interface/NPCWorkshop/Conversation.swf'] = swf
    for name in ASSETS:
        payload[name] = (plugin.parent / name).read_bytes()
    for name in ('ConversationMenu.as', 'build.py', 'toolchain.json'):
        payload[f'Source/UI/{name}'] = (HERE / 'ui' / name).read_bytes()
    payload['NPCWorkshop-README.txt'] = (HERE / 'package-readme.txt').read_bytes()
    provenance = {}
    for label, root in [('skse', args.skse_sources), ('http', args.http_sources), ('game', args.game_sources)]:
        root = root.resolve()
        inputs = sorted(root.glob('*.psc')) + sorted(root.glob('*.flg'))
        if not inputs:
            raise ValueError(f'Missing {label} script inputs')
        provenance[label] = {'files': len(inputs), 'sha256': sha(json_bytes({p.name: sha(p.read_bytes()) for p in inputs}))}
    compiler = args.papyrus_compiler.resolve()
    provenance['papyrus_compiler'] = {p.name: sha(p.read_bytes()) for p in sorted(compiler.parent.iterdir())
                                      if p.is_file() and p.suffix.lower() in ('.exe', '.dll', '.config')}
    provenance['ui_toolchain'] = json.loads((HERE / 'ui/toolchain.json').read_text())
    provenance['sources'] = {str(p.relative_to(HERE)).replace('\\', '/'): sha(p.read_bytes()) for p in (
        HERE / 'build-mod.ps1', HERE / 'package_mod.py', HERE / 'plugin-builder/Program.cs', HERE / 'plugin-builder/PluginBuilder.csproj')}
    output.parent.mkdir(parents=True, exist_ok=True)
    archive = output.with_suffix('.zip')
    # Validate a new archive fully before touching a previous release or stage.
    with tempfile.TemporaryDirectory(prefix='package-', dir=output.parent) as tmp:
        pending = Path(tmp) / archive.name
        entries = write_archive(payload, provenance, pending)
        if archive.exists():
            backups = output.parent / 'package-backups'
            backups.mkdir(exist_ok=True)
            old_hash = sha(archive.read_bytes())
            backup = backups / f'{archive.stem}-{old_hash}.zip'
            if not backup.exists():
                shutil.copyfile(archive, backup)
        # The stage is for inspection only; the verified ZIP is the installable artifact.
        for name, data in entries.items():
            target = output / name
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_bytes(data)
        pending.replace(archive)
    print(f'Packaged {archive}\nSHA-256 {sha(archive.read_bytes())}\nVerified {len(entries)} allowlisted files; runtime checks pending.')


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--verify', type=Path)
    parser.add_argument('--compiled', type=Path)
    parser.add_argument('--plugin', type=Path)
    parser.add_argument('--output', type=Path)
    parser.add_argument('--papyrus-compiler', type=Path)
    parser.add_argument('--skse-sources', type=Path)
    parser.add_argument('--http-sources', type=Path)
    parser.add_argument('--game-sources', type=Path)
    args = parser.parse_args()
    if args.verify:
        manifest = verify_archive(args.verify)
        print(f'Verified {len(manifest["files"])} files in {args.verify}')
        return
    if any(getattr(args, key) is None for key in ('compiled', 'plugin', 'output', 'papyrus_compiler', 'skse_sources', 'http_sources', 'game_sources')):
        parser.error('Packaging requires all build input/output arguments')
    package(args)


if __name__ == '__main__':
    main()
