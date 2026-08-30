#!/usr/bin/env python3
"""Build all shipped Attractap firmware variants with ESP-IDF (idf.py).

Produces firmware_output/ with, per variant:
  - {name}_{variant}.bin      merged image for the web serial flasher (offset 0x0)
  - {name}_{variant}_ota.bin  app-only image streamed over the websocket OTA
  - {name}_{variant}.elf      unstripped ELF for server-side coredump symbolication
plus firmwares.json — the manifest consumed by the API/frontend. The manifest
field set must stay stable; the flasher and OTA pipeline depend on it.
"""
import argparse
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


def resolve_python_command():
    """Pick a Python executable with fallback."""
    if sys.executable and os.path.exists(sys.executable):
        return sys.executable
    for cmd in ("python3", "python"):
        if shutil.which(cmd):
            return cmd
    return "python3"


def resolve_esptool_command():
    """Find a working esptool invocation without assuming pip-installed
    packages in the system Python (which e.g. NixOS does not even ship pip
    for). Preference order:
      1. esptool on PATH (pip --user install, nixpkgs esptool, sourced IDF env)
      2. ESP-IDF's own Python virtualenv — the IDF installer always bundles
         esptool there ($IDF_PYTHON_ENV_PATH, or ~/.espressif/python_env/*)
      3. the current interpreter (works when esptool is importable here)
    """
    for cmd in ("esptool.py", "esptool"):
        if shutil.which(cmd):
            return [cmd]

    idf_pythons = []
    env_path = os.environ.get("IDF_PYTHON_ENV_PATH")
    if env_path:
        idf_pythons.append(os.path.join(env_path, "bin", "python"))
    tools_path = os.environ.get("IDF_TOOLS_PATH", os.path.expanduser("~/.espressif"))
    idf_pythons.extend(sorted(
        glob.glob(os.path.join(tools_path, "python_env", "*", "bin", "python")),
        reverse=True,  # prefer the newest IDF env
    ))
    for python in idf_pythons:
        if os.path.exists(python):
            return [python, "-m", "esptool"]

    return [resolve_python_command(), "-m", "esptool"]


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


def generate_certificates(python_cmd):
    """Generate the adaptive-TLS CA certificate headers (src/certs/) before the
    build — the successor of the old PlatformIO `extra_scripts pre:` hook."""
    print("Generating CA certificates...")
    script = os.path.join(FIRMWARE_DIR, "tools", "build_individual_ca_certs.py")
    result = subprocess.run([python_cmd, script], cwd=FIRMWARE_DIR)
    if result.returncode != 0:
        print("Error: CA certificate generation failed")
        sys.exit(1)


def find_idf_export():
    """Locate ESP-IDF's export.sh so the script can bootstrap the IDF
    environment itself (nx invokes this script in a plain shell)."""
    candidates = [
        os.path.join(FIRMWARE_DIR, "..", "..", "..", ".tools", "esp-idf"),
        os.environ.get("IDF_PATH"),
        os.path.expanduser("~/esp/esp-idf"),
        os.path.expanduser("~/esp-idf"),
        "/opt/esp/idf",
    ]
    for candidate in candidates:
        if candidate and os.path.exists(os.path.join(candidate, "export.sh")):
            return os.path.join(candidate, "export.sh")
    return None


def run_idf(args):
    """Run idf.py from ESP-IDF's export.sh when it is available.

    idf.py refuses to run without cmake and ninja, but ESP-IDF's Linux
    installer marks both "on_request" (tools.json) and never installs them,
    assuming the system provides them — which e.g. NixOS does not. So when
    they are missing after export.sh, fetch them into the IDF tool set
    (~/.espressif) once and re-source.
    """
    export_script = find_idf_export()
    if not export_script:
        if shutil.which("idf.py") and shutil.which("cmake") and shutil.which("ninja"):
            return subprocess.run(["idf.py", *args]).returncode
        print("Error: idf.py needs cmake and ninja on PATH, and no ESP-IDF "
               "export.sh was found to install them from")
        return 1
    source_export = "source " + shlex.quote(export_script) + " >/dev/null"
    ensure_tools = (
        "if ! command -v cmake >/dev/null 2>&1 || ! command -v ninja >/dev/null 2>&1; then "
        'echo "cmake/ninja not found — installing them into the ESP-IDF tool set..."; '
        'python "$IDF_PATH/tools/idf_tools.py" install cmake ninja && ' + source_export + "; "
        "fi"
    )
    command = source_export + " && " + ensure_tools + " && idf.py " + " ".join(shlex.quote(a) for a in args)
    return subprocess.run(["bash", "-c", command]).returncode


def resolve_toolchain_identity():
    """Return the ESP-IDF checkout and revision used to configure CMake."""
    export_script = find_idf_export()
    if export_script:
        idf_path = os.path.dirname(export_script)
        try:
            revision = subprocess.run(
                ["git", "-C", idf_path, "rev-parse", "HEAD"],
                capture_output=True,
                text=True,
            )
        except OSError:
            revision = None
        if revision and revision.returncode == 0:
            return f"{idf_path}@{revision.stdout.strip()}"
        version_path = os.path.join(idf_path, "version.txt")
        try:
            with open(version_path) as f:
                return f"{idf_path}@{f.read().strip()}"
        except FileNotFoundError:
            pass
        return idf_path
    return os.path.realpath(shutil.which("idf.py") or "idf.py")


def prepare_build_dir(build_dir, clean, toolchain_identity):
    """Discard build state only when requested or configured elsewhere."""
    if not os.path.exists(build_dir):
        return
    if clean:
        print(f"Cleaning CMake build directory: {os.path.abspath(build_dir)}")
        shutil.rmtree(build_dir)
        return

    state_path = os.path.join(build_dir, ".attractap-build-state.json")
    try:
        with open(state_path) as f:
            state = json.load(f)
    except (FileNotFoundError, json.JSONDecodeError):
        state = None
    expected_state = {
        "firmwareDir": FIRMWARE_DIR,
        "toolchain": toolchain_identity,
    }
    if state != expected_state:
        print(f"Cleaning stale CMake build directory: {os.path.abspath(build_dir)}")
        shutil.rmtree(build_dir)


def write_build_state(build_dir, toolchain_identity):
    with open(os.path.join(build_dir, ".attractap-build-state.json"), "w") as f:
        json.dump(
            {
                "firmwareDir": FIRMWARE_DIR,
                "toolchain": toolchain_identity,
            },
            f,
            sort_keys=True,
        )


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--clean",
        action="store_true",
        help="discard cached CMake/Ninja state before building",
    )
    args = parser.parse_args()
    os.chdir(FIRMWARE_DIR)

    if not shutil.which("idf.py") and not find_idf_export():
        # Parity with the old platformio-missing branch: local environments
        # without the toolchain skip the firmware build instead of failing
        # the whole monorepo build.
        print("Warning: ESP-IDF not found (idf.py not on PATH, no export.sh located), skipping firmware build")
        sys.exit(0)

    python_cmd = resolve_python_command()
    esptool_cmd = resolve_esptool_command()
    toolchain_identity = resolve_toolchain_identity()

    with open("version.txt") as f:
        firmware_version = f.read().strip().splitlines()[0]
    print(f"Firmware version: {firmware_version}")

    generate_certificates(python_cmd)

    variant_files = sorted(glob.glob(os.path.join("variants", "*.cmake")))
    variants = []
    for path in variant_files:
        name = os.path.splitext(os.path.basename(path))[0]
        # -demo variants ship (hidden behind an expandable section in the
        # frontend flasher); -debug stays out of production/docker builds.
        if name.endswith("-debug"):
            print(f"Skipping development variant: {name}")
            continue
        variants.append((name, path))

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
        prepare_build_dir(build_dir, args.clean, toolchain_identity)
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
        write_build_state(build_dir, toolchain_identity)

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
