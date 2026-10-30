#!/bin/sh
set -eu

CXX=${CXX:-c++}
BUILD_DIR=${TMPDIR:-/tmp}/attractap-nfc-emulator-tests
mkdir -p "$BUILD_DIR"

"$CXX" -std=c++17 -fno-exceptions -Wall -Wextra -Werror -pedantic \
  -Icore/include core/src/*.cpp tests/test_main.cpp \
  -o "$BUILD_DIR/tests"
"$BUILD_DIR/tests"
