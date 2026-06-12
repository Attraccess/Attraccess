#!/usr/bin/env bash
# Test for monitoring/grafana/sync-managed-files.sh.
#
# Verifies that the sync removes stale managed files from volumes and writes
# Grafana alerting deleteRules for provisioned Attraccess alert rules that were
# removed from the current bundle.

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SCRIPT="$REPO_ROOT/monitoring/grafana/sync-managed-files.sh"

failures=0
fail() {
  echo "  ✗ $1"
  failures=$((failures + 1))
}
pass() { echo "  ✓ $1"; }

assert_present() {
  if [ -e "$1" ]; then pass "$2"; else fail "$2 (expected $1 to exist)"; fi
}

assert_absent() {
  if [ -e "$1" ]; then fail "$2 (expected $1 to be removed)"; else pass "$2"; fi
}

assert_contains() {
  if grep -Fq "$2" "$1"; then pass "$3"; else fail "$3 (expected $1 to contain $2)"; fi
}

assert_not_contains() {
  if grep -Fq "$2" "$1"; then fail "$3 (expected $1 not to contain $2)"; else pass "$3"; fi
}

if [ ! -x "$SCRIPT" ]; then
  echo "✗ sync script not found or not executable: $SCRIPT"
  exit 1
fi

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

SRC_PROV="$TMP/src-provisioning"
DST_PROV="$TMP/dst-provisioning"
SRC_DASH="$TMP/src-dashboards"
DST_DASH="$TMP/dst-dashboards"

mkdir -p "$SRC_PROV/alerting" "$SRC_PROV/datasources" "$SRC_PROV/dashboards" "$DST_PROV/alerting" "$DST_PROV/datasources" "$DST_PROV/dashboards"
mkdir -p "$SRC_DASH" "$DST_DASH"

cat >"$DST_PROV/alerting/rules.yaml" <<'YAML'
apiVersion: 1
groups:
  - orgId: 1
    name: attraccess
    rules:
      - uid: kept-rule
        title: KeptRule
      - uid: removed-rule
        title: RemovedRule
YAML
echo "old datasource" >"$DST_PROV/datasources/old.yml"
echo "old provider" >"$DST_PROV/dashboards/old.yml"
echo "{}" >"$DST_DASH/old-dashboard.json"

cat >"$SRC_PROV/alerting/rules.yaml" <<'YAML'
apiVersion: 1
groups:
  - orgId: 1
    name: attraccess
    rules:
      - uid: kept-rule
        title: KeptRule
      - uid: added-rule
        title: AddedRule
YAML
echo "new datasource" >"$SRC_PROV/datasources/prometheus.yml"
echo "new provider" >"$SRC_PROV/dashboards/dashboards.yml"
echo "{}" >"$SRC_DASH/current-dashboard.json"

"$SCRIPT" "$SRC_PROV" "$DST_PROV" "$SRC_DASH" "$DST_DASH"

assert_present "$DST_PROV/alerting/rules.yaml" "current rules copied"
assert_present "$DST_PROV/datasources/prometheus.yml" "current datasource copied"
assert_absent "$DST_PROV/datasources/old.yml" "stale provisioning file removed"
assert_present "$DST_DASH/current-dashboard.json" "current dashboard copied"
assert_absent "$DST_DASH/old-dashboard.json" "stale dashboard removed"

DELETE_FILE="$DST_PROV/alerting/delete-orphaned-rules.yaml"
assert_present "$DELETE_FILE" "orphan deleteRules file written"
assert_contains "$DELETE_FILE" "uid: 'removed-rule'" "removed rule marked for deletion"
assert_not_contains "$DELETE_FILE" "uid: 'kept-rule'" "kept rule not marked for deletion"
assert_not_contains "$DELETE_FILE" "uid: 'added-rule'" "new rule not marked for deletion"

if [ "$failures" -gt 0 ]; then
  echo "✗ $failures assertion(s) failed"
  exit 1
fi
echo "✓ all sync-managed-files assertions passed"
