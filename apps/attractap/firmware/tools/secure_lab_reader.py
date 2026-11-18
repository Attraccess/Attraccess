#!/usr/bin/env python3
"""Provision and re-flash device-lab secure test readers (ATT-1166).

A lab secure reader runs the secure profile with sdkconfig.secure-lab on top
(-DATTRACTAP_SECURE_PROFILE=ON -DATTRACTAP_SECURE_LAB=ON): Secure Boot v2 bound
to the committed lab keys in lab/secure-boot/, and development-mode flash
encryption, so it stays re-flashable over USB with encrypted writes.

  status     print the reader's security eFuses (read-only)
  provision  first time only: burn the lab key digests into KEY0/KEY1, erase
             flash and write the signed images in plaintext. The first boot
             enables Secure Boot and flash encryption. IRREVERSIBLE: needs
             --expect-mac with the reader's MAC, and --burn-efuses.
  flash      re-flash a provisioned lab reader with signed, encrypted images
             (also recovers a reader whose flash was erased)
  hex        sign a lab secure build and merge it into one Intel HEX image for
             `esptool write-flash --force --erase-all --encrypt 0x0`, the write
             a lab place does (attractap_lab ESPToolDriver.erase_and_flash_encrypted)
  create-ds  the one approved DS burn (ATT-1207): the lab reader DC:B4:D9:21:71:C8
             creates its Digital Signature key (KEY3 + RD_DIS lock, IRREVERSIBLE).
             Without --burn-efuses it only runs the read-only pre-checks. See
             lab/ds/README.md.

`flash` and `hex --mac` also write the committed DS record of the reader's MAC
(lab/ds/<mac>/ds-record.bin, encrypted, at the start of the spiffs partition) when
there is one, so a wipe does not take the reader's DS identity with it.

Run inside an ESP-IDF environment (espefuse, esptool and espsecure on PATH).
"""

import argparse
import json
import os
import subprocess
import sys
import re
import tempfile
import time

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import ds_record  # noqa: E402

FIRMWARE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
KEY_DIR = os.path.join(FIRMWARE_DIR, "lab", "secure-boot")
SIGNING_KEY = os.path.join(KEY_DIR, "lab-signing-key.pem")
RECOVERY_KEY = os.path.join(KEY_DIR, "lab-recovery-key.pem")
DS_DIR_ENV = "ATTRACTAP_LAB_DS_DIR"
DEFAULT_DS_DIR = os.path.join(FIRMWARE_DIR, "lab", "ds")
# The single reader that may ever run create-ds (decision of 2026-11-07: KEY3 + RD_DIS lock, once).
APPROVED_DS_MAC = "dc:b4:d9:21:71:c8"
DS_PURPOSE = "HMAC_DOWN_DIGITAL_SIGNATURE"
CREATE_TIMEOUT_S = 600
CHIP = "esp32s3"
BOOTLOADER_OFFSET = "0x0"


class LabReaderError(Exception):
    """The reader or build is not in a state this command may act on."""


def run(cmd, capture=False):
    print("+ " + " ".join(cmd), flush=True)
    try:
        result = subprocess.run(cmd, text=True, capture_output=capture)
    except FileNotFoundError as error:
        raise LabReaderError(f"{cmd[0]} not found: run inside an ESP-IDF environment") from error
    if result.returncode != 0:
        if capture:
            sys.stderr.write(result.stdout + result.stderr)
        raise LabReaderError(f"{cmd[0]} failed with exit code {result.returncode}")
    return result.stdout if capture else None


def key_digest(key_path):
    with tempfile.TemporaryDirectory() as tmp:
        out = os.path.join(tmp, "digest.bin")
        run(["espsecure", "digest-sbv2-public-key", "--keyfile", key_path, "-o", out], capture=True)
        with open(out, "rb") as f:
            return f.read().hex()


def read_efuses(port):
    with tempfile.TemporaryDirectory() as tmp:
        out = os.path.join(tmp, "efuse.json")
        run(["espefuse", "-p", port, "--chip", CHIP, "summary", "--format", "json", "--file", out], capture=True)
        with open(out) as f:
            return json.load(f)


def value(efuses, name):
    return efuses[name]["value"]


def block_hex(efuses, name):
    return "".join(str(value(efuses, name)).split()).lower().removeprefix("0x")


def crypt_cnt(efuses):
    """Raw SPI_BOOT_CRYPT_CNT (0, 1, 3 or 7). espefuse's `value` only says
    Enable/Disable, which hides whether the count can still change."""
    entry = efuses["SPI_BOOT_CRYPT_CNT"]
    raw = entry.get("raw_value", entry["value"])
    if isinstance(raw, int):
        return raw
    try:
        return int(str(raw), 0)
    except ValueError:
        return None


def flash_encryption_on(cnt):
    """Flash encryption is on when an odd number of SPI_BOOT_CRYPT_CNT bits is set (1 or 7; 3 is off)."""
    return cnt is not None and bin(cnt).count("1") % 2 == 1


def mac(efuses):
    """Factory MAC as lowercase aa:bb:cc:dd:ee:ff (espefuse appends ' (OK)')."""
    return str(value(efuses, "MAC")).split()[0].lower()


def describe(efuses):
    print(f"  {'MAC':28} {mac(efuses)}")
    names = ["SECURE_BOOT_EN", "SPI_BOOT_CRYPT_CNT", "DIS_DOWNLOAD_MANUAL_ENCRYPT", "ENABLE_SECURITY_DOWNLOAD",
             "SECURE_VERSION", "RD_DIS"] + [f"KEY_PURPOSE_{i}" for i in range(6)]
    for name in names:
        entry = efuses[name]
        print(f"  {name:28} {entry['value']}{'' if entry.get('writeable', True) else ' (write-protected)'}")


def lab_digests_burned(efuses, digests):
    return (value(efuses, "KEY_PURPOSE_0") == "SECURE_BOOT_DIGEST0"
            and value(efuses, "KEY_PURPOSE_1") == "SECURE_BOOT_DIGEST1"
            and block_hex(efuses, "BLOCK_KEY0") == digests[0]
            and block_hex(efuses, "BLOCK_KEY1") == digests[1])


def read_json(path):
    try:
        with open(path) as f:
            return json.load(f)
    except (OSError, ValueError) as error:
        raise LabReaderError(f"cannot read {path}: {error}") from error


def flash_layout(build_dir):
    """[(offset, path, encrypted, needs_signature)] including the bootloader.

    Reads config/sdkconfig.json, the configuration the images were actually built
    with (<build>/sdkconfig can be stale when -DSDKCONFIG pointed elsewhere). A
    release-mode image would switch a lab reader's flash encryption to release
    mode for good, so anything but the lab profile is refused."""
    config = read_json(os.path.join(build_dir, "config", "sdkconfig.json"))
    if not (config.get("SECURE_BOOT_V2_ENABLED") is True
            and config.get("SECURE_FLASH_ENCRYPTION_MODE_DEVELOPMENT") is True
            and config.get("SECURE_FLASH_ENCRYPTION_MODE_RELEASE") is not True):
        raise LabReaderError(f"{build_dir} is not a lab secure build (-DATTRACTAP_SECURE_PROFILE=ON -DATTRACTAP_SECURE_LAB=ON)")
    args = read_json(os.path.join(build_dir, "flasher_args.json"))
    images = [(BOOTLOADER_OFFSET, os.path.join(build_dir, "bootloader", "bootloader.bin"), True, True)]
    try:
        for entry in ("partition-table", "otadata", "app"):
            info = args[entry]
            images.append((info["offset"], os.path.join(build_dir, info["file"]), info["encrypted"] == "true",
                           entry == "app"))
    except KeyError as error:
        raise LabReaderError(f"{build_dir}/flasher_args.json has no {error} entry") from error
    missing = [path for _, path, _, _ in images if not os.path.isfile(path)]
    if missing:
        raise LabReaderError(f"missing build output: {', '.join(missing)}")
    return images


def signed_images(images, tmp, espsecure=("espsecure",)):
    """Sign the bootloader and the app with the lab key; other images pass through.

    espsecure: command prefix, e.g. (python, "-m", "espsecure") outside an ESP-IDF shell."""
    out = []
    for offset, path, encrypted, needs_signature in images:
        if needs_signature:
            signed = os.path.join(tmp, os.path.basename(path).replace(".bin", "-lab-signed.bin"))
            run([*espsecure, "sign-data", "--version", "2", "--keyfile", SIGNING_KEY, "-o", signed, path], capture=True)
            path = signed
        out.append((offset, path, encrypted))
    return out


def write_hex_image(build_dir, output, ds_mac=None, ds_directory=None):
    """Sign a lab secure build and merge every part into one Intel HEX file.

    One encrypted write takes the whole file, so every part (the bootloader too)
    must be one that is written encrypted. HEX leaves the gaps between parts
    unwritten: an encrypted write of a raw merged image would also fill them
    (NVS included) with encrypted 0xFF.

    ds_mac: also merge that reader's committed DS record at the start of the spiffs partition."""
    images = flash_layout(build_dir)
    plain = [offset for offset, _, encrypted, _ in images if not encrypted]
    if plain:
        raise LabReaderError(f"{build_dir} has parts that are not written encrypted at {', '.join(plain)}")
    with tempfile.TemporaryDirectory() as tmp:
        flat = [item for offset, path, _ in signed_images(images, tmp) for item in (offset, path)]
        sector = restore_sector(ds_mac.lower(), ds_directory or ds_dir()) if ds_mac else None
        if sector:
            record = os.path.join(tmp, "ds-record-sector.bin")
            with open(record, "wb") as f:
                f.write(sector)
            flat += [hex(ds_record.DS_RECORD_OFFSET), record]
        run(["esptool", "--chip", CHIP, "merge-bin", "--format", "hex", "-o", output, *flat])


def ds_dir(args=None):
    return getattr(args, "ds_dir", None) or os.environ.get(DS_DIR_ENV) or DEFAULT_DS_DIR


def restore_sector(chip_mac, directory):
    """The validated 4096-byte DS record sector committed for this MAC, or None (then nothing is written)."""
    path = os.path.join(directory, chip_mac.replace(":", ""), "ds-record.bin")
    if not os.path.isfile(path):
        return None
    with open(path, "rb") as f:
        try:
            return ds_record.sector(f.read())
        except ds_record.DsRecordError as error:
            raise LabReaderError(f"{path}: {error}; refusing to wipe the reader without its DS record") from error


def cmd_status(args):
    efuses = read_efuses(args.port)
    describe(efuses)
    digests = (key_digest(SIGNING_KEY), key_digest(RECOVERY_KEY))
    print("  lab key digests burned:", lab_digests_burned(efuses, digests))


def cmd_provision(args):
    images = flash_layout(args.build_dir)
    efuses = read_efuses(args.port)
    describe(efuses)
    expected = args.expect_mac.strip().lower().replace("-", ":")
    if mac(efuses) != expected:
        raise LabReaderError(f"the reader on {args.port} has MAC {mac(efuses)}, not {expected}; refusing to provision it")
    digests = (key_digest(SIGNING_KEY), key_digest(RECOVERY_KEY))
    if value(efuses, "SECURE_BOOT_EN") or crypt_cnt(efuses) != 0:
        raise LabReaderError("Secure Boot or flash encryption is already on: use `flash` instead")
    for i in range(2, 6):
        if value(efuses, f"KEY_PURPOSE_{i}") != "USER" or block_hex(efuses, f"BLOCK_KEY{i}").strip("0"):
            raise LabReaderError(f"KEY{i} is already in use; this is not a fresh reader")
    if lab_digests_burned(efuses, digests):
        print("Lab key digests already burned; continuing with the flash step.")
    else:
        for i in range(2):
            if value(efuses, f"KEY_PURPOSE_{i}") != "USER" or block_hex(efuses, f"BLOCK_KEY{i}").strip("0"):
                raise LabReaderError(f"KEY{i} holds something other than the lab key digest; refusing to continue")
        if not args.burn_efuses:
            raise LabReaderError("Burning the lab key digests is irreversible: re-run with --burn-efuses")
        run(["espefuse", "-p", args.port, "--chip", CHIP, "--do-not-confirm", "burn-key-digest",
             "BLOCK_KEY0", SIGNING_KEY, "SECURE_BOOT_DIGEST0", "BLOCK_KEY1", RECOVERY_KEY, "SECURE_BOOT_DIGEST1"])
        if not lab_digests_burned(read_efuses(args.port), digests):
            raise LabReaderError("Lab key digests did not read back; stop and inspect the eFuses")
    with tempfile.TemporaryDirectory() as tmp:
        files = signed_images(images, tmp)
        run(["esptool", "--chip", CHIP, "-p", args.port, "erase-flash"])
        # Plaintext on purpose: the first boot encrypts the flash in place.
        flat = [item for offset, path, _ in files for item in (offset, path)]
        run(["esptool", "--chip", CHIP, "-p", args.port, "write-flash", *flat])
    print("Written. The first boot enables Secure Boot and flash encryption and resets a few times; "
          "do not unplug the reader until the app console shows 'Welcome to Attractap'.")


def cmd_flash(args):
    images = flash_layout(args.build_dir)
    efuses = read_efuses(args.port)
    digests = (key_digest(SIGNING_KEY), key_digest(RECOVERY_KEY))
    if not value(efuses, "SECURE_BOOT_EN") or not lab_digests_burned(efuses, digests):
        raise LabReaderError("Not a provisioned lab reader (Secure Boot off or KEY0/KEY1 not the lab key digests)")
    cnt = crypt_cnt(efuses)
    # On the ESP32-S3, release mode burns DIS_DOWNLOAD_MANUAL_ENCRYPT (and counts CRYPT_CNT up to 7);
    # 7 alone can still be development mode. The write-protect check is an extra guard.
    if not flash_encryption_on(cnt) or value(efuses, "DIS_DOWNLOAD_MANUAL_ENCRYPT") \
            or not efuses["SPI_BOOT_CRYPT_CNT"].get("writeable", True):
        raise LabReaderError("Flash encryption is not in development mode: this reader only takes signed OTA updates")
    with tempfile.TemporaryDirectory() as tmp:
        files = signed_images(images, tmp)
        sector = restore_sector(mac(efuses), ds_dir(args))
        if sector is None and args.erase_all and value(efuses, "KEY_PURPOSE_3") == "HMAC_DOWN_DIGITAL_SIGNATURE":
            # The encrypted DS params live only in this reader's flash; a wipe without a record loses the DS key for good.
            raise LabReaderError(f"KEY3 of {mac(efuses)} holds a DS key but there is no committed DS record in "
                                 f"{ds_dir(args)}; refusing to erase the reader")
        if sector:
            record = os.path.join(tmp, "ds-record-sector.bin")
            with open(record, "wb") as f:
                f.write(sector)
            files.append((hex(ds_record.DS_RECORD_OFFSET), record, True))
            print(f"Also writing the DS record of {mac(efuses)} at {hex(ds_record.DS_RECORD_OFFSET)}.")
        encrypted = [item for offset, path, enc in files if enc for item in (offset, path)]
        plain = [item for offset, path, enc in files if not enc for item in (offset, path)]
        # --force: esptool refuses writes below 0x8000 once Secure Boot is on;
        # the bootloader written here is signed with the lab key.
        cmd = ["esptool", "--chip", CHIP, "-p", args.port, "write-flash", "--force"]
        if args.erase_all:
            cmd.append("--erase-all")
        if plain:
            cmd += plain + ["--encrypt-files", *encrypted]
        else:
            cmd += ["--encrypt", *encrypted]
        run(cmd)


def cmd_hex(args):
    write_hex_image(args.build_dir, args.output, ds_mac=args.mac)


# --- create-ds: the approved one-time DS burn -------------------------------------------------------------

def split_dump(output):
    """The JSON summary of an `espefuse dump summary --format json` run."""
    start = output.find("{", output.find('=== Run "summary" command ==='))
    if start < 0:
        raise LabReaderError("espefuse output has no JSON summary")
    return json.JSONDecoder().raw_decode(output[start:])[0]


def dump_efuses(port, path):
    """Full eFuse dump (raw blocks + JSON summary) saved to `path`; returns the summary."""
    output = run(["espefuse", "-p", port, "--chip", CHIP, "dump", "summary", "--format", "json"], capture=True)
    with open(path, "w") as f:
        f.write(output)
    return split_dump(output)


def unread(efuses, name):
    return efuses[name].get("readable") is False


def ds_precheck_problems(efuses, digests):
    """Everything that must hold right before the burn; any surprise stops the command."""
    problems = []
    if mac(efuses) != APPROVED_DS_MAC:
        problems.append(f"chip MAC {mac(efuses)} is not the approved {APPROVED_DS_MAC}")
    if not value(efuses, "SECURE_BOOT_EN"):
        problems.append("Secure Boot is not enabled (not a secure-lab reader)")
    if not lab_digests_burned(efuses, digests):
        problems.append("KEY0/KEY1 do not hold the lab key digests")
    cnt = crypt_cnt(efuses)
    if not flash_encryption_on(cnt) or value(efuses, "DIS_DOWNLOAD_MANUAL_ENCRYPT") \
            or not efuses["SPI_BOOT_CRYPT_CNT"].get("writeable", True):
        problems.append("flash encryption is not in development mode")
    for index, purpose in ((2, "XTS_AES_128_KEY"), (4, "HMAC_UP")):
        if value(efuses, f"KEY_PURPOSE_{index}") != purpose:
            problems.append(f"KEY{index} purpose is {value(efuses, f'KEY_PURPOSE_{index}')}, not {purpose}")
        if not unread(efuses, f"BLOCK_KEY{index}"):
            problems.append(f"KEY{index} is not read-protected")
    if value(efuses, "KEY_PURPOSE_3") != "USER" or (not unread(efuses, "BLOCK_KEY3")
                                                     and block_hex(efuses, "BLOCK_KEY3").strip("0 ")):
        problems.append("KEY3 is not unused")
    if unread(efuses, "BLOCK_KEY3"):
        problems.append("KEY3 is already read-protected")
    if efuses["RD_DIS"].get("writeable", True) is False:
        problems.append("RD_DIS is already write-protected")
    return problems


def ds_burned_problems(efuses):
    """What must read back after a successful creation."""
    problems = []
    if value(efuses, "KEY_PURPOSE_3") != DS_PURPOSE:
        problems.append(f"KEY_PURPOSE_3 is {value(efuses, 'KEY_PURPOSE_3')}, not {DS_PURPOSE}")
    if not unread(efuses, "BLOCK_KEY3"):
        problems.append("KEY3 is not read-protected")
    if efuses["RD_DIS"].get("writeable", True) is not False:
        problems.append("RD_DIS is not write-protected")
    return problems


def console_exchange(port, command, pattern, timeout, baud=115200):
    """Send one console command and return the text matching `pattern` (a regex, DOTALL) from the reply.

    DTR/RTS stay low so opening the port does not reset the reader."""
    import serial  # inside the ESP-IDF environment (esptool depends on pyserial)
    regex = re.compile(pattern, re.S)
    deadline = time.monotonic() + timeout
    seen = ""
    with serial.Serial() as console:
        console.port, console.baudrate, console.timeout = port, baud, 0.5
        console.dtr = console.rts = False
        console.open()
        console.reset_input_buffer()
        console.write((command + "\n").encode())
        while time.monotonic() < deadline:
            seen += console.read(4096).decode("utf-8", "replace")
            match = regex.search(seen)
            if match:
                return match.group(0)
    raise LabReaderError(f"no answer to `{command.split()[0]}` within {timeout}s")


def parse_status(line):
    return dict(part.split("=", 1) for part in line.split()[1:] if "=" in part)


def parse_export(text):
    """The record bytes of a `ds.export` reply (log lines between the markers are ignored)."""
    body = text.split("DS_RECORD_BEGIN", 1)[1].rsplit("DS_RECORD_END", 1)[0]
    import base64
    encoded = "".join(line.strip() for line in body.splitlines() if re.fullmatch(r"[A-Za-z0-9+/=]+", line.strip()))
    try:
        return base64.b64decode(encoded, validate=True)
    except ValueError as error:
        raise LabReaderError(f"ds.export did not return base64: {error}") from error


def save_ds_files(record, spki, out_dir, backup_dir):
    """Write ds-record.bin and ds-public-key.pem; never replaces a committed, different record."""
    files = {"ds-record.bin": record, "ds-public-key.pem": ds_record.spki_pem(spki).encode()}
    os.makedirs(backup_dir, exist_ok=True)
    for name, data in files.items():
        with open(os.path.join(backup_dir, name), "wb") as f:
            f.write(data)
    os.makedirs(out_dir, exist_ok=True)
    for name, data in files.items():
        target = os.path.join(out_dir, name)
        if os.path.exists(target):
            with open(target, "rb") as f:
                if f.read() != data:
                    raise LabReaderError(f"{target} exists and differs; the new files are in {backup_dir}")
        else:
            with open(target, "wb") as f:
                f.write(data)


def cmd_create_ds(args):
    expected = args.expect_mac.strip().lower().replace("-", ":")
    if expected != APPROVED_DS_MAC:
        raise LabReaderError(f"create-ds is approved for {APPROVED_DS_MAC} only, not {expected}")
    dump_dir = args.dump_dir or tempfile.mkdtemp(prefix="create-ds-")
    os.makedirs(dump_dir, exist_ok=True)
    out_dir = args.out_dir or os.path.join(DEFAULT_DS_DIR, APPROVED_DS_MAC.replace(":", ""))
    if os.path.exists(os.path.join(out_dir, "ds-record.bin")):
        raise LabReaderError(f"{out_dir} already holds a DS record: this reader has its DS key")
    digests = (key_digest(SIGNING_KEY), key_digest(RECOVERY_KEY))
    before = dump_efuses(args.port, os.path.join(dump_dir, "efuse-before.txt"))
    describe(before)
    problems = ds_precheck_problems(before, digests)
    if problems:
        raise LabReaderError("pre-check failed, nothing was burned: " + "; ".join(problems))
    if not args.burn_efuses:
        print(f"Dry run: all pre-checks pass for {APPROVED_DS_MAC}. With --burn-efuses this would run `ds.create`, "
              f"which burns KEY3 as {DS_PURPOSE} (read-protected) and write-protects RD_DIS, then export the "
              f"record to {out_dir}. eFuse dumps are in {dump_dir}.")
        return
    status = parse_status(console_exchange(args.port, "ds.status", r"DS_STATUS[^\n]*", 30, args.baud))
    if status.get("available") != "0" or status.get("record") != "0" or status.get("key3") not in ("unused", "USER") \
            or status.get("fe") != "development":
        raise LabReaderError(f"the firmware reports {status}; expected a secure-lab build with no DS yet")
    print("Creating the DS key: this burns eFuses and cannot be undone or retried.", flush=True)
    result = console_exchange(args.port, f"ds.create {APPROVED_DS_MAC}", r"DS_CREATE_RESULT[^\n]*",
                              CREATE_TIMEOUT_S, args.baud).strip()
    after = dump_efuses(args.port, os.path.join(dump_dir, "efuse-after.txt"))
    describe(after)
    if result != "DS_CREATE_RESULT ok":
        raise LabReaderError(f"{result}. Do not retry; inspect {dump_dir} and the eFuses")
    problems = ds_burned_problems(after)
    if problems:
        raise LabReaderError("the burn did not read back: " + "; ".join(problems) + f" (dumps in {dump_dir})")
    exported = console_exchange(args.port, "ds.export", r"DS_RECORD_BEGIN.*?DS_RECORD_END", 60, args.baud)
    record = ds_record.exact(parse_export(exported))
    spki = ds_record.parse(record)["spki"]
    save_ds_files(record, spki, out_dir, dump_dir)
    status = parse_status(console_exchange(args.port, "ds.status", r"DS_STATUS[^\n]*", 30, args.baud))
    if status.get("available") != "1" or status.get("record") != "1":
        raise LabReaderError(f"the firmware reports {status} after the burn (record saved to {out_dir})")
    print(f"DS key created. Record and public key written to {out_dir}; commit them now. "
          f"Credential fingerprint the server will show: {ds_record.fingerprint(spki)}. Dumps: {dump_dir}")


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = parser.add_subparsers(dest="command", required=True)
    for name in ("status", "provision", "flash", "hex", "create-ds"):
        p = sub.add_parser(name)
        if name != "hex":
            p.add_argument("--port", required=True)
        if name not in ("status", "create-ds"):
            p.add_argument("--build-dir", required=True, help="lab secure build directory")
    sub.choices["hex"].add_argument("--output", required=True, help="Intel HEX file to write")
    sub.choices["hex"].add_argument("--mac", help="also merge the committed DS record of this reader's MAC")
    create = sub.choices["create-ds"]
    create.add_argument("--expect-mac", required=True, help=f"must be {APPROVED_DS_MAC}; any other MAC is refused")
    create.add_argument("--burn-efuses", action="store_true",
                        help="run the burn (KEY3 + RD_DIS lock, irreversible); without it: read-only pre-checks")
    create.add_argument("--dump-dir", help="where the eFuse dumps and a backup of the export go (default: a temp dir)")
    create.add_argument("--out-dir", help="where the record and public key go (default: lab/ds/<mac>)")
    create.add_argument("--baud", type=int, default=115200, help="console baud rate")
    sub.choices["provision"].add_argument("--expect-mac", required=True,
                                          help="MAC of the reader to provision (see `status`); any other chip is refused")
    sub.choices["provision"].add_argument("--burn-efuses", action="store_true",
                                          help="allow burning the lab key digests (irreversible)")
    sub.choices["flash"].add_argument("--erase-all", action="store_true",
                                      help="erase the whole flash first (drops the reader's settings)")
    args = parser.parse_args()
    try:
        {"status": cmd_status, "provision": cmd_provision, "flash": cmd_flash, "hex": cmd_hex,
         "create-ds": cmd_create_ds}[args.command](args)
    except LabReaderError as error:
        print(f"Error: {error}", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
