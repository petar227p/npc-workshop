"""Pinned Windows MTASC build; only project outputs are written. Python 3 stdlib only."""
import argparse
import hashlib
import json
from pathlib import Path
import subprocess
import tempfile
import urllib.request
import zipfile

HERE = Path(__file__).resolve().parent
BASE = HERE.parent


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--bootstrap', action='store_true', help='Download the pinned compiler if missing')
    parser.add_argument('--compiler-dir', type=Path, default=BASE / 'dist/dependencies/mtasc')
    parser.add_argument('--source', type=Path, default=HERE / 'ConversationMenu.as')
    parser.add_argument('--output', type=Path, default=BASE / 'dist/NPCWorkshopSkyrim/Interface/NPCWorkshop/Conversation.swf')
    args = parser.parse_args()
    pin = json.loads((HERE / 'toolchain.json').read_text())
    compiler_dir = args.compiler_dir.resolve()
    if args.bootstrap:
        archive = BASE / 'dist/dependencies/flashdevelop.zip'
        archive.parent.mkdir(parents=True, exist_ok=True)
        if not archive.exists() or digest(archive) != pin['archive_sha256']:
            urllib.request.urlretrieve(pin['url'], archive)
        if digest(archive) != pin['archive_sha256']:
            raise SystemExit('Compiler archive checksum mismatch')
        with zipfile.ZipFile(archive) as z:
            for name in pin['files']:
                target = compiler_dir / name
                target.parent.mkdir(parents=True, exist_ok=True)
                target.write_bytes(z.read(pin['prefix'] + name))
    for name, expected in pin['files'].items():
        target = compiler_dir / name
        if not target.is_file() or digest(target) != expected:
            raise SystemExit(f'Missing/modified compiler input: {target}. Run with --bootstrap.')
    output = args.output.resolve()
    output.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(dir=BASE / 'dist') as tmp:
        swf = Path(tmp) / 'Conversation.swf'
        subprocess.run([str(compiler_dir / 'mtasc.exe'), '-cp', str(HERE), '-version', '8',
                        '-header', '1280:720:30', '-main', '-swf', str(swf),
                        str(args.source.resolve())], check=True, cwd=HERE)
        data = swf.read_bytes()
        if data[:4] not in (b'FWS\x08', b'CWS\x08'):
            raise SystemExit('Compiler did not produce Flash 8 SWF')
        output.write_bytes(data)
    print(f'Built {output}\nSHA-256 {digest(output)}')


if __name__ == '__main__':
    main()
