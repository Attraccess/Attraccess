#!/usr/bin/env python3
"""Provision and re-flash device-lab secure test readers (ATT-1166).

A lab secure reader runs the secure profile with sdkconfig.secure-lab on top
(-DATTRACTAP_SECURE_PROFILE=ON -DATTRACTAP_SECURE_LAB=ON): Secure Boot v2 bound
to the committed lab keys in lab/secure-boot/, and development-mode flash
encryption, so it stays re-flashable over USB with encrypted writes.

  status     print the reader's security eFuses (read-only)
  provision  first time only: burn the lab key digests into KEY0/KEY1, erase
             flash and write the signed images in plaintext. The first boot
             enables Secure Boot and flash encryption. IRREVERSIBLE.
  flash      re-flash a provisioned lab reader with signed, encrypted images
             (also recovers a reader whose flash was erased)

Run inside an ESP-IDF environment (espefuse, esptool and espsecure on PATH).
"""

import argparse
import json
import os
import subprocess
import sys
import tempfile

FIRMWARE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
KEY_DIR = os.path.join(FIRMWARE_DIR, "lab", "secure-boot")
SIGNING_KEY = os.path.join(KEY_DIR, "lab-signing-key.pem")
RECOVERY_KEY = os.path.join(KEY_DIR, "lab-recovery-key.pem")
CHIP = "esp32s3"
BOOTLOADER_OFFSET = "0x0"


class LabReaderError(Exception):
    """The reader or build is not in a state this command may act on."""


def run(cmd, capture=False):
    print("+ " + " ".join(cmd), flush=True)
    result = subprocess.run(cmd, text=True, capture_output=capture)
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
    raw = value(efuses, "SPI_BOOT_CRYPT_CNT")
    if isinstance(raw, int):
        return raw
    return {"Disable": 0, "Enable": 1}.get(raw, None) if not str(raw).isdigit() else int(raw)


def describe(efuses):
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


def flash_layout(build_dir):
    """[(offset, path, encrypted)] including the bootloader, from flasher_args.json."""
    with open(os.path.join(build_dir, "flasher_args.json")) as f:
        args = json.load(f)
    sdkconfig = open(os.path.join(build_dir, "sdkconfig")).read()
    if "CONFIG_SECURE_FLASH_ENCRYPTION_MODE_DEVELOPMENT=y" not in sdkconfig or "CONFIG_SECURE_BOOT_V2_ENABLED=y" not in sdkconfig:
        raise LabReaderError(f"{build_dir} is not a lab secure build (-DATTRACTAP_SECURE_PROFILE=ON -DATTRACTAP_SECURE_LAB=ON)")
    images = [(BOOTLOADER_OFFSET, os.path.join(build_dir, "bootloader", "bootloader.bin"), True, True)]
    for entry in ("partition-table", "otadata", "app"):
        info = args[entry]
        images.append((info["offset"], os.path.join(build_dir, info["file"]), info["encrypted"] == "true", entry == "app"))
    return images


def signed_images(images, tmp):
    """Sign the bootloader and the app with the lab key; other images pass through."""
    out = []
    for offset, path, encrypted, needs_signature in images:
        if needs_signature:
            signed = os.path.join(tmp, os.path.basename(path).replace(".bin", "-lab-signed.bin"))
            run(["espsecure", "sign-data", "--version", "2", "--keyfile", SIGNING_KEY, "-o", signed, path], capture=True)
            path = signed
        out.append((offset, path, encrypted))
    return out


def cmd_status(args):
    efuses = read_efuses(args.port)
    describe(efuses)
    digests = (key_digest(SIGNING_KEY), key_digest(RECOVERY_KEY))
    print("  lab key digests burned:", lab_digests_burned(efuses, digests))


def cmd_provision(args):
    images = flash_layout(args.build_dir)
    efuses = read_efuses(args.port)
    describe(efuses)
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
    if cnt is None or cnt % 2 == 0 or value(efuses, "DIS_DOWNLOAD_MANUAL_ENCRYPT") \
            or not efuses["SPI_BOOT_CRYPT_CNT"].get("writeable", True):
        raise LabReaderError("Flash encryption is not in development mode: this reader only takes signed OTA updates")
    with tempfile.TemporaryDirectory() as tmp:
        files = signed_images(images, tmp)
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


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = parser.add_subparsers(dest="command", required=True)
    for name in ("status", "provision", "flash"):
        p = sub.add_parser(name)
        p.add_argument("--port", required=True)
        if name != "status":
            p.add_argument("--build-dir", required=True, help="lab secure build directory")
    sub.choices["provision"].add_argument("--burn-efuses", action="store_true",
                                          help="allow burning the lab key digests (irreversible)")
    sub.choices["flash"].add_argument("--erase-all", action="store_true",
                                      help="erase the whole flash first (drops the reader's settings)")
    args = parser.parse_args()
    try:
        {"status": cmd_status, "provision": cmd_provision, "flash": cmd_flash}[args.command](args)
    except LabReaderError as error:
        print(f"Error: {error}", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
