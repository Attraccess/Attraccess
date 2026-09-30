#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
mkdir -p test-results
# Remove old evidence before any preflight can fail on a persistent runner.
rm -f test-results/hil.xml test-results/serial.log test-results/serial-bridge.log
: "${ATTRACTAP_SERIAL_PORT:?Set the dedicated device USB serial path}"
: "${HIL_HOST:?Set the runner LAN address reachable by the device (not localhost)}"
: "${HIL_VARIANT:?Set the hardware variant}"
case "$HIL_VARIANT" in
  attractap-touch|attractap-touch-v2) : "${HIL_WIFI_SSID:?Set the lab AP SSID}" ;;
  attractap-touch-ethernet|attractap-lite-ethernet) ;;
  *) printf 'Unsupported HIL variant: %s\n' "$HIL_VARIANT" >&2; exit 1 ;;
esac
if [[ ! -e "$ATTRACTAP_SERIAL_PORT" ]]; then
  printf 'Hardware acceptance unverified: device unavailable at %s\n' "$ATTRACTAP_SERIAL_PORT" >&2
  exit 1
fi
command -v idf.py >/dev/null
python -c 'import serial, esptool'
# Each device has exactly one runner service (plus its physical variant label).
# Fresh output cannot be confused with artifacts left by a previous runner job.
python tools/build_individual_ca_certs.py
version=$(tr -d '\r\n' < version.txt)
idf.py -B "build/hil-$HIL_VARIANT" -DATTRACTAP_VARIANT="$HIL_VARIANT" \
  -DATTRACTAP_HIL=ON -DATTRACTAP_HIL_VERSION="$version-hil-base" reconfigure build
idf.py -B "build/hil-ota-$HIL_VARIANT" -DATTRACTAP_VARIANT="$HIL_VARIANT" \
  -DATTRACTAP_HIL=ON -DATTRACTAP_HIL_VERSION="$version-hil-ota" reconfigure build
python -m esptool --chip esp32s3 --port "$ATTRACTAP_SERIAL_PORT" erase-flash
idf.py -B "build/hil-$HIL_VARIANT" -p "$ATTRACTAP_SERIAL_PORT" flash
export HIL_OTA_BIN="$PWD/build/hil-ota-$HIL_VARIANT/attractap.bin"
export HIL_OTA_VERSION="$version-hil-ota"
pnpm --dir ../../.. exec vitest run --root "$PWD" --config "$PWD/test/vitest.hil.config.ts"
