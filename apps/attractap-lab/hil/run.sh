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
PLACE="${LG_PLACE_NAME:-attractap-touch-v2-1}"
# Places are named <firmware variant>-<n>.
VARIANT="${READER_VARIANT:-${PLACE%-*}}"
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

require_idf() {
  command -v idf.py >/dev/null || { echo "Source ESP-IDF export.sh first (or set READER_IMAGE/EMULATOR_IMAGE)" >&2; exit 1; }
}

if [[ -z "${READER_IMAGE:-}" ]]; then
  require_idf
  firmware="$ROOT/apps/attractap/firmware"
  build="$firmware/build/hil-$VARIANT"
  (cd "$firmware" && python3 tools/build_individual_ca_certs.py >/dev/null &&
    idf.py -B "$build" -DSDKCONFIG="$build/sdkconfig" -DATTRACTAP_VARIANT="$VARIANT" \
      -DATTRACTAP_LOG_LEVEL=DEBUG -DATTRACTAP_TEST_HOOKS=ON -DATTRACTAP_BEEPER_DEFAULT=OFF \
      ${READER_CMAKE_ARGS:-} build >"$WORK/reader-build.log")
  (cd "$build" && esptool --chip esp32s3 merge-bin -o "$WORK/reader.bin" @flash_args >/dev/null)
  READER_IMAGE="$WORK/reader.bin"
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
# Own process group, so the trap stops pnpm and the API it spawned.
set -m
(cd "$ROOT" && PORT="$API_PORT" exec pnpm serve --only=api >"$WORK/api.log" 2>&1) &
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

mkdir -p "$HERE/../hil-artifacts"
cd "$HERE/../hil-artifacts"
GRPC_ENABLE_FORK_SUPPORT=0 PYTHONPATH="$HERE/../src:$HERE" LAB_PYTHON="$LAB_PYTHON" \
  READER_IMAGE="$READER_IMAGE" EMULATOR_IMAGE="$EMULATOR_IMAGE" \
  API_URL="http://127.0.0.1:$API_PORT" API_DB="$STORAGE_ROOT/attraccess.sqlite" \
  API_HOST="${API_HOST:-}" API_PORT="$API_PORT" READER_API_PORT="$READER_API_PORT" \
  API_RELAY_SSH="${API_RELAY_SSH:-}" \
  labgrid-client -x "$COORDINATOR" -p "$PLACE" session \
    --purpose "${HIL_PURPOSE:-Attractap HIL: NFC emulator tests}" --wait-timeout "${HIL_WAIT_TIMEOUT:-1800}" -- \
    bash "$HERE/run.sh" --in-session "$@"
