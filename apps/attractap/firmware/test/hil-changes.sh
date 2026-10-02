#!/usr/bin/env bash
set -euo pipefail
# Capture diff before evaluating paths: process substitution loses its exit code.
paths=$(git diff --name-only "${1:?Base SHA is required}" HEAD)
changed=false
while IFS= read -r path; do
  case "$path" in
    apps/attractap/firmware/*|.github/workflows/pull-requests.yml|.github/actions/esp-idf-toolchain/*|.github/actions/setup/*|pnpm-lock.yaml|package.json) changed=true ;;
  esac
done <<< "$paths"
printf '%s\n' "$changed"
