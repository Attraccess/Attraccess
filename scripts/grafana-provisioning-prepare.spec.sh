#!/usr/bin/env bash
# Test for monitoring/grafana/prepare-provisioning.sh.
#
# The prepare script makes the Pushover alerting contact point opt-in: it strips
# the secret-requiring alerting files (contactpoints.yaml + policies.yaml) from a
# provisioning directory when the PUSHOVER_* env vars are not fully set, so
# Grafana does not refuse to start (ATT-539). When both secrets are present the
# files are kept so Pushover alerting is provisioned.
#
# Designed to run on CI (GitHub Actions, ubuntu-latest) with no Docker needed.

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SCRIPT="$REPO_ROOT/monitoring/grafana/prepare-provisioning.sh"

failures=0
fail() {
  echo "  ✗ $1"
  failures=$((failures + 1))
}
pass() { echo "  ✓ $1"; }

# Build a throwaway provisioning dir mirroring the real layout.
make_provisioning() {
  local dir="$1"
  mkdir -p "$dir/alerting" "$dir/datasources" "$dir/dashboards"
  echo 'contactPoints: []' >"$dir/alerting/contactpoints.yaml"
  echo 'policies: []' >"$dir/alerting/policies.yaml"
  echo 'groups: []' >"$dir/alerting/rules.yaml"
  echo 'datasources: []' >"$dir/datasources/prometheus.yml"
  echo 'providers: []' >"$dir/dashboards/dashboards.yml"
}

assert_absent() {
  if [ -e "$1" ]; then fail "$2 (expected $1 to be removed)"; else pass "$2"; fi
}
assert_present() {
  if [ -e "$1" ]; then pass "$2"; else fail "$2 (expected $1 to exist)"; fi
}

if [ ! -x "$SCRIPT" ]; then
  echo "✗ prepare script not found or not executable: $SCRIPT"
  exit 1
fi

echo "case: both PUSHOVER secrets unset -> strip pushover files"
TMP="$(mktemp -d)"
make_provisioning "$TMP"
( unset PUSHOVER_API_TOKEN PUSHOVER_USER_KEY; "$SCRIPT" "$TMP" )
assert_absent  "$TMP/alerting/contactpoints.yaml" "contactpoints.yaml stripped"
assert_absent  "$TMP/alerting/policies.yaml"      "policies.yaml stripped"
assert_present "$TMP/alerting/rules.yaml"          "rules.yaml kept"
assert_present "$TMP/datasources/prometheus.yml"   "datasources kept"
rm -rf "$TMP"

echo "case: only one secret set -> still strip (both required)"
TMP="$(mktemp -d)"
make_provisioning "$TMP"
PUSHOVER_API_TOKEN="token-only" PUSHOVER_USER_KEY="" "$SCRIPT" "$TMP"
assert_absent "$TMP/alerting/contactpoints.yaml" "contactpoints.yaml stripped (partial env)"
assert_absent "$TMP/alerting/policies.yaml"      "policies.yaml stripped (partial env)"
rm -rf "$TMP"

echo "case: both PUSHOVER secrets set -> keep pushover files"
TMP="$(mktemp -d)"
make_provisioning "$TMP"
PUSHOVER_API_TOKEN="real-token" PUSHOVER_USER_KEY="real-user-key" "$SCRIPT" "$TMP"
assert_present "$TMP/alerting/contactpoints.yaml" "contactpoints.yaml kept"
assert_present "$TMP/alerting/policies.yaml"      "policies.yaml kept"
rm -rf "$TMP"

echo "case: idempotent when files already absent"
TMP="$(mktemp -d)"
mkdir -p "$TMP/alerting"
echo 'groups: []' >"$TMP/alerting/rules.yaml"
( unset PUSHOVER_API_TOKEN PUSHOVER_USER_KEY; "$SCRIPT" "$TMP" )
assert_present "$TMP/alerting/rules.yaml" "rules.yaml kept when pushover files absent"
rm -rf "$TMP"

echo "case: missing provisioning dir -> fail fast"
TMP="$(mktemp -d)"; rmdir "$TMP"
if "$SCRIPT" "$TMP" 2>/dev/null; then fail "expected non-zero exit for missing provisioning dir"; else pass "exits non-zero for missing provisioning dir"; fi

echo "case: missing alerting dir -> fail fast"
TMP="$(mktemp -d)"
if "$SCRIPT" "$TMP" 2>/dev/null; then fail "expected non-zero exit for missing alerting dir"; else pass "exits non-zero for missing alerting dir"; fi
rm -rf "$TMP"

if [ "$failures" -gt 0 ]; then
  echo "✗ $failures assertion(s) failed"
  exit 1
fi
echo "✓ all prepare-provisioning assertions passed"
