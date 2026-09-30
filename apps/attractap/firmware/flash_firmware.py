#!/usr/bin/env python3
"""Build one Attractap variant and flash it to a USB-connected reader.

Thin dev wrapper around `idf.py flash` (unlike build_firmwares.py, which builds
every shipped variant into firmware_output/). Reuses build_firmwares.py's
ESP-IDF bootstrap and CA-cert generation so `nx flash` works in a plain shell.

  nx flash attractap-firmware -- --variant attractap-touch --port /dev/ttyACM0
  nx flash attractap-firmware -- -v attractap-touch --monitor   # auto-detect port
  nx flash attractap-firmware -- --list                         # list variants
"""
import argparse
import glob
import os
import sys

import build_firmwares as bf


def available_variants():
    return sorted(
        os.path.splitext(os.path.basename(p))[0]
        for p in glob.glob(os.path.join(bf.FIRMWARE_DIR, "variants", "*.cmake"))
    )


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("-v", "--variant", help="variant name (see --list)")
    parser.add_argument("-p", "--port", help="serial port; omit to let idf.py auto-detect")
    parser.add_argument("-b", "--baud", help="flash baud rate (idf.py default if omitted)")
    parser.add_argument("--monitor", action="store_true", help="open serial monitor after flashing")
    parser.add_argument("--list", action="store_true", help="list available variants and exit")
    args = parser.parse_args()

    variants = available_variants()
    if args.list:
        print("\n".join(variants))
        return 0

    if not args.variant:
        parser.error("--variant is required (use --list to see options)")
    if args.variant not in variants:
        parser.error(f"unknown variant '{args.variant}'. Available: {', '.join(variants)}")

    os.chdir(bf.FIRMWARE_DIR)

    if not bf.shutil.which("idf.py") and not bf.find_idf_export():
        print("Error: ESP-IDF not found (idf.py not on PATH, no export.sh located)")
        return 1

    bf.generate_certificates(bf.resolve_python_command())

    idf_args = ["-B", os.path.join("build", args.variant), f"-DATTRACTAP_VARIANT={args.variant}"]
    if args.port:
        idf_args += ["-p", args.port]
    if args.baud:
        idf_args += ["-b", args.baud]
    idf_args.append("flash")
    if args.monitor:
        idf_args.append("monitor")

    return bf.run_idf(idf_args)


if __name__ == "__main__":
    sys.exit(main())
