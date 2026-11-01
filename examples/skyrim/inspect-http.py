"""Read PE export metadata without loading/executing the native DLL."""
import argparse
import hashlib
import json
import struct
from datetime import datetime, timezone
from pathlib import Path

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('dll', type=Path)
args = parser.parse_args()
data = args.dll.read_bytes()
pe = struct.unpack_from('<I', data, 0x3c)[0]
if data[pe:pe + 4] != b'PE\0\0':
    raise ValueError('Not a PE file')
machine, sections = struct.unpack_from('<HH', data, pe + 4)
build_time = struct.unpack_from('<I', data, pe + 8)[0]
optional_size = struct.unpack_from('<H', data, pe + 20)[0]
optional = pe + 24
if struct.unpack_from('<H', data, optional)[0] != 0x20b:
    raise ValueError('Expected PE32+ (64-bit)')
section_table = optional + optional_size


def offset(rva):
    for i in range(sections):
        row = section_table + i * 40
        vsize, va, rawsize, raw = struct.unpack_from('<IIII', data, row + 8)
        if va <= rva < va + max(vsize, rawsize):
            return raw + rva - va
    raise ValueError(f'Unmapped RVA {rva:#x}')


export_rva = struct.unpack_from('<I', data, optional + 112)[0]
exports = offset(export_rva)
names_count = struct.unpack_from('<I', data, exports + 24)[0]
functions, names, ordinals = struct.unpack_from('<III', data, exports + 28)
metadata = None
for i in range(names_count):
    name_at = offset(struct.unpack_from('<I', data, offset(names) + i * 4)[0])
    name = data[name_at:data.index(0, name_at)].decode('ascii')
    if name == 'SKSEPlugin_Version':
        ordinal = struct.unpack_from('<H', data, offset(ordinals) + i * 2)[0]
        metadata = offset(struct.unpack_from('<I', data, offset(functions) + ordinal * 4)[0])
        break
if metadata is None:
    raise ValueError('SKSEPlugin_Version export absent')
version, plugin_version = struct.unpack_from('<II', data, metadata)
name = data[metadata + 8:metadata + 264].split(b'\0')[0].decode('ascii')
independence_ex, independence = struct.unpack_from('<II', data, metadata + 772)
compatible = struct.unpack_from('<16I', data, metadata + 780)
print(json.dumps({
    'sha256': hashlib.sha256(data).hexdigest(), 'machine': hex(machine),
    'pe_build_time_utc': datetime.fromtimestamp(build_time, timezone.utc).isoformat(),
    'metadata_version': version, 'plugin_version': plugin_version, 'name': name,
    'version_independence_ex': independence_ex, 'version_independence': independence,
    'declares_address_library_v5': bool(independence_ex & 2),
    'skse_pre_2025_v5_recompile_gate': bool(independence & 1) and not bool(independence_ex & 2) and 520128000 <= build_time < 1748217600,
    'compatible_runtime_values': [hex(v) for v in compatible if v],
    'note': 'Static metadata inspection only; does not establish runtime safety.',
}, indent=2))
