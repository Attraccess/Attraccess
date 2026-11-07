#!/bin/sh
# Re-creates the recordings from the firmware's own card code as it was before the card checks
# moved to the server (the last 1.7.x state, commit 1246699f3). Run from anywhere in the repository:
#   apps/attractap/firmware/tests/reference-recordings/record.sh
# Needs only a C++17 compiler. Recordings land in ./recordings (they are committed).
set -eu
HERE=$(cd "$(dirname "$0")" && pwd)
ROOT=$(git -C "$HERE" rev-parse --show-toplevel)
REFERENCE_COMMIT=1246699f3
WORK=$(mktemp -d)
trap 'rm -rf "$WORK"' EXIT

git -C "$ROOT" archive "$REFERENCE_COMMIT" apps/attractap/firmware/src/rfid | tar -x -C "$WORK"
SRC="$WORK/apps/attractap/firmware/src"

# Host stand-ins for the parts of the reader that need ESP-IDF.
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
# The one change to the reference code: clang rejects initialising a variable-length array. The length
# is a constant, so declaring it const changes nothing about the bytes.
sed -i.bak "s/^  int cmd_len = /  const int cmd_len = /" "$CARD/authentication.cpp"
c++ -std=c++17 -O1 -w \
  -I"$HERE/shim" -I"$ROOT/apps/attractap/desktop/src" -I"$SRC/rfid" \
  "$HERE/record.cpp" "$ROOT/apps/attractap/desktop/src/virtual_card_chip.cpp" \
  "$CARD/protocol.cpp" "$CARD/authentication.cpp" "$CARD/crypto.cpp" "$CARD/card.cpp" "$SRC/rfid/pn532/desfire.cpp" \
  -o "$WORK/record"
mkdir -p "$HERE/recordings"
"$WORK/record" "$HERE/recordings"
