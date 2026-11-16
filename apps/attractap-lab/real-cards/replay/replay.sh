#!/bin/sh
# Builds the replay chip harness on the 1.7.x firmware card code (commit 1246699f3, as record.sh does)
# and prints the path of the binary. Needs only a C++17 compiler. Usage: replay.sh [output-binary]
set -eu
HERE=$(cd "$(dirname "$0")" && pwd)
ROOT=$(git -C "$HERE" rev-parse --show-toplevel)
REF="$ROOT/apps/attractap/firmware/tests/reference-recordings"
REFERENCE_COMMIT=1246699f3
OUT=${1:-$HERE/build/replay}
WORK=$(mktemp -d)
trap 'rm -rf "$WORK"' EXIT
mkdir -p "$(dirname "$OUT")"

git -C "$ROOT" archive "$REFERENCE_COMMIT" apps/attractap/firmware/src/rfid | tar -x -C "$WORK"
SRC="$WORK/apps/attractap/firmware/src"
cat > "$SRC/platform.hpp" <<'HPP'
#pragma once
#include <cstdint>
inline uint32_t millis() { return 0; }
inline void delay(uint32_t) {}
HPP
echo '#pragma once' > "$SRC/utils.hpp"
cat > "$SRC/rfid/pn532_i2c.hpp" <<'HPP'
#pragma once
#include <cstddef>
#include <cstdint>
class Pn532I2cDevice {};
#define PN532_I2C_ADDRESS 0x24
HPP
CARD="$SRC/rfid/pn532/ntag424"
sed -i.bak "s/^  int cmd_len = /  const int cmd_len = /" "$CARD/authentication.cpp"
c++ -std=c++17 -O1 -w -I"$REF/shim" -I"$ROOT/apps/attractap/desktop/src" -I"$SRC/rfid" \
  "$HERE/replay.cpp" "$CARD/protocol.cpp" "$CARD/authentication.cpp" "$CARD/crypto.cpp" "$CARD/card.cpp" "$SRC/rfid/pn532/desfire.cpp" \
  -o "$OUT"
echo "$OUT"
