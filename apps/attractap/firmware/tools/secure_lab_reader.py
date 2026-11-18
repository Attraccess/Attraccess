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
             create_ds.py and lab/ds/README.md.

`flash` and `hex --mac` also write the committed DS record of the reader's MAC
(lab/ds/<mac>/ds-record.bin, encrypted, at the start of the spiffs partition) when
there is one, so a wipe does not take the reader's DS identity with it. `flash
--erase-all` refuses a reader whose KEY3 holds a DS key but has no committed record.

Run inside an ESP-IDF environment (espefuse, esptool and espsecure on PATH).
"""

import argparse
import json
import os
import subprocess
import sys
import re
import tempfile

if __name__ == "__main__":
    # create_ds imports this module by name; run as a script it must get this one (one LabReaderError).
    sys.modules.setdefault("secure_lab_reader", sys.modules[__name__])
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import ds_record  # noqa: E402

FIRMWARE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
KEY_DIR = os.path.join(FIRMWARE_DIR, "lab", "secure-boot")
SIGNING_KEY = os.path.join(KEY_DIR, "lab-signing-key.pem")
RECOVERY_KEY = os.path.join(KEY_DIR, "lab-recovery-key.pem")
DS_DIR_ENV = "ATTRACTAP_LAB_DS_DIR"
DEFAULT_DS_DIR = os.path.join(FIRMWARE_DIR, "lab", "ds")
DS_PURPOSE = "HMAC_DOWN_DIGITAL_SIGNATURE"
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


def normalise_mac(text):
    """A MAC typed as DC-B4-D9-21-71-C8, dcb4d92171c8 or dc:b4:... as lowercase aa:bb:cc:dd:ee:ff."""
    digits = re.sub(r"[:\-\s]", "", text.strip().lower())
    if not re.fullmatch(r"[0-9a-f]{12}", digits):
        raise LabReaderError(f"{text!r} is not a MAC address")
    return ":".join(digits[i:i + 2] for i in range(0, 12, 2))


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

    ds_mac: also merge that reader's committed DS record at the start of the spiffs partition (a MAC
    without a record merges nothing, as for any reader without DS)."""
    images = flash_layout(build_dir)
    plain = [offset for offset, _, encrypted, _ in images if not encrypted]
    if plain:
        raise LabReaderError(f"{build_dir} has parts that are not written encrypted at {', '.join(plain)}")
    ds_mac = normalise_mac(ds_mac) if ds_mac else None
    directory = ds_directory or ds_dir()
    with tempfile.TemporaryDirectory() as tmp:
        flat = [item for offset, path, _ in signed_images(images, tmp) for item in (offset, path)]
        sector = restore_sector(ds_mac, directory) if ds_mac else None
        if ds_mac:
            print(f"Also merging the DS record for {ds_mac}." if sector else
                  f"No DS record for {ds_mac} in {directory}: the image has none (right for a reader without DS).")
        if sector:
            record = os.path.join(tmp, "ds-record-sector.bin")
            with open(record, "wb") as f:
                f.write(sector)
            flat += [hex(ds_record.DS_RECORD_OFFSET), record]
        run(["esptool", "--chip", CHIP, "merge-bin", "--format", "hex", "-o", output, *flat])


def ds_dir(args=None):
    return getattr(args, "ds_dir", None) or os.environ.get(DS_DIR_ENV) or DEFAULT_DS_DIR


def wipe_restore_sector(efuses, directory, erase):
    """The DS record sector to write with a flash of this reader, or None.

    The one place every tool-side wipe goes through: an erase of a reader whose KEY3 already holds the DS
    key needs its committed record, because the encrypted DS params in its flash are the only copy."""
    sector = restore_sector(mac(efuses), directory)
    if sector is None and erase and value(efuses, "KEY_PURPOSE_3") == DS_PURPOSE:
        raise LabReaderError(f"KEY3 of {mac(efuses)} holds a DS key but there is no committed DS record in "
                             f"{directory}; refusing to erase the reader")
    return sector


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
    expected = normalise_mac(args.expect_mac)
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
        sector = wipe_restore_sector(efuses, ds_dir(args), args.erase_all)
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
    create.add_argument("--expect-mac", required=True, help="must be dc:b4:d9:21:71:c8; any other MAC is refused")
    create.add_argument("--burn-efuses", action="store_true",
                        help="run the burn (KEY3 + RD_DIS lock, irreversible); without it: read-only pre-checks")
    create.add_argument("--dump-dir", help="where the eFuse dumps and a backup of the export go (default: a temp dir)")
    create.add_argument("--out-dir", help=f"where the record and public key go (default: <${DS_DIR_ENV} or "
                                          "lab/ds>/<mac>)")
    create.add_argument("--baud", type=int, default=115200, help="console baud rate")
    sub.choices["provision"].add_argument("--expect-mac", required=True,
                                          help="MAC of the reader to provision (see `status`); any other chip is refused")
    sub.choices["provision"].add_argument("--burn-efuses", action="store_true",
                                          help="allow burning the lab key digests (irreversible)")
    sub.choices["flash"].add_argument("--erase-all", action="store_true",
                                      help="erase the whole flash first (drops the reader's settings)")
    args = parser.parse_args()
    import create_ds  # here, not at the top: it imports this module
    try:
        {"status": cmd_status, "provision": cmd_provision, "flash": cmd_flash, "hex": cmd_hex,
         "create-ds": create_ds.cmd_create_ds}[args.command](args)
    except (LabReaderError, ds_record.DsRecordError) as error:
        print(f"Error: {error}", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
