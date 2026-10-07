"""Firmware image merging, build identifiers and manifest constants."""
import glob
import os
import re
import shlex
import shutil
import subprocess
import sys

CHIP = "esp32s3"
BOARD_FAMILY = "ESP32-S3"

def extract_cmake_value(content, variable):
    """Extract `set(<variable> "<value>")` from a variant .cmake file."""
    match = re.search(rf'set\(\s*{re.escape(variable)}\s+"([^"]*)"\s*\)', content)
    return match.group(1) if match else None


def extract_build_id(firmware_bin_path, esptool_cmd):
    """Best-effort: read app_elf_sha256 from the app image so the server can
    match the exact ELF to a coredump's build id. Returns lowercase hex or None."""
    if not os.path.exists(firmware_bin_path):
        return None
    # esptool v4 spells it `image_info --version 2`; v5 renamed the command and
    # dropped the flag. Try both.
    candidates = [
        [*esptool_cmd, "--chip", CHIP, "image_info", "--version", "2", firmware_bin_path],
        [*esptool_cmd, "--chip", CHIP, "image-info", firmware_bin_path],
    ]
    for info_cmd in candidates:
        try:
            result = subprocess.run(info_cmd, capture_output=True, text=True)
            output = (result.stdout or "") + "\n" + (result.stderr or "")
            match = re.search(r"(?:ELF file SHA256|app_elf_sha256)[^0-9a-fA-F]*([0-9a-fA-F]{64})", output)
            if not match:
                match = re.search(r"Validation hash[^0-9a-fA-F]*([0-9a-fA-F]{64})", output, re.IGNORECASE)
            if match:
                return match.group(1).lower()
        except Exception as e:
            print(f"Warning: build id extraction attempt failed: {e}")
    print(f"Warning: Could not extract build id from {firmware_bin_path}")
    return None


def run_merge_bin(esptool_cmd, out_path, flash_files):
    """esptool merge_bin (v4) / merge-bin (v5)."""
    for subcommand in ("merge_bin", "merge-bin"):
        merge_cmd = [*esptool_cmd, "--chip", CHIP, subcommand, "-o", out_path]
        for offset, path in flash_files:
            merge_cmd.extend([offset, path])
        print(f"Running: {' '.join(merge_cmd)}")
        result = subprocess.run(merge_cmd, capture_output=True, text=True)
        if result.returncode == 0:
            return
        print(f"esptool {subcommand} failed (rc={result.returncode})")
        print(f"STDOUT: {result.stdout}")
        print(f"STDERR: {result.stderr}")
    print(f"Error: Failed to create merged firmware {out_path}")
    sys.exit(1)
