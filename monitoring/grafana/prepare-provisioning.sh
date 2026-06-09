#!/bin/sh
# Make the Pushover alerting integration opt-in (ATT-539).
#
# The contact point in alerting/contactpoints.yaml reads its secrets from the
# grafana container environment ($__env{PUSHOVER_API_TOKEN/PUSHOVER_USER_KEY}).
# Grafana validates contact points at provisioning time and exits the whole
# process if a required secret (e.g. the Pushover user key) is empty — so an
# unconfigured deployment crashes Grafana on startup.
#
# This script runs against a *writable* copy of the provisioning directory
# before Grafana reads it. When either secret is missing it removes the
# secret-requiring alerting files so Grafana starts cleanly with its built-in
# default contact point and policy. The alert rules (rules.yaml) are kept
# either way; with no custom policy they route to the default policy.
#
# Usage: prepare-provisioning.sh <provisioning-dir>
set -eu

PROVISIONING_DIR="${1:-/etc/grafana/provisioning}"
ALERTING_DIR="$PROVISIONING_DIR/alerting"

# Fail fast on a misconfigured mount/path instead of silently no-op'ing the rm.
if [ ! -d "$PROVISIONING_DIR" ]; then
  echo "[grafana-prepare] ERROR: provisioning dir not found: $PROVISIONING_DIR" >&2
  exit 1
fi
if [ ! -d "$ALERTING_DIR" ]; then
  echo "[grafana-prepare] ERROR: alerting dir not found: $ALERTING_DIR" >&2
  exit 1
fi

if [ -n "${PUSHOVER_API_TOKEN:-}" ] && [ -n "${PUSHOVER_USER_KEY:-}" ]; then
  echo "[grafana-prepare] PUSHOVER_API_TOKEN and PUSHOVER_USER_KEY set — provisioning Pushover alerting"
else
  echo "[grafana-prepare] PUSHOVER_API_TOKEN/PUSHOVER_USER_KEY not fully set — skipping Pushover alerting provisioning"
  rm -f "$ALERTING_DIR/contactpoints.yaml" "$ALERTING_DIR/policies.yaml"
fi
