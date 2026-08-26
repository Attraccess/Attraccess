#!/usr/bin/env bash
# Verifies WiFi diagnostic paths remain above the production serial log level.
set -euo pipefail

REPO_ROOT="$(git rev-parse --show-toplevel)"
WIFI_CPP="$REPO_ROOT/apps/attractap/firmware/src/network/wifi/wifi.cpp"

assert_contains() {
  local pattern="$1"

  if ! rg -q --multiline "$pattern" "$WIFI_CPP"; then
    printf 'Expected WiFi diagnostic pattern was not found: %s\n' "$pattern" >&2
    exit 1
  fi
}

# ESP-IDF idle scan messages are emitted under this tag, independently of the
# firmware Logger used for the serial diagnostics below.
assert_contains 'esp_log_level_set\("wifi", ESP_LOG_WARN\)'

# Authentication failures and unavailable access points both reach the station
# disconnect event. DHCP failures have their own timeout path.
assert_contains 'WIFI_REASON_NO_AP_FOUND'
assert_contains 'WIFI_REASON_AUTH_FAIL'
assert_contains 'WIFI_EVENT_STA_DISCONNECTED:[\s\S]*?logger\.errorf\("Disconnected: reason %u \(%s\)"'
assert_contains 'logger\.error\("DHCP timeout - no IP acquired, forcing reconnect"\)'

printf '✓ Attractap WiFi idle log suppression retains failure diagnostics\n'
