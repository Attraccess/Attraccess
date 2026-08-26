#!/usr/bin/env bash
# Verifies serial captures from the WiFi fault-injection matrix.
set -euo pipefail

if [ "$#" -ne 4 ]; then
  printf 'Usage: %s <auth-failure.log> <ap-not-found.log> <dhcp-timeout.log> <idle.log>\n' "$0" >&2
  exit 2
fi

assert_contains() {
  local file="$1"
  local pattern="$2"

  if ! rg -q --multiline "$pattern" "$file"; then
    printf 'Expected serial diagnostic was not found in %s: %s\n' "$file" "$pattern" >&2
    exit 1
  fi
}

assert_absent() {
  local file="$1"
  local pattern="$2"

  if rg -q --multiline "$pattern" "$file"; then
    printf 'Unexpected serial output was found in %s: %s\n' "$file" "$pattern" >&2
    exit 1
  fi
}

assert_contains "$1" '\[WiFi\] ERROR: Disconnected: reason .*\(AUTH_FAIL\)'
assert_contains "$2" '\[WiFi\] ERROR: Disconnected: reason .*\(NO_AP_FOUND\)'
assert_contains "$3" '\[WiFi\] ERROR: DHCP timeout - no IP acquired, forcing reconnect'
assert_absent "$4" "Haven't to connect to a suitable AP now!"

printf 'Attractap WiFi serial captures verified\n'
