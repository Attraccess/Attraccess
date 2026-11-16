#!/usr/bin/env bash
# Hardware-in-the-loop tests: real reader firmware against the NFC card emulator.
#
#   pnpm nx run attractap-lab:hil [-- PYTEST_ARGS]
#
# Off the readers' LAN (CI), set API_RELAY_SSH (e.g. labgrid@lab-host),
# API_RELAY_HOST (lab host address on the readers' LAN) and API_RELAY_PORT
# (one of the lab host's relay ports, NixOS option readerApiRelay.ports): an SSH
# reverse tunnel on the lab host then carries the readers' API traffic. Runs on
# different places in parallel need different ports.
#
# Builds both firmware images (unless READER_IMAGE / EMULATOR_IMAGE are set;
# the reader image for READER_VARIANT, by default the place name without its
# -<n> suffix), starts an API with a throwaway database (waiting up to
# API_START_TIMEOUT seconds, default 600), and runs pytest inside one labgrid
# session on LG_PLACE_NAME. Needs ESP-IDF (source export.sh) for the builds,
# the labgrid client environment (LAB_PYTHON: labgrid fork + pytest) and a lab
# host with readerWifi enabled. Artifacts land in apps/attractap-lab/hil-artifacts.
#
# The API runs with the real-cards/wiretap.cjs preload (NODE_OPTIONS); WIRETAP_FILE
# (hil-artifacts/wiretap.jsonl, started fresh per run) holds the plaintext reader conversation
# the wire fixture reads. It records card APDUs in full: lab evidence only, never commit it.
#
# READER_PROFILE=secure-lab runs on the Secure Boot lab reader (default place
# attractap-touch-v2-secure-1; README "Secure lab reader"): the reader image is
# built with -DATTRACTAP_SECURE_PROFILE=ON -DATTRACTAP_SECURE_LAB=ON, signed with
# the lab key into Intel HEX, and written encrypted. READER_SECURE_BUILD=<dir>
# reuses a lab secure build directory. The place's `profile` tag must match.
#
# Update-over-Wi-Fi tests (test_ota.py): after the reader build, the same build
# directory is built again with -DATTRACTAP_VERSION_OVERRIDE=<version>-hilota and its
# app image is what the API offers; the API runs with
# ATTRACTAP_FIRMWARE_ASSETS_DIR pointing at a scratch directory the tests write to.
# With a prebuilt READER_IMAGE the tests skip unless READER_OTA_IMAGE (an app image),
# READER_OTA_VERSION and READER_BASE_VERSION are set too. NO_OTA_BUILD=1 skips the
# second build (the OTA tests then skip).
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Second stage, run by labgrid-client inside the session: holding the place
# also serializes runs that relay through the same lab host port.
if [[ "${1:-}" == --in-session ]]; then
  shift
  relay_pid=
  if [[ -n "${API_RELAY_SSH:-}" ]]; then
    ssh -N -o ExitOnForwardFailure=yes -o ServerAliveInterval=15 \
      -R "0.0.0.0:$READER_API_PORT:127.0.0.1:$API_PORT" "$API_RELAY_SSH" &
    relay_pid=$!
    sleep 3
    kill -0 "$relay_pid" 2>/dev/null || { echo "API relay through $API_RELAY_SSH failed" >&2; exit 1; }
  fi
  status=0
  "$LAB_PYTHON" -m pytest "$HERE" -p no:cacheprovider -v "$@" || status=$?
  [[ -z "$relay_pid" ]] || kill "$relay_pid" 2>/dev/null || true
  exit "$status"
fi

ROOT="$(cd "$HERE/../../.." && pwd)"
fail() { echo "$*" >&2; exit 1; }
READER_PROFILE="${READER_PROFILE:-plain}"
case "$READER_PROFILE" in
  plain)
    PLACE="${LG_PLACE_NAME:-attractap-touch-v2-1}"
    # Places are named <firmware variant>-<n>.
    VARIANT="${READER_VARIANT:-${PLACE%-*}}"
    ;;
  secure-lab)
    PLACE="${LG_PLACE_NAME:-attractap-touch-v2-secure-1}"
    VARIANT="${READER_VARIANT:-attractap-touch-v2}"
    [[ -z "${READER_IMAGE:-}" ]] ||
      fail "READER_PROFILE=secure-lab builds its own signed image; set READER_SECURE_BUILD to reuse a lab secure build directory"
    if [[ -n "${READER_SECURE_BUILD:-}" && "$READER_SECURE_BUILD" != /* ]]; then
      READER_SECURE_BUILD="$PWD/$READER_SECURE_BUILD"
    fi
    ;;
  *) fail "READER_PROFILE must be plain or secure-lab" ;;
esac
COORDINATOR="${LG_COORDINATOR:-attractap-lab:20408}"
WORK="$(mktemp -d "${TMPDIR:-/tmp}/attractap-hil.XXXXXX")"

# The labgrid client's own interpreter: the pip labgrid lacks our fork's fixes.
if [[ -z "${LAB_PYTHON:-}" ]]; then
  client="$(command -v labgrid-client)"
  target="$(grep -ao '"/[^"]*/bin/labgrid-client"' "$(readlink -f "$client")" | tr -d '"' | head -1 || true)"
  LAB_PYTHON="$(dirname "${target:-$client}")/python3"
fi
"$LAB_PYTHON" -c 'import labgrid, pytest' || {
  echo "LAB_PYTHON=$LAB_PYTHON needs labgrid and pytest" >&2; exit 1; }

# A plain image leaves a Secure Boot reader unbootable, and the secure-lab write
# needs a lab reader: the place's `profile` tag (plain if it has none) must match.
place="$(labgrid-client -x "$COORDINATOR" -p "$PLACE" show)" || fail "Cannot read place $PLACE from $COORDINATOR"
place_profile="$(sed -n 's/^ *tags:.*[ ,]profile=\([a-z-]*\).*/\1/p' <<<"$place" | head -1)"
[[ "${place_profile:-plain}" == "$READER_PROFILE" ]] ||
  fail "$PLACE is a ${place_profile:-plain} reader, but READER_PROFILE=$READER_PROFILE"

require_idf() {
  command -v idf.py >/dev/null || { echo "Source ESP-IDF export.sh first (or set READER_IMAGE/EMULATOR_IMAGE)" >&2; exit 1; }
}

# The second build of the reader's build directory: same sources, another version
# string, so the reader can update from the base image to this one.
READER_BASE_VERSION="${READER_BASE_VERSION:-$(head -n1 "$ROOT/apps/attractap/firmware/version.txt" 2>/dev/null || true)}"
READER_OTA_VERSION="${READER_OTA_VERSION:-$READER_BASE_VERSION-hilota}"
build_ota_image() { # build directory, extra CMake arguments...
  [[ "${NO_OTA_BUILD:-}" != 1 ]] || return 0
  local directory="$1"; shift
  (cd "$ROOT/apps/attractap/firmware" &&
    idf.py -B "$directory" -DSDKCONFIG="$directory/sdkconfig" -DATTRACTAP_VARIANT="$VARIANT" \
      -DATTRACTAP_LOG_LEVEL=DEBUG -DATTRACTAP_TEST_HOOKS=ON -DATTRACTAP_BEEPER_DEFAULT=OFF \
      -DATTRACTAP_VERSION_OVERRIDE="$READER_OTA_VERSION" "$@" ${READER_CMAKE_ARGS:-} build >"$WORK/ota-build.log")
  cp "$directory/attractap.bin" "$WORK/ota-app.bin"
  READER_OTA_IMAGE="$WORK/ota-app.bin"
}

if [[ "$READER_PROFILE" == secure-lab ]]; then
  require_idf
  firmware="$ROOT/apps/attractap/firmware"
  if [[ -z "${READER_SECURE_BUILD:-}" ]]; then
    READER_SECURE_BUILD="$firmware/build/hil-$VARIANT-secure-lab"
    (cd "$firmware" && python3 tools/build_individual_ca_certs.py >/dev/null &&
      idf.py -B "$READER_SECURE_BUILD" -DSDKCONFIG="$READER_SECURE_BUILD/sdkconfig" -DATTRACTAP_VARIANT="$VARIANT" \
        -DATTRACTAP_LOG_LEVEL=DEBUG -DATTRACTAP_TEST_HOOKS=ON -DATTRACTAP_BEEPER_DEFAULT=OFF \
        -DATTRACTAP_VERSION_OVERRIDE= \
        -DATTRACTAP_SECURE_PROFILE=ON -DATTRACTAP_SECURE_LAB=ON ${READER_CMAKE_ARGS:-} build >"$WORK/reader-build.log")
    built_here=1
  fi
  # Refuses anything but a lab secure build (a release-mode image would switch the reader to release mode for good).
  python3 "$firmware/tools/secure_lab_reader.py" hex --build-dir "$READER_SECURE_BUILD" --output "$WORK/reader.hex" \
    >"$WORK/reader-sign.log"
  READER_IMAGE="$WORK/reader.hex"
  [[ -z "${built_here:-}" ]] || build_ota_image "$READER_SECURE_BUILD" -DATTRACTAP_SECURE_PROFILE=ON -DATTRACTAP_SECURE_LAB=ON
elif [[ -z "${READER_IMAGE:-}" ]]; then
  require_idf
  firmware="$ROOT/apps/attractap/firmware"
  build="$firmware/build/hil-$VARIANT"
  (cd "$firmware" && python3 tools/build_individual_ca_certs.py >/dev/null &&
    idf.py -B "$build" -DSDKCONFIG="$build/sdkconfig" -DATTRACTAP_VARIANT="$VARIANT" \
      -DATTRACTAP_LOG_LEVEL=DEBUG -DATTRACTAP_TEST_HOOKS=ON -DATTRACTAP_BEEPER_DEFAULT=OFF \
      -DATTRACTAP_VERSION_OVERRIDE= ${READER_CMAKE_ARGS:-} build >"$WORK/reader-build.log")
  (cd "$build" && esptool --chip esp32s3 merge-bin -o "$WORK/reader.bin" @flash_args >/dev/null)
  READER_IMAGE="$WORK/reader.bin"
  build_ota_image "$build"
fi
if [[ -z "${EMULATOR_IMAGE:-}" ]]; then
  require_idf
  emulator="$ROOT/apps/attractap/nfc-emulator"
  (cd "$emulator" && ./scripts/idf.sh build >"$WORK/emulator-build.log")
  (cd "$emulator/build" && esptool --chip esp32s3 merge-bin -o "$WORK/emulator.bin" @flash_args >/dev/null)
  EMULATOR_IMAGE="$WORK/emulator.bin"
fi

API_PORT="${API_PORT:-$(python3 -c 'import socket; s=socket.socket(); s.bind(("", 0)); print(s.getsockname()[1])')}"
export STORAGE_ROOT="$WORK/storage"
ARTIFACTS="$(cd "$HERE/.." && pwd)/hil-artifacts"
mkdir -p "$ARTIFACTS"
export WIRETAP_FILE="$ARTIFACTS/wiretap.jsonl"
: >"$WIRETAP_FILE"
WIRETAP_PRELOAD="$(cd "$HERE/../real-cards" && pwd)/wiretap.cjs"
# The update tests offer lab images through this directory (see test_ota.py).
export ATTRACTAP_FIRMWARE_ASSETS_DIR="$WORK/firmwares"
mkdir -p "$ATTRACTAP_FIRMWARE_ASSETS_DIR"
echo '{"firmwares":[]}' >"$ATTRACTAP_FIRMWARE_ASSETS_DIR/firmwares.json"
# Own process group, so the trap stops pnpm and the API it spawned. NODE_OPTIONS reaches the API
# process through pnpm serve and nx (the preload also loads, harmlessly, into those tools).
set -m
(cd "$ROOT" && PORT="$API_PORT" NODE_OPTIONS="--require $WIRETAP_PRELOAD" \
  exec pnpm serve --only=api >"$WORK/api.log" 2>&1) &
api_pid=$!
set +m
trap 'kill -- "-$api_pid" 2>/dev/null || true' EXIT
api_deadline=$((SECONDS + ${API_START_TIMEOUT:-600}))
until curl -sf -o /dev/null "http://127.0.0.1:$API_PORT/api/info"; do
  kill -0 "$api_pid" 2>/dev/null || { cat "$WORK/api.log" >&2; exit 1; }
  if ((SECONDS > api_deadline)); then
    cat "$WORK/api.log" >&2
    echo "API did not start within ${API_START_TIMEOUT:-600}s (set API_START_TIMEOUT)" >&2
    exit 1
  fi
  sleep 2
done
READER_API_PORT="$API_PORT"
if [[ -n "${API_RELAY_SSH:-}" ]]; then
  : "${API_RELAY_HOST:?set API_RELAY_HOST to the lab host address on the reader network}"
  API_HOST="$API_RELAY_HOST"
  READER_API_PORT="${API_RELAY_PORT:-20480}"
fi
(cd "$ROOT" && pnpm seed:dev -- --username admin --password password --allow-external-db >"$WORK/seed.log" 2>&1)

cd "$ARTIFACTS"
GRPC_ENABLE_FORK_SUPPORT=0 PYTHONPATH="$HERE/../src:$HERE" LAB_PYTHON="$LAB_PYTHON" \
  READER_OTA_IMAGE="${READER_OTA_IMAGE:-}" READER_BASE_VERSION="$READER_BASE_VERSION" READER_OTA_VERSION="$READER_OTA_VERSION" \
  OTA_ASSETS_DIR="$ATTRACTAP_FIRMWARE_ASSETS_DIR" \
  READER_IMAGE="$READER_IMAGE" READER_VARIANT="$VARIANT" READER_PROFILE="$READER_PROFILE" EMULATOR_IMAGE="$EMULATOR_IMAGE" \
  API_URL="http://127.0.0.1:$API_PORT" API_DB="$STORAGE_ROOT/attraccess.sqlite" \
  API_HOST="${API_HOST:-}" API_PORT="$API_PORT" READER_API_PORT="$READER_API_PORT" \
  API_RELAY_SSH="${API_RELAY_SSH:-}" WIRETAP_FILE="$WIRETAP_FILE" \
  labgrid-client -x "$COORDINATOR" -p "$PLACE" session \
    --purpose "${HIL_PURPOSE:-Attractap HIL: NFC emulator tests}" --wait-timeout "${HIL_WAIT_TIMEOUT:-1800}" -- \
    bash "$HERE/run.sh" --in-session "$@"
