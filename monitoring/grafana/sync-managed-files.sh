#!/bin/sh
# Sync Attraccess-managed Grafana provisioning/dashboard files into writable
# volumes. Unlike `cp -rT`, this removes files that disappeared from the source
# bundle. For alert rules, it also emits Grafana `deleteRules` entries for
# previously provisioned Attraccess rules that are no longer present.
set -eu

SRC_PROVISIONING="${1:?source provisioning dir required}"
DST_PROVISIONING="${2:?destination provisioning dir required}"
SRC_DASHBOARDS="${3:-}"
DST_DASHBOARDS="${4:-}"

empty_dir() {
  dir="$1"
  mkdir -p "$dir"
  rm -rf "$dir"/* "$dir"/.[!.]* "$dir"/..?* 2>/dev/null || true
}

extract_rule_uids() {
  file="$1"
  if [ -f "$file" ]; then
    awk '
      /^[[:space:]]*-[[:space:]]*uid:[[:space:]]*/ {
        value = $0
        sub(/^[[:space:]]*-[[:space:]]*uid:[[:space:]]*/, "", value)
        gsub(/["'\'']/, "", value)
        gsub(/[[:space:]]+$/, "", value)
        if (value != "") print value
      }
    ' "$file"
  fi
}

OLD_UIDS="$(mktemp)"
NEW_UIDS="$(mktemp)"
ORPHAN_UIDS="$(mktemp)"
trap 'rm -f "$OLD_UIDS" "$NEW_UIDS" "$ORPHAN_UIDS"' EXIT

extract_rule_uids "$DST_PROVISIONING/alerting/rules.yaml" | sort -u >"$OLD_UIDS"
extract_rule_uids "$SRC_PROVISIONING/alerting/rules.yaml" | sort -u >"$NEW_UIDS"
comm -23 "$OLD_UIDS" "$NEW_UIDS" >"$ORPHAN_UIDS"

empty_dir "$DST_PROVISIONING"
cp -R "$SRC_PROVISIONING"/. "$DST_PROVISIONING"/

if [ -s "$ORPHAN_UIDS" ]; then
  DELETE_FILE="$DST_PROVISIONING/alerting/delete-orphaned-rules.yaml"
  mkdir -p "$(dirname "$DELETE_FILE")"
  {
    echo "apiVersion: 1"
    echo "deleteRules:"
    while IFS= read -r uid; do
      [ -n "$uid" ] || continue
      echo "  - orgId: 1"
      echo "    uid: '$uid'"
    done <"$ORPHAN_UIDS"
  } >"$DELETE_FILE"
fi

if [ -n "$SRC_DASHBOARDS" ] && [ -n "$DST_DASHBOARDS" ]; then
  empty_dir "$DST_DASHBOARDS"
  cp -R "$SRC_DASHBOARDS"/. "$DST_DASHBOARDS"/
fi
