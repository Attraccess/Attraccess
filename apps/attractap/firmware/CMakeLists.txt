cmake_minimum_required(VERSION 3.16)

# Firmware variant to build — one .cmake file per shipped firmware under variants/.
# Each variant file sets ATTRACTAP_DEFINES (compile definitions, the successor of
# the per-env build_flags in the old platformio.ini) and ATTRACTAP_EXCLUDE_REGEX
# (source subtrees not compiled for that hardware). Lab-only variants set
# ATTRACTAP_RELEASE OFF (build_firmwares.py never ships them); the *-park
# variants also set ATTRACTAP_APP "park" to build park/ instead of src/.
set(ATTRACTAP_VARIANT "attractap-touch" CACHE STRING "Attractap firmware variant to build")

# Runtime log level compiled into the firmware banner/filter (bare token, stringified
# by logger.cpp). build_firmwares.py passes ERROR for production builds.
set(ATTRACTAP_LOG_LEVEL "INFO" CACHE STRING "Runtime log level (ERROR/WARN/INFO/DEBUG)")

# Lab/test-only serial topics (ui.*) that inject touches, list on-screen
# widgets and stream screenshots, for hardware-in-the-loop tests. Never ship
# them: build_firmwares.py forces this OFF. See README "Test hooks".
option(ATTRACTAP_TEST_HOOKS "Compile the ui.* serial test hooks (display variants only)" OFF)

# Beeper state of a reader that has no saved beeper setting yet (fresh or
# erased). Lab builds set it OFF; the setting itself still works.
# Reader UI self-test (ATT-1187): fills every plugin slot, opens a step and the keyboard, runs the hostile
# fixtures and prints UI_MEM/UI_STACK/UI_HEAP/UI_BUILD lines for `attractap-lab --check-ui-selftest`.
# Real display variants only (not the demo variants), lab builds only; build_firmwares.py never sets it.
option(ATTRACTAP_UI_SELFTEST "Compile the reader UI self-test scenario (lab builds only)" OFF)

option(ATTRACTAP_BEEPER_DEFAULT "Enable the beeper on readers without a saved beeper setting" ON)

set(ATTRACTAP_VARIANT_FILE "${CMAKE_CURRENT_LIST_DIR}/variants/${ATTRACTAP_VARIANT}.cmake")
if(NOT EXISTS "${ATTRACTAP_VARIANT_FILE}")
    file(GLOB _attractap_variants RELATIVE "${CMAKE_CURRENT_LIST_DIR}/variants" "${CMAKE_CURRENT_LIST_DIR}/variants/*.cmake")
    message(FATAL_ERROR "Unknown ATTRACTAP_VARIANT '${ATTRACTAP_VARIANT}'. Available: ${_attractap_variants}")
endif()
include("${ATTRACTAP_VARIANT_FILE}")

# Single source of truth for the firmware version (also read by
# scripts/check-attractap-firmware-version.sh and build_firmwares.py).
file(STRINGS "${CMAKE_CURRENT_LIST_DIR}/version.txt" ATTRACTAP_VERSION LIMIT_COUNT 1)

# The lvgl managed component compiles against our lv_conf.h instead of its
# Kconfig (defining LV_CONF_PATH overrides lvgl's CONFIG_LV_CONF_SKIP default;
# the value must be a quoted string — lv_conf_internal.h does `#include LV_CONF_PATH`).
# Directory-scoped so it propagates to every component added below this scope.
add_compile_definitions(LV_CONF_PATH="${CMAKE_CURRENT_LIST_DIR}/include/lv_conf.h")

include($ENV{IDF_PATH}/tools/cmake/project.cmake)
project(attractap)
