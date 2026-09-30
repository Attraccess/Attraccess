#!/usr/bin/env bash
# Tests for scripts/check-attractap-firmware-version.sh.

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SCRIPT="$REPO_ROOT/scripts/check-attractap-firmware-version.sh"

failures=0
fail() {
  echo "  ✗ $1"
  failures=$((failures + 1))
}
pass() { echo "  ✓ $1"; }

make_repo() {
  local dir="$1"
  mkdir -p "$dir/apps/attractap/firmware/src" "$dir/apps/frontend"
  echo '1.3.24' >"$dir/apps/attractap/firmware/version.txt"
  echo '# build config' >"$dir/apps/attractap/firmware/sdkconfig.defaults"
  echo 'void setup() {}' >"$dir/apps/attractap/firmware/src/main.cpp"
  echo 'frontend' >"$dir/apps/frontend/README.md"
  git -C "$dir" init --quiet
  git -C "$dir" config user.email test@example.com
  git -C "$dir" config user.name Test
  git -C "$dir" add .
  git -C "$dir" commit --quiet -m baseline
}

run_check() {
  local repo="$1"
  local base="$2"
  (cd "$repo" && "$SCRIPT" "$base")
}

echo "case: firmware source changed without version bump -> fail"
TMP="$(mktemp -d)"
make_repo "$TMP"
BASE="$(git -C "$TMP" rev-parse HEAD)"
echo 'void loop() {}' >>"$TMP/apps/attractap/firmware/src/main.cpp"
git -C "$TMP" add .
git -C "$TMP" commit --quiet -m 'change firmware source'
if run_check "$TMP" "$BASE" >/dev/null 2>&1; then
  fail "expected non-zero exit when firmware source changed without FIRMWARE_VERSION change"
else
  pass "fails when firmware source changed without FIRMWARE_VERSION change"
fi
rm -rf "$TMP"

echo "case: firmware config changed without version bump -> fail"
TMP="$(mktemp -d)"
make_repo "$TMP"
BASE="$(git -C "$TMP" rev-parse HEAD)"
echo 'CONFIG_EXAMPLE=y' >>"$TMP/apps/attractap/firmware/sdkconfig.defaults"
git -C "$TMP" add .
git -C "$TMP" commit --quiet -m 'change firmware config'
if run_check "$TMP" "$BASE" >/dev/null 2>&1; then
  fail "expected non-zero exit when firmware config changed without FIRMWARE_VERSION change"
else
  pass "fails when firmware config changed without FIRMWARE_VERSION change"
fi
rm -rf "$TMP"

echo "case: firmware source changed with version bump -> pass"
TMP="$(mktemp -d)"
make_repo "$TMP"
BASE="$(git -C "$TMP" rev-parse HEAD)"
echo 'void loop() {}' >>"$TMP/apps/attractap/firmware/src/main.cpp"
echo '1.3.25' >"$TMP/apps/attractap/firmware/version.txt"
git -C "$TMP" add .
git -C "$TMP" commit --quiet -m 'change firmware source and version'
if run_check "$TMP" "$BASE" >/dev/null 2>&1; then
  pass "passes when firmware source changed with FIRMWARE_VERSION change"
else
  fail "expected zero exit when firmware source changed with FIRMWARE_VERSION change"
fi
rm -rf "$TMP"

echo "case: non-firmware change -> pass"
TMP="$(mktemp -d)"
make_repo "$TMP"
BASE="$(git -C "$TMP" rev-parse HEAD)"
echo 'copy change' >>"$TMP/apps/frontend/README.md"
git -C "$TMP" add .
git -C "$TMP" commit --quiet -m 'change frontend docs'
if run_check "$TMP" "$BASE" >/dev/null 2>&1; then
  pass "passes when no firmware source changed"
else
  fail "expected zero exit when no firmware source changed"
fi
rm -rf "$TMP"

echo "case: firmware documentation change -> pass"
TMP="$(mktemp -d)"
make_repo "$TMP"
BASE="$(git -C "$TMP" rev-parse HEAD)"
echo 'firmware documentation' >"$TMP/apps/attractap/firmware/README.md"
git -C "$TMP" add .
git -C "$TMP" commit --quiet -m 'change firmware documentation'
if run_check "$TMP" "$BASE" >/dev/null 2>&1; then
  pass "passes when only firmware documentation changes"
else
  fail "expected zero exit when only firmware documentation changes"
fi
rm -rf "$TMP"

if [ "$failures" -gt 0 ]; then
  echo "✗ $failures assertion(s) failed"
  exit 1
fi
echo "✓ all attractap firmware version check assertions passed"
