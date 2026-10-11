#!/usr/bin/env sh
# Compatibility entry point for the portable firmware version regression suite.
set -eu
repo_root=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
exec node --test "$repo_root/scripts/attractap-firmware-version-check.test.mjs"
