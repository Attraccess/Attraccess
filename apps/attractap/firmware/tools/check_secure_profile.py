#!/usr/bin/env python3
"""Build gates for the Attractap secure firmware profile (ATT-1166).

With a secure build directory, fails (exit 1) when:
  - the resolved sdkconfig differs from any line of sdkconfig.secure,
  - the signed bootloader would not fit below the partition table (0x8000),
  - the built partition table differs from partitions.csv,
  - CONFIG_BOOTLOADER_APP_SECURE_VERSION differs from secure-version-floor.txt.
With --base-ref (no build needed), fails when the secure version or the floor
is lower than on that ref: anti-rollback means it must never decrease.

Usage: check_secure_profile.py [<build-dir>] [--base-ref origin/main]
"""

import argparse
import os
import struct
import subprocess
import sys

FIRMWARE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PARTITION_TABLE_OFFSET = 0x8000
SECTOR = 0x1000
# espsecure appends one 4 KB signature sector to the 4 KB-padded bootloader.
SIGNATURE_SECTOR = SECTOR
PARTITION_MAGIC = 0x50AA
MD5_MAGIC = 0xEBEB

PARTITION_TYPES = {"app": 0x00, "data": 0x01}
# Subtypes used by partitions.csv (names per ESP-IDF gen_esp32part.py).
PARTITION_SUBTYPES = {
    "app": {"factory": 0x00, "ota_0": 0x10, "ota_1": 0x11},
    "data": {"ota": 0x00, "phy": 0x01, "nvs": 0x02, "coredump": 0x03, "nvs_keys": 0x04,
             "efuse": 0x05, "fat": 0x81, "spiffs": 0x82},
}
PARTITION_FLAGS = {"encrypted": 1 << 0, "readonly": 1 << 1}
SIZE_SUFFIXES = {"K": 1024, "M": 1024 * 1024}


class GateError(Exception):
    """An input of the gate is missing or malformed (reported without a traceback)."""


def parse_sdkconfig(text):
    """Return {NAME: value}; `# CONFIG_X is not set` maps to 'n'."""
    values = {}
    for raw in text.splitlines():
        line = raw.strip()
        if line.startswith("# CONFIG_") and line.endswith(" is not set"):
            values[line[len("# CONFIG_"):-len(" is not set")]] = "n"
        elif line.startswith("CONFIG_") and "=" in line:
            key, _, value = line[len("CONFIG_"):].partition("=")
            values[key] = value.strip('"')
    return values


def check_profile(profile_text, resolved_text):
    required = parse_sdkconfig(profile_text)
    resolved = parse_sdkconfig(resolved_text)
    errors = []
    for key, expected in required.items():
        actual = resolved.get(key, "n")
        if actual != expected:
            errors.append(f"CONFIG_{key}: expected {expected}, got {actual}")
    return errors


def signed_bootloader_size(unsigned_size):
    padded = -(-unsigned_size // SECTOR) * SECTOR
    return padded + SIGNATURE_SECTOR


def check_bootloader_size(unsigned_size):
    signed = signed_bootloader_size(unsigned_size)
    if signed > PARTITION_TABLE_OFFSET:
        return [f"signed bootloader is {signed:#x} bytes, exceeds {PARTITION_TABLE_OFFSET:#x} "
                "(bootloader logging must stay off; check what grew the bootloader)"]
    return []


def parse_csv_int(text, what):
    text = text.strip()
    multiplier = SIZE_SUFFIXES.get(text[-1:].upper(), 1)
    if multiplier != 1:
        text = text[:-1]
    try:
        return int(text, 0) * multiplier
    except ValueError as error:
        raise GateError(f"partitions.csv: {what} {text!r} is not a number (offsets must be explicit)") from error


def parse_partition_csv(text):
    """(name, type, subtype, offset, size, flags) per partitions.csv row."""
    entries = []
    for raw in text.splitlines():
        line = raw.split("#", 1)[0].strip()
        if not line:
            continue
        cells = [c.strip() for c in line.split(",")] + [""]
        if len(cells) < 6:
            raise GateError(f"partitions.csv: malformed row {raw!r}")
        name, ptype, subtype, offset, size, flags = cells[:6]
        if ptype not in PARTITION_TYPES or subtype not in PARTITION_SUBTYPES[ptype]:
            raise GateError(f"partitions.csv: unsupported type/subtype {ptype}/{subtype} in row {raw!r}")
        flag_bits = 0
        for flag in filter(None, (f.strip() for f in flags.split(":"))):
            if flag not in PARTITION_FLAGS:
                raise GateError(f"partitions.csv: unknown flag {flag!r} in row {raw!r}")
            flag_bits |= PARTITION_FLAGS[flag]
        entries.append((name, PARTITION_TYPES[ptype], PARTITION_SUBTYPES[ptype][subtype],
                        parse_csv_int(offset, "offset"), parse_csv_int(size, "size"), flag_bits))
    return entries


def parse_partition_binary(data):
    entries = []
    for pos in range(0, len(data) - 31, 32):
        magic, ptype, subtype, offset, size = struct.unpack_from("<HBBII", data, pos)
        if magic != PARTITION_MAGIC:  # MD5 entry (0xEBEB) or erased end of table
            break
        name = data[pos + 12:pos + 28].split(b"\0", 1)[0].decode()
        (flags,) = struct.unpack_from("<I", data, pos + 28)
        entries.append((name, ptype, subtype, offset, size, flags))
    return entries


def check_partition_table(csv_text, binary):
    expected = parse_partition_csv(csv_text)
    actual = parse_partition_binary(binary)
    if expected != actual:
        return [f"partition table differs from partitions.csv:\n  csv:   {expected}\n  built: {actual}"]
    return []


def check_secure_version(value, floor):
    if value != floor:
        return [f"CONFIG_BOOTLOADER_APP_SECURE_VERSION is {value} but secure-version-floor.txt is {floor}; "
                "keep them equal (raise both together, never lower either)"]
    return []


def check_no_decrease(what, value, base_value, ref):
    if base_value is not None and value < base_value:
        return [f"{what} dropped from {base_value} on {ref} to {value}; readers that burned "
                f"{base_value} would reject every update (anti-rollback)"]
    return []


def read(path, mode="r"):
    try:
        with open(path, mode) as f:
            return f.read()
    except OSError as error:
        raise GateError(f"cannot read {path}: {error.strerror}") from error


def parse_int(text, what):
    try:
        return int(text.strip())
    except ValueError as error:
        raise GateError(f"{what} is not a number: {text.strip()!r}") from error


def file_at_ref(ref, name):
    """Contents of apps/attractap/firmware/<name> on `ref`, or None when absent there."""
    try:
        subprocess.run(["git", "rev-parse", "--verify", "--quiet", f"{ref}^{{commit}}"],
                       capture_output=True, check=True, cwd=FIRMWARE_DIR)
    except (subprocess.CalledProcessError, OSError) as error:
        raise GateError(f"--base-ref {ref!r} does not resolve to a commit") from error
    try:
        return subprocess.run(
            ["git", "show", f"{ref}:apps/attractap/firmware/{name}"],
            capture_output=True, text=True, check=True, cwd=FIRMWARE_DIR,
        ).stdout
    except subprocess.CalledProcessError:
        return None


def profile_secure_version(profile_text, where):
    return parse_int(parse_sdkconfig(profile_text).get("BOOTLOADER_APP_SECURE_VERSION", "0"),
                     f"CONFIG_BOOTLOADER_APP_SECURE_VERSION in sdkconfig.secure{where}")


def check_against_base(ref):
    """Secure version and floor must not be lower than on `ref`."""
    errors = []
    floor = parse_int(read(os.path.join(FIRMWARE_DIR, "secure-version-floor.txt")), "secure-version-floor.txt")
    version = profile_secure_version(read(os.path.join(FIRMWARE_DIR, "sdkconfig.secure")), "")
    base_floor = file_at_ref(ref, "secure-version-floor.txt")
    if base_floor is not None:
        base_floor = parse_int(base_floor, f"secure-version-floor.txt on {ref}")
    base_profile = file_at_ref(ref, "sdkconfig.secure")
    base_version = None if base_profile is None else profile_secure_version(base_profile, f" on {ref}")
    errors += check_no_decrease("secure-version-floor.txt", floor, base_floor, ref)
    errors += check_no_decrease("CONFIG_BOOTLOADER_APP_SECURE_VERSION", version, base_version, ref)
    errors += check_secure_version(version, floor)
    return errors


def run_checks(build_dir):
    errors = check_profile(
        read(os.path.join(FIRMWARE_DIR, "sdkconfig.secure")),
        read(os.path.join(build_dir, "sdkconfig")),
    )
    bootloader = os.path.join(build_dir, "bootloader", "bootloader.bin")
    if not os.path.isfile(bootloader):
        raise GateError(f"cannot read {bootloader}: no such file")
    errors += check_bootloader_size(os.path.getsize(bootloader))
    errors += check_partition_table(
        read(os.path.join(FIRMWARE_DIR, "partitions.csv")),
        read(os.path.join(build_dir, "partition_table", "partition-table.bin"), "rb"),
    )

    floor = parse_int(read(os.path.join(FIRMWARE_DIR, "secure-version-floor.txt")), "secure-version-floor.txt")
    resolved = parse_sdkconfig(read(os.path.join(build_dir, "sdkconfig")))
    version = parse_int(resolved.get("BOOTLOADER_APP_SECURE_VERSION", "0"), "CONFIG_BOOTLOADER_APP_SECURE_VERSION")
    errors += check_secure_version(version, floor)
    return errors


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("build_dir", nargs="?", help="secure build directory to check")
    parser.add_argument("--base-ref", help="git ref the secure version must not drop below")
    args = parser.parse_args()
    if not args.build_dir and not args.base_ref:
        parser.error("give a build directory, --base-ref, or both")

    try:
        errors = []
        if args.build_dir:
            errors += run_checks(args.build_dir)
        if args.base_ref:
            errors += check_against_base(args.base_ref)
    except GateError as error:
        print(f"secure profile check failed: {error}", file=sys.stderr)
        sys.exit(1)

    for error in errors:
        print(f"secure profile check failed: {error}", file=sys.stderr)
    sys.exit(1 if errors else 0)


if __name__ == "__main__":
    main()
