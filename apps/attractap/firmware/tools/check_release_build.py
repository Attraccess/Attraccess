#!/usr/bin/env python3
"""Release build gate: lab-only code must never ship (ATT-1144).

With a release build directory, fails (exit 1) when:
  - a source was compiled with a lab-only define (ATTRACTAP_CRASH_TRIGGER,
    ATTRACTAP_TEST_HOOKS, ATTRACTAP_UI_SELFTEST), read from compile_commands.json,
  - the app image contains a lab-only serial topic (the `debug.crash` trigger).

Usage: check_release_build.py <build-dir>
"""

import argparse
import json
import os
import sys

LAB_ONLY_DEFINES = ("ATTRACTAP_CRASH_TRIGGER=1", "ATTRACTAP_TEST_HOOKS=1", "ATTRACTAP_UI_SELFTEST=1")
LAB_ONLY_MARKERS = (b"debug.crash",)
APP_IMAGE = "attractap.bin"


class GateError(Exception):
    """An input of the gate is missing or malformed (reported without a traceback)."""


def check_compile_commands(compile_commands):
    if not isinstance(compile_commands, list) or not all(isinstance(e, dict) and "file" in e for e in compile_commands):
        raise GateError("compile_commands.json is not a list of compile entries")
    errors = []
    for define in LAB_ONLY_DEFINES:
        files = sorted({e["file"] for e in compile_commands
                        if define in (e.get("command") or " ".join(e.get("arguments", [])))})
        if files:
            errors.append(f"{define} is defined for {len(files)} source(s), e.g. {files[0]}")
    return errors


def check_app_image(image):
    return [f"the app image contains the lab-only marker {marker.decode()!r}"
            for marker in LAB_ONLY_MARKERS if marker in image]


def read(path, mode="r"):
    try:
        with open(path, mode) as f:
            return f.read()
    except OSError as error:
        raise GateError(f"cannot read {path}: {error.strerror}") from error


def run_checks(build_dir):
    try:
        compile_commands = json.loads(read(os.path.join(build_dir, "compile_commands.json")))
    except json.JSONDecodeError as error:
        raise GateError(f"{build_dir}/compile_commands.json is not valid JSON") from error
    errors = check_compile_commands(compile_commands)
    errors += check_app_image(read(os.path.join(build_dir, APP_IMAGE), "rb"))
    return errors


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("build_dir")
    args = parser.parse_args(argv)
    try:
        errors = run_checks(args.build_dir)
    except GateError as error:
        print(f"Release build gate: {error}", file=sys.stderr)
        return 1
    for error in errors:
        print(f"Release build gate: {error}", file=sys.stderr)
    if errors:
        return 1
    print(f"Release build gate passed: {args.build_dir}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
