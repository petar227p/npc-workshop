"""Packaging regression checks; run with python -m unittest discover -s examples/skyrim -p '*_test.py'."""
import argparse
from pathlib import Path
import struct
import tempfile
import unittest
import zipfile

from package_mod import EXPECTED_FILES, SCRIPTS, STAMP, normalize_pex, package, verify_archive, write_archive


def test_directory():
    location = Path(__file__).resolve().parent / 'dist'
    location.mkdir(exist_ok=True)
    return tempfile.TemporaryDirectory(prefix='package-test-', dir=location)


def text(value):
    return struct.pack('>H', len(value)) + value


def pex(timestamp, user=b'person', machine=b'computer', source=b'C:\\source\\Demo.psc', debug=True):
    header = bytes.fromhex('fa57c0de03020001') + struct.pack('>Q', timestamp)
    strings = struct.pack('>H', 2) + text(b'Demo') + text(b'OnActivate')
    debug_header = b'\x01' + struct.pack('>QH', timestamp + 1, 0) if debug else b'\x00'
    return header + text(source) + text(user) + text(machine) + strings + debug_header + b'UNCHANGED_USER_FLAGS_AND_BYTECODE'


def payload():
    return {name: name.encode() for name in sorted(EXPECTED_FILES)}


class PackagingTests(unittest.TestCase):
    def test_pex_normalizes_machine_time_and_paths_but_retains_code_and_debug_lines(self):
        for debug in (False, True):
            first = normalize_pex(pex(100, debug=debug))
            second = normalize_pex(pex(200, b'another user', b'another PC', b'/different/Demo.psc', debug))
            self.assertEqual(first, second)
            self.assertEqual(normalize_pex(first), first)
            self.assertEqual(struct.unpack_from('>Q', first, 8)[0], STAMP)
            self.assertTrue(first.endswith(b'UNCHANGED_USER_FLAGS_AND_BYTECODE'))
            self.assertIn(text(b'Demo') + text(b'OnActivate'), first)

    def test_pex_refuses_unknown_and_truncated_formats(self):
        for data in (b'', b'not a pex', pex(100)[:20], pex(100).replace(b'\x03\x02\x00\x01', b'\x03\x09\x00\x02', 1)):
            with self.assertRaises(ValueError):
                normalize_pex(data)

    def test_archives_match_despite_insertion_order_and_have_fixed_metadata(self):
        with test_directory() as directory:
            a, b = Path(directory) / 'a.zip', Path(directory) / 'b.zip'
            entries = payload()
            write_archive(entries, {'compiler': 'same'}, a)
            write_archive(dict(reversed(list(entries.items()))), {'compiler': 'same'}, b)
            self.assertEqual(a.read_bytes(), b.read_bytes())
            manifest = verify_archive(a)
            self.assertEqual(set(manifest['files']), set(entries))
            with zipfile.ZipFile(a) as archive:
                self.assertTrue(all(info.date_time == (2000, 1, 1, 0, 0, 0) for info in archive.infolist()))

    def test_verifier_detects_modified_content_and_unlisted_files(self):
        with test_directory() as directory:
            path = Path(directory) / 'mod.zip'
            write_archive(payload(), {}, path)
            with zipfile.ZipFile(path) as archive:
                original = {name: archive.read(name) for name in archive.namelist()}
            for mutation in ({**original, 'Scripts/NWBridgeQuest.pex': b'changed'}, {**original, 'SKSE/Plugins/unexpected.dll': b'extra'}):
                with zipfile.ZipFile(path, 'w') as archive:
                    for name, data in mutation.items():
                        archive.writestr(name, data)
                with self.assertRaisesRegex(ValueError, 'mismatch'):
                    verify_archive(path)

    def test_refuses_missing_runtime_files_and_unsafe_names(self):
        with test_directory() as directory:
            path = Path(directory) / 'mod.zip'
            for name in ('../escape', 'Scripts/../escape', '/absolute', 'C:/absolute', 'Scripts\\bad'):
                with self.assertRaises(ValueError):
                    write_archive({**payload(), name: b'bad'}, {}, path)
            entries = payload()
            del entries['Scripts/NWBrannActor.pex']
            with self.assertRaisesRegex(ValueError, 'Missing runtime file'):
                write_archive(entries, {}, path)

    def test_missing_build_input_does_not_replace_previous_release(self):
        with test_directory() as directory:
            root = Path(directory)
            compiled = root / 'compiled'
            (compiled / 'Scripts').mkdir(parents=True)
            for name in SCRIPTS:
                (compiled / f'Scripts/{name}.pex').write_bytes(pex(100))
            (compiled / 'Interface/NPCWorkshop').mkdir(parents=True)
            (compiled / 'Interface/NPCWorkshop/Conversation.swf').write_bytes(b'FWS\x08fixture')
            plugin = root / 'NPCWorkshopSkyrim.esp'
            plugin.write_bytes(b'fixture')
            release = root / 'release.zip'
            release.write_bytes(b'previous release')
            with self.assertRaises(FileNotFoundError):
                package(argparse.Namespace(compiled=compiled, plugin=plugin, output=root / 'release'))
            self.assertEqual(release.read_bytes(), b'previous release')


if __name__ == '__main__':
    unittest.main()
