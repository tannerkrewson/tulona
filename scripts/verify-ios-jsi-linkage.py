"""Reject an iOS app whose Expo Swift imports cannot resolve at launch.

Read Mach-O symbol tables directly so this also works on Linux when inspecting
an IPA. Extensions have their own loader scope and cannot use the app's JSI.
"""

import argparse
from pathlib import Path
import struct


MACHO_MAGICS = {b"\xcf\xfa\xed\xfe", b"\xfe\xed\xfa\xcf"}
FAT_MAGICS = {b"\xca\xfe\xba\xbe", b"\xca\xfe\xba\xbf"}
ARM64 = 0x0100000C
JSI_PREFIX = "_$s14ExpoModulesJSI"


def exported_symbols(trie):
    # Release frameworks can strip their external nlist entries. dyld uses the
    # export trie, which must still contain their public symbols.
    def uleb(position):
        value, shift = 0, 0
        while True:
            byte = trie[position]
            position += 1
            value |= (byte & 0x7F) << shift
            if not byte & 0x80:
                return value, position
            shift += 7
            if shift > 63:
                raise ValueError("Invalid export trie integer")

    found = set()
    pending = [(0, "")]
    visited = set()
    while pending:
        offset, prefix = pending.pop()
        if offset in visited:
            raise ValueError("Cyclic export trie")
        visited.add(offset)
        terminal_size, position = uleb(offset)
        if terminal_size and prefix.startswith(JSI_PREFIX):
            found.add(prefix)
        position += terminal_size
        children = trie[position]
        position += 1
        for _ in range(children):
            end = trie.index(b"\0", position)
            edge = trie[position:end].decode("utf-8")
            child, position = uleb(end + 1)
            pending.append((child, prefix + edge))
    return found


def symbols(path):
    data = path.read_bytes()
    magic = data[:4]
    if magic in FAT_MAGICS:
        count = struct.unpack_from(">I", data, 4)[0]
        wide = magic == b"\xca\xfe\xba\xbf"
        for index in range(count):
            position = 8 + index * (32 if wide else 20)
            cpu = struct.unpack_from(">I", data, position)[0]
            if cpu == ARM64:
                offset, size = struct.unpack_from(">QQ" if wide else ">II", data, position + 8)
                data = data[offset:offset + size]
                break
        else:
            raise ValueError(f"{path}: no arm64 Mach-O slice")
        magic = data[:4]
    if magic not in MACHO_MAGICS:
        raise ValueError(f"{path}: expected 64-bit Mach-O")
    order = "<" if magic == b"\xcf\xfa\xed\xfe" else ">"
    cpu, _, _, commands = struct.unpack_from(order + "IIII", data, 4)
    if cpu != ARM64:
        raise ValueError(f"{path}: expected arm64")
    position = 32
    symbol_table = None
    exports = b""
    for _ in range(commands):
        command, size = struct.unpack_from(order + "II", data, position)
        if size < 8:
            raise ValueError(f"{path}: invalid load command")
        if command == 2:  # LC_SYMTAB
            symbol_table = struct.unpack_from(order + "IIII", data, position + 8)
        elif command in (0x22, 0x80000022):  # LC_DYLD_INFO[_ONLY]
            offset, length = struct.unpack_from(order + "II", data, position + 40)
            exports = data[offset:offset + length]
        elif command == 0x80000033:  # LC_DYLD_EXPORTS_TRIE
            offset, length = struct.unpack_from(order + "II", data, position + 8)
            exports = data[offset:offset + length]
        position += size
    if symbol_table is None:
        raise ValueError(f"{path}: no symbol table")
    table, count, strings, string_size = symbol_table
    defined, imported = exported_symbols(exports) if exports else set(), set()
    for index in range(count):
        name_offset, kind, _, flags, _ = struct.unpack_from(order + "IBBHQ", data, table + index * 16)
        if kind & 0xE0 or not kind & 1:  # Ignore debug and non-external symbols.
            continue
        if name_offset >= string_size:
            raise ValueError(f"{path}: invalid symbol name offset")
        start = strings + name_offset
        end = data.index(b"\0", start, strings + string_size)
        name = data[start:end].decode("utf-8")
        if not name.startswith(JSI_PREFIX):
            continue
        if kind & 0x0E:
            defined.add(name)
        elif not flags & 0x40:  # Optional weak imports need not exist.
            imported.add(name)
    return defined, imported


def verify(bundle):
    failures = []
    checked = 0
    for scope in [bundle, *bundle.rglob("*.appex")]:
        provider = scope / "Frameworks/ExpoModulesJSI.framework/ExpoModulesJSI"
        consumers = []
        for path in scope.rglob("*"):
            if not path.is_file() or any(part.endswith(".appex") for part in path.relative_to(scope).parts):
                continue
            with path.open("rb") as binary:
                magic = binary.read(4)
            if magic in MACHO_MAGICS | FAT_MAGICS and path != provider:
                consumers.append(path)
        available = symbols(provider)[0] if provider.is_file() else set()
        for consumer in consumers:
            required = symbols(consumer)[1]
            checked += len(required)
            for missing in sorted(required - available):
                failures.append(f"{consumer.relative_to(bundle)}: unresolved {missing}")
    if failures:
        raise ValueError("ExpoModulesJSI ABI mismatch:\n" + "\n".join(failures))
    if not checked:
        raise ValueError("No ExpoModulesJSI imports found; native linkage was not checked")
    print(f"Verified {checked} ExpoModulesJSI imports in {bundle.name} and its extensions.")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("app", type=Path)
    args = parser.parse_args()
    verify(args.app)
