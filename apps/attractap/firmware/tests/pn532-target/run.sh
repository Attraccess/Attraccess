#!/bin/sh
# Host test for the PN532 driver: InDataExchange must address the target the PN532 inlisted
# (reply to InListPassiveTarget), not target 0. Compiles the real discovery.cpp against a fake bus.
# Needs only a C++17 compiler. Run from anywhere in the repository.
set -eu
HERE=$(cd "$(dirname "$0")" && pwd)
FIRMWARE=$(cd "$HERE/../.." && pwd)
WORK=$(mktemp -d)
trap 'rm -rf "$WORK"' EXIT

# Host stand-ins for the parts of the reader that need ESP-IDF (the sources stay untouched: copies).
mkdir -p "$WORK/src"
cp -R "$FIRMWARE/src/rfid" "$WORK/src/rfid"
cat > "$WORK/src/platform.hpp" <<'HPP'
#pragma once
#include <cstdint>
inline uint32_t millis() { return 0; }
inline void delay(uint32_t) {}
HPP
echo '#pragma once' > "$WORK/src/utils.hpp"
cat > "$WORK/src/rfid/pn532_i2c.hpp" <<'HPP'
#pragma once
#include <cstddef>
#include <cstdint>
class Pn532I2cDevice {};
#define PN532_I2C_ADDRESS 0x24
HPP

c++ -std=c++17 -w \
  -I"$FIRMWARE/tests/reference-recordings/shim" -I"$WORK/src" -I"$WORK/src/rfid" \
  "$HERE/pn532_target_test.cpp" "$WORK/src/rfid/pn532/discovery.cpp" -o "$WORK/pn532_target_test"
"$WORK/pn532_target_test"
echo "pn532_target_test passed"
