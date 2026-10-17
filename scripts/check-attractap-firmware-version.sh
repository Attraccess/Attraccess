#!/usr/bin/env sh
# Compatibility entry point for the firmware-owned version check.
set -eu
repo_root=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
exec node "$repo_root/apps/attractap/firmware/tools/check-version.mjs" "$@"
