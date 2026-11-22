#!/usr/bin/env python3
"""Build gates for the Attractap secure firmware profile (ATT-1166).

With a secure build directory, fails (exit 1) when:
  - the resolved sdkconfig differs from any line of sdkconfig.secure,
  - the signed bootloader would not fit below the partition table (0x8000),
  - the built partition table differs from partitions.csv,
  - CONFIG_BOOTLOADER_APP_SECURE_VERSION differs from secure-version-floor.txt,
  - the console is on, or console command input (src/serial/serialConsoleInput.cpp) was
    compiled in: the command handler must be reachable only through the Bluetooth setup
    channel (src/bt_setup, ATT-1371), and every source needs the ATTRACTAP_SECURE_PROFILE
    define that compiles the console out,
  - the lab crash trigger or the ui.* test hooks were compiled in,
  - the mbedTLS allocator that keeps key material in internal RAM
    (src/api/security/tls_memory.c) was not compiled in or not linked.
With --base-ref (no build needed), fails when the secure version or the floor
is lower than on that ref: anti-rollback means it must never decrease.

Usage: check_secure_profile.py [<build-dir>] [--base-ref origin/main]
"""

import argparse
import json
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


CONSOLE_INPUT = "/src/serial/serialConsoleInput.cpp"
BLUETOOTH_CHANNEL = "/src/bt_setup/bt_setup.cpp"
APP_COMPONENT = "__idf_main.dir"
LAB_ONLY_DEFINES = ("ATTRACTAP_CRASH_TRIGGER=1", "ATTRACTAP_TEST_HOOKS=1")


def check_console_off(resolved):
    """No console at all: the sdkconfig gate pins it too, this names the reason."""
    if resolved.get("ESP_CONSOLE_NONE", "n") != "y":
        return ["the console is enabled (CONFIG_ESP_CONSOLE_NONE is not set)"]
    return []


def check_command_paths(compile_commands):
    """The secure profile reads commands only from the Bluetooth setup (read from compile_commands.json):
    no console command input, the ATTRACTAP_SECURE_PROFILE define on every app source (it drops the console
    driver and the console reads), the Bluetooth channel compiled in, and no lab crash trigger or test hooks."""
    if not isinstance(compile_commands, list) or not all(isinstance(e, dict) and "file" in e for e in compile_commands):
        raise GateError("compile_commands.json is not a list of compile entries")

    def path(entry):
        return entry["file"].replace(os.sep, "/")

    def command(entry):
        return entry.get("command") or " ".join(entry.get("arguments", []))

    # The reader app is ESP-IDF's `main` component (main/CMakeLists.txt); other components have src/ trees too.
    app = [e for e in compile_commands if APP_COMPONENT in command(e)]
    errors = []
    console = sorted(path(e) for e in app if path(e).endswith(CONSOLE_INPUT))
    if console:
        errors.append(f"console command input is compiled in: {', '.join(console)}")
    if not app or not all("ATTRACTAP_SECURE_PROFILE=1" in command(e) for e in app):
        missing = sorted(path(e) for e in app if "ATTRACTAP_SECURE_PROFILE=1" not in command(e))
        errors.append("app sources without -DATTRACTAP_SECURE_PROFILE=1 (they keep the console driver and console "
                      f"reads): {', '.join(missing) or 'no app sources found'}")
    if not any(path(e).endswith(BLUETOOTH_CHANNEL) for e in app):
        errors.append(f"the Bluetooth setup channel ({BLUETOOTH_CHANNEL[1:]}) is not compiled in")
    hooks = sorted({d for e in app for d in LAB_ONLY_DEFINES if d in command(e)})
    hooks += sorted(path(e) for e in app if "/src/testhooks/" in path(e))
    if hooks:
        errors.append(f"lab-only crash trigger or test hooks are compiled in: {', '.join(hooks)}")
    return errors


TLS_ALLOCATOR_SOURCE = "/src/api/security/tls_memory.c"
TLS_ALLOCATOR_SYMBOL = "attractap_tls_memory_install"


def check_tls_allocator_compiled_in(compile_commands):
    """CONFIG_MBEDTLS_CUSTOM_MEM_ALLOC without the allocator leaves mbedTLS on plain calloc(), which puts
    large blocks in PSRAM; the allocator source must be part of the build."""
    if any(e["file"].replace(os.sep, "/").endswith(TLS_ALLOCATOR_SOURCE) for e in compile_commands):
        return []
    return [f"the mbedTLS allocator ({TLS_ALLOCATOR_SOURCE.lstrip('/')}) is not compiled in; "
            "mbedTLS key material could land in PSRAM"]


def check_tls_allocator_linked(map_text):
    """The allocator installs itself from a constructor that nothing calls by name, so a compiled object can
    still be left out of the image. The linker map lists the symbol with an address only when it is linked."""
    for line in map_text.splitlines():
        fields = line.split()
        if len(fields) == 2 and fields[0].startswith("0x") and fields[1] == TLS_ALLOCATOR_SYMBOL:
            return []
    return [f"the mbedTLS allocator ({TLS_ALLOCATOR_SYMBOL}) is not linked into the app image; "
            "mbedTLS key material could land in PSRAM"]


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

    try:
        compile_commands = json.loads(read(os.path.join(build_dir, "compile_commands.json")))
    except ValueError as error:
        raise GateError(f"{build_dir}/compile_commands.json is not valid JSON") from error
    errors += check_console_off(resolved)
    errors += check_command_paths(compile_commands)
    errors += check_tls_allocator_compiled_in(compile_commands)
    errors += check_tls_allocator_linked(read(os.path.join(build_dir, "attractap.map")))
    return errors


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
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
    if errors:
        sys.exit(1)
    checked = [f"build {args.build_dir}"] if args.build_dir else []
    checked += [f"secure version against {args.base_ref}"] if args.base_ref else []
    print(f"secure profile check passed ({'; '.join(checked)})")


if __name__ == "__main__":
    main()
