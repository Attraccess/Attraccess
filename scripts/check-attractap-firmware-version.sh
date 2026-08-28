#!/usr/bin/env bash
# Fail when Attractap firmware source changes without bumping version.txt.

set -euo pipefail

BASE="${1:-${NX_AFFECTED_BASE:-origin/main}}"
VERSION_FILE="apps/attractap/firmware/version.txt"

if ! git rev-parse --verify "${BASE}^{commit}" >/dev/null 2>&1; then
  echo "Could not resolve base ref: ${BASE}" >&2
  exit 1
fi

mapfile -t changed_files < <(git diff --name-only "${BASE}...HEAD" --)

firmware_source_changed=false
for file in "${changed_files[@]}"; do
  case "$file" in
    apps/attractap/firmware/README.md)
      ;;
    apps/attractap/firmware/*)
      firmware_source_changed=true
      break
      ;;
  esac
done

if [ "$firmware_source_changed" != "true" ]; then
  echo "No Attractap firmware source changes detected."
  exit 0
fi

if git diff --unified=0 "${BASE}...HEAD" -- "$VERSION_FILE" | grep -E '^[+-][0-9]' >/dev/null; then
  echo "Attractap firmware source changed and the firmware version was updated."
  exit 0
fi

echo "Attractap firmware source changed, but ${VERSION_FILE} was not updated." >&2
echo "Please bump the version in ${VERSION_FILE} when changing firmware source code." >&2
echo "Changed firmware files:" >&2
for file in "${changed_files[@]}"; do
  case "$file" in
    apps/attractap/firmware/README.md)
      ;;
    apps/attractap/firmware/*)
      echo "  - $file" >&2
      ;;
  esac
done
exit 1
