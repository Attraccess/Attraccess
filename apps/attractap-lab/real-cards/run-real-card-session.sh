#!/usr/bin/env bash
# One command for the real-card session (see README.md).
#
#   ./run-real-card-session.sh [--emulate] [--cards EV2,EV3,NTAG424] [--speak]
#
# Builds the lab reader firmware (INFO logs, test hooks, beeper off) and starts the API behind the
# wiretap preload and a raw TCP proxy, then claims the place and runs session.py inside one labgrid
# session. With --emulate the NFC emulator (flashed from this checkout) answers instead of real
# cards; everything else is identical. Afterwards the captured conversations are replayed through
# the 1.7.x firmware card code and compared with what the server sent.
#
# Environment: LG_PLACE_NAME (default attractap-touch-v2-1), READER_IMAGE / EMULATOR_IMAGE (skip the
# builds), API_HOST, KEEP_API=1 (leave nothing running regardless), RUN_ROOT (default ./runs).
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$HERE/../../.." && pwd)"
PLACE="${LG_PLACE_NAME:-attractap-touch-v2-1}"
VARIANT="${READER_VARIANT:-${PLACE%-*}}"
COORDINATOR="${LG_COORDINATOR:-attractap-lab:20408}"
STAMP="$(date +%Y%m%d-%H%M%S)"
RUN_DIR="${RUN_ROOT:-$HERE/runs}/$STAMP"
EMULATE=0
for arg in "$@"; do [[ "$arg" == --emulate ]] && EMULATE=1; done
mkdir -p "$RUN_DIR"
RUN_DIR="$(cd "$RUN_DIR" && pwd)"
echo "run folder: $RUN_DIR"

# --- builds -------------------------------------------------------------------------------------
require_idf() {
  if ! command -v idf.py >/dev/null; then
    # shellcheck disable=SC1091
    [[ -f "$ROOT/.tools/esp-idf/export.sh" ]] && . "$ROOT/.tools/esp-idf/export.sh" >/dev/null 2>&1
  fi
  command -v idf.py >/dev/null || { echo "ESP-IDF not found: source its export.sh (or set READER_IMAGE/EMULATOR_IMAGE)" >&2; exit 1; }
}
if [[ -z "${READER_IMAGE:-}" ]]; then
  require_idf
  firmware="$ROOT/apps/attractap/firmware"
  build="$firmware/build/real-cards-$VARIANT"
  echo "building the reader firmware (INFO logs, test hooks, beeper off) ..."
  (cd "$firmware" && python3 tools/build_individual_ca_certs.py >/dev/null &&
    idf.py -B "$build" -DSDKCONFIG="$build/sdkconfig" -DATTRACTAP_VARIANT="$VARIANT" \
      -DATTRACTAP_LOG_LEVEL=INFO -DATTRACTAP_TEST_HOOKS=ON -DATTRACTAP_BEEPER_DEFAULT=OFF build >"$RUN_DIR/reader-build.log" 2>&1)
  (cd "$build" && esptool --chip esp32s3 merge-bin -o "$RUN_DIR/reader.bin" @flash_args >/dev/null)
  READER_IMAGE="$RUN_DIR/reader.bin"
fi
if [[ $EMULATE == 1 && -z "${EMULATOR_IMAGE:-}" ]]; then
  require_idf
  (cd "$ROOT/apps/attractap/nfc-emulator" && ./scripts/idf.sh build >"$RUN_DIR/emulator-build.log" 2>&1)
  (cd "$ROOT/apps/attractap/nfc-emulator/build" && esptool --chip esp32s3 merge-bin -o "$RUN_DIR/emulator.bin" @flash_args >/dev/null)
  EMULATOR_IMAGE="$RUN_DIR/emulator.bin"
fi
echo "building the API and the replay chip ..."
(cd "$ROOT" && pnpm nx build api >"$RUN_DIR/api-build.log" 2>&1)
"$HERE/replay/replay.sh" "$HERE/replay/build/replay" >/dev/null

# --- API behind the wiretap, plus the raw wire proxy ----------------------------------------------
API_PORT="$(python3 -c 'import socket; s=socket.socket(); s.bind(("", 0)); print(s.getsockname()[1])')"
STORAGE="$RUN_DIR/storage"; mkdir -p "$STORAGE"
export WIRETAP_FILE="$RUN_DIR/wiretap.jsonl" WIRETAP_DROP="$RUN_DIR/drop.arm"
(cd "$ROOT" && STORAGE_ROOT="$STORAGE" PORT="$API_PORT" LOG_LEVELS=error,warn,log,debug LOG_DESTINATIONS=console \
  nohup node -r "$HERE/wiretap.cjs" --env-file="$ROOT/.env" dist/apps/api/main.js >"$RUN_DIR/api.log" 2>&1 &
  echo $! >"$RUN_DIR/api.pid")
python3 "$HERE/wireproxy.py" --target-port "$API_PORT" --capture "$RUN_DIR/wire.jsonl" --ready "$RUN_DIR/proxy.json" >"$RUN_DIR/proxy.log" 2>&1 &
echo $! >"$RUN_DIR/proxy.pid"
cleanup() { kill "$(cat "$RUN_DIR/proxy.pid")" "$(cat "$RUN_DIR/api.pid")" 2>/dev/null || true; }
trap cleanup EXIT
until curl -sf -o /dev/null "http://127.0.0.1:$API_PORT/api/info"; do
  kill -0 "$(cat "$RUN_DIR/api.pid")" 2>/dev/null || { tail -30 "$RUN_DIR/api.log" >&2; exit 1; }
  sleep 1
done
until [[ -s "$RUN_DIR/proxy.json" ]]; do sleep 0.3; done
PROXY_PORT="$(python3 -c "import json; print(json.load(open('$RUN_DIR/proxy.json'))['port'])")"
(cd "$ROOT" && STORAGE_ROOT="$STORAGE" node --env-file="$ROOT/.env" --experimental-strip-types apps/api/scripts/seed-dev-user.mjs \
  --username admin --password password --allow-external-db >"$RUN_DIR/seed.log" 2>&1)

# The labgrid client's own interpreter (has labgrid and pytest).
if [[ -z "${LAB_PYTHON:-}" ]]; then
  client="$(command -v labgrid-client)"
  target="$(grep -ao '"/[^"]*/bin/labgrid-client"' "$(readlink -f "$client")" | tr -d '"' | head -1 || true)"
  LAB_PYTHON="$(dirname "${target:-$client}")/python3"
fi
AUTH_SESSION_SECRET="$(node --env-file="$ROOT/.env" -e 'process.stdout.write(process.env.AUTH_SESSION_SECRET ?? "")')"

echo
echo "API on :$API_PORT (reader connects through the proxy on :$PROXY_PORT). Claiming $PLACE ..."
status=0
cd "$RUN_DIR"  # labgrid writes its session artifacts to ./lab-artifacts
GRPC_ENABLE_FORK_SUPPORT=0 RUN_DIR="$RUN_DIR" READER_IMAGE="$READER_IMAGE" EMULATOR_IMAGE="${EMULATOR_IMAGE:-}" \
  API_URL="http://127.0.0.1:$API_PORT" API_DB="$STORAGE/attraccess.sqlite" API_PORT="$API_PORT" READER_API_PORT="$PROXY_PORT" \
  API_HOST="${API_HOST:-}" AUTH_SESSION_SECRET="$AUTH_SESSION_SECRET" READER_VARIANT="$VARIANT" \
  labgrid-client -x "$COORDINATOR" -p "$PLACE" session --purpose "Attractap real-card session ($STAMP)" \
    --wait-timeout "${WAIT_TIMEOUT:-900}" -- "$LAB_PYTHON" "$HERE/session.py" "$@" || status=$?

# --- the replay check ------------------------------------------------------------------------------
echo
echo "replaying the captured conversations through the 1.7.x card code ..."
mkdir -p "$RUN_DIR/recordings"
node "$HERE/replay/compare.mjs" --wiretap "$RUN_DIR/wiretap.jsonl" --keys "$RUN_DIR/keys.json" \
  --out "$RUN_DIR/recordings" --replay "$HERE/replay/build/replay" | tee "$RUN_DIR/replay-report.txt" || true
node "$HERE/summary.mjs" "$RUN_DIR" || true
echo "done (session exit $status). Everything is in $RUN_DIR"
exit "$status"
