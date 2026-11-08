"""Packaging of the unsigned secure-profile images (ATT-1205).

The release build ships the secure app and bootloader of variants with
ATTRACTAP_SECURE_PROFILE_BUILD next to the plain firmware, described by a
`secureImage` object in firmwares.json. They are unsigned: the API signs them
per installation and key. They never appear in `filename` (web flasher) or
`filenameOTA` (plain OTA).
"""

import hashlib
import json
import os
import shutil

# Embedded in the secure app; the server checks it before signing and the reader before burning.
SECURE_PROFILE_MARKER = "attractap-secure-profile-v1"


def sha256_file(path):
    with open(path, "rb") as f:
        return hashlib.sha256(f.read()).hexdigest()


def secure_version(build_dir):
    """CONFIG_BOOTLOADER_APP_SECURE_VERSION the images were built with.

    Reads config/sdkconfig.json, not <build>/sdkconfig, which can be stale when
    -DSDKCONFIG pointed elsewhere (see tools/secure_lab_reader.py)."""
    path = os.path.join(build_dir, "config", "sdkconfig.json")
    with open(path) as f:
        version = json.load(f).get("BOOTLOADER_APP_SECURE_VERSION")
    if not isinstance(version, int) or isinstance(version, bool):
        raise ValueError(f"{path} does not set BOOTLOADER_APP_SECURE_VERSION")
    return version


def build_file(build_dir, flasher_args, key, fallback):
    """Path of a build output. Secure Boot builds leave the bootloader out of
    flasher_args.json (it is flashed once, by hand), so fall back to its fixed build path."""
    entry = flasher_args.get(key)
    relative = entry["file"] if isinstance(entry, dict) and entry.get("file") else fallback
    return os.path.join(build_dir, relative)


def package_secure_images(build_dir, output_dir, firmware_name, firmware_variant):
    """Copy the secure app, bootloader into output_dir and return the `secureImage` manifest entry.

    Returns None when the app does not carry the profile marker: such an image
    must not be signed, so it is left out of the release rather than shipped half-ready."""
    with open(os.path.join(build_dir, "flasher_args.json")) as f:
        flasher_args = json.load(f)
    app_src = build_file(build_dir, flasher_args, "app", "attractap.bin")
    bootloader_src = build_file(build_dir, flasher_args, "bootloader", os.path.join("bootloader", "bootloader.bin"))
    table_src = build_file(
        build_dir, flasher_args, "partition-table", os.path.join("partition_table", "partition-table.bin")
    )
    with open(app_src, "rb") as f:
        if SECURE_PROFILE_MARKER.encode() not in f.read():
            print(f"Warning: secure app of {firmware_variant} lacks the profile marker; "
                  "not packaging its secure images")
            return None

    app_name = f"{firmware_name}_{firmware_variant}_secure_app.bin"
    bootloader_name = f"{firmware_name}_{firmware_variant}_secure_bootloader.bin"
    shutil.copyfile(app_src, os.path.join(output_dir, app_name))
    shutil.copyfile(bootloader_src, os.path.join(output_dir, bootloader_name))
    return {
        "appFilename": app_name,
        "bootloaderFilename": bootloader_name,
        "secureVersion": secure_version(build_dir),
        "profileMarker": SECURE_PROFILE_MARKER,
        "appSha256": sha256_file(app_src),
        "bootloaderSha256": sha256_file(bootloader_src),
        "partitionTableSha256": sha256_file(table_src),
    }
