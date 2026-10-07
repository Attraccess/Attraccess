#!/usr/bin/env python3
"""Build all shipped Attractap firmware variants with ESP-IDF (idf.py).

Produces firmware_output/ with, per variant:
  - {name}_{variant}.bin      merged image for the web serial flasher (offset 0x0)
  - {name}_{variant}_ota.bin  app-only image streamed over the websocket OTA
  - {name}_{variant}.elf      unstripped ELF for server-side coredump symbolication
plus firmwares.json — the manifest consumed by the API/frontend. The manifest
field set must stay stable; the flasher and OTA pipeline depend on it.
"""
import glob
import json
import os
import re
import shlex
import shutil
import subprocess
import sys

FIRMWARE_DIR = os.path.dirname(os.path.abspath(__file__))
CHIP = "esp32s3"  # both boards are ESP32-S3
BOARD_FAMILY = "ESP32-S3"


from firmware_toolchain import (resolve_python_command, resolve_esptool_command, generate_certificates, find_idf_export, run_idf)
from firmware_images import extract_cmake_value, extract_build_id, run_merge_bin

def main():
    os.chdir(FIRMWARE_DIR)

    if not shutil.which("idf.py") and not find_idf_export():
        # Parity with the old platformio-missing branch: local environments
        # without the toolchain skip the firmware build instead of failing
        # the whole monorepo build.
        print("Warning: ESP-IDF not found (idf.py not on PATH, no export.sh located), skipping firmware build")
        sys.exit(0)

    python_cmd = resolve_python_command()
    esptool_cmd = resolve_esptool_command()

    with open("version.txt") as f:
        firmware_version = f.read().strip().splitlines()[0]
    print(f"Firmware version: {firmware_version}")

    generate_certificates(python_cmd)

    active_variants = [
        "attractap-touch",
        "attractap-touch-v2",
        # "attractap-lite-ethernet",
        # "attractap-touch-ethernet",
        # "attractap-touch-demo",
        # "attractap-touch-v2-demo",
    ]
    variants = [(name, os.path.join("variants", name + ".cmake")) for name in active_variants]

    if not variants:
        print("Error: No variant files found in variants/")
        sys.exit(1)
    print(f"Found variants: {[v for v, _ in variants]}")

    output_dir = os.path.abspath("firmware_output")
    if os.path.exists(output_dir):
        print(f"Cleaning output directory: {output_dir}")
        shutil.rmtree(output_dir)
    os.makedirs(output_dir, exist_ok=True)

    firmware_info = []

    for variant, variant_path in variants:
        print(f"\n=== Building variant: {variant} ===")
        with open(variant_path) as f:
            content = f.read()

        firmware_name = extract_cmake_value(content, "ATTRACTAP_FIRMWARE_NAME")
        friendly_name = extract_cmake_value(content, "ATTRACTAP_FIRMWARE_FRIENDLY_NAME")
        firmware_variant = extract_cmake_value(content, "ATTRACTAP_FIRMWARE_VARIANT")
        variant_friendly_name = extract_cmake_value(content, "ATTRACTAP_FIRMWARE_VARIANT_FRIENDLY_NAME")

        missing = [n for n, v in [
            ("ATTRACTAP_FIRMWARE_NAME", firmware_name),
            ("ATTRACTAP_FIRMWARE_FRIENDLY_NAME", friendly_name),
            ("ATTRACTAP_FIRMWARE_VARIANT", firmware_variant),
            ("ATTRACTAP_FIRMWARE_VARIANT_FRIENDLY_NAME", variant_friendly_name),
        ] if not v]
        if missing:
            print(f"Error: {variant_path} does not set: {', '.join(missing)}")
            sys.exit(1)

        build_dir = os.path.join("build", variant)
        # CMake caches absolute paths to the source tree and ESP-IDF checkout.
        # Reusing a build directory from another worktree can therefore make
        # the compiler read a different checkout, or fail with a stale cache.
        if os.path.exists(build_dir):
            print(f"Cleaning CMake build directory: {os.path.abspath(build_dir)}")
            shutil.rmtree(build_dir)
        sdkconfig_path = os.path.abspath(os.path.join(build_dir, "sdkconfig"))
        build_args = [
            "-B", build_dir,
            f"-DSDKCONFIG={sdkconfig_path}",
            f"-DATTRACTAP_VARIANT={variant}",
            "-DATTRACTAP_LOG_LEVEL=ERROR",  # production runtime log level
            "build",
        ]
        print(f"Running: idf.py {' '.join(build_args)}")
        if run_idf(build_args) != 0:
            print(f"Error: Build failed for variant '{variant}'")
            sys.exit(1)

        # Flash layout from flasher_args.json (bootloader, partition table,
        # otadata initial image, app). The otadata image MUST be part of the
        # merged bin or freshly flashed devices boot-loop on garbage otadata.
        flasher_args_path = os.path.join(build_dir, "flasher_args.json")
        with open(flasher_args_path) as f:
            flasher_args = json.load(f)
        flash_files = sorted(
            ((offset, os.path.join(build_dir, rel_path))
             for offset, rel_path in flasher_args["flash_files"].items()),
            key=lambda item: int(item[0], 16),
        )

        print(f"Flash layout for {variant}:")
        for offset, path in flash_files:
            print(f"  {offset}: {os.path.relpath(path, build_dir)}")
            if not os.path.exists(path):
                print(f"Error: missing flash image {path}")
                sys.exit(1)

        app_bin = os.path.join(build_dir, flasher_args["app"]["file"])
        elf_path = os.path.join(build_dir, "attractap.elf")

        firmware_filename = f"{firmware_name}_{firmware_variant}.bin"
        merged_bin_path = os.path.join(output_dir, firmware_filename)
        print(f"Creating merged firmware for {variant}...")
        run_merge_bin(esptool_cmd, merged_bin_path, flash_files)
        print(f"Merged firmware created at: {merged_bin_path}")

        # Unstripped ELF so the server can symbolicate coredumps
        elf_filename = f"{firmware_name}_{firmware_variant}.elf"
        build_id = None
        if os.path.exists(elf_path):
            shutil.copyfile(elf_path, os.path.join(output_dir, elf_filename))
            print(f"ELF copied to: {os.path.join(output_dir, elf_filename)}")
            build_id = extract_build_id(app_bin, esptool_cmd)
            print(f"  Build id: {build_id}")
        else:
            elf_filename = None
            print(f"Warning: ELF not found at {elf_path}; symbolication will be unavailable for {variant}")

        # App-only OTA image (no bootloader/partitions)
        ota_filename = f"{firmware_name}_{firmware_variant}_ota.bin"
        shutil.copyfile(app_bin, os.path.join(output_dir, ota_filename))
        print(f"OTA app image copied to: {os.path.join(output_dir, ota_filename)}")

        firmware_info.append({
            "name": firmware_name,
            "friendlyName": friendly_name,
            "variant": firmware_variant,
            "variantFriendlyName": variant_friendly_name,
            "version": firmware_version,
            "boardFamily": BOARD_FAMILY,
            "filename": firmware_filename,
            "filenameOTA": ota_filename,
            "elfFilename": elf_filename,
            "buildId": build_id,
            "chip": CHIP,
            # Keep the historically conservative flasher parameters — the
            # frontend esptool-js flasher behavior must not change.
            "flashMode": "dio",
            "flashFreq": "80m",
            "flashSize": "16MB",
        })

    with open(os.path.join(output_dir, "firmwares.json"), "w") as f:
        json.dump({"firmwares": firmware_info}, f, indent=2)

    print(f"\nBuild completed. Output in {output_dir}")
    print(f"Total variants built: {len(firmware_info)}")


if __name__ == "__main__":
    main()
