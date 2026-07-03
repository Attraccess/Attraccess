cmake_minimum_required(VERSION 3.16)

# Firmware variant to build — one .cmake file per shipped firmware under variants/.
# Each variant file sets ATTRACTAP_DEFINES (compile definitions, the successor of
# the per-env build_flags in the old platformio.ini) and ATTRACTAP_EXCLUDE_REGEX
# (source subtrees not compiled for that hardware).
set(ATTRACTAP_VARIANT "attractap-touch" CACHE STRING "Attractap firmware variant to build")

# Runtime log level compiled into the firmware banner/filter (bare token, stringified
# by logger.cpp). build_firmwares.py passes ERROR for production builds.
set(ATTRACTAP_LOG_LEVEL "INFO" CACHE STRING "Runtime log level (ERROR/WARN/INFO/DEBUG)")

set(ATTRACTAP_VARIANT_FILE "${CMAKE_CURRENT_LIST_DIR}/variants/${ATTRACTAP_VARIANT}.cmake")
if(NOT EXISTS "${ATTRACTAP_VARIANT_FILE}")
    file(GLOB _attractap_variants RELATIVE "${CMAKE_CURRENT_LIST_DIR}/variants" "${CMAKE_CURRENT_LIST_DIR}/variants/*.cmake")
    message(FATAL_ERROR "Unknown ATTRACTAP_VARIANT '${ATTRACTAP_VARIANT}'. Available: ${_attractap_variants}")
endif()
include("${ATTRACTAP_VARIANT_FILE}")

# Single source of truth for the firmware version (also read by
# scripts/check-attractap-firmware-version.sh and build_firmwares.py).
file(STRINGS "${CMAKE_CURRENT_LIST_DIR}/version.txt" ATTRACTAP_VERSION LIMIT_COUNT 1)

include($ENV{IDF_PATH}/tools/cmake/project.cmake)

# The lvgl managed component compiles against our lv_conf.h instead of its
# Kconfig (defining LV_CONF_PATH overrides lvgl's CONFIG_LV_CONF_SKIP default;
# the value must be a quoted string — lv_conf_internal.h does `#include LV_CONF_PATH`).
idf_build_set_property(COMPILE_OPTIONS "-DLV_CONF_PATH=\"${CMAKE_CURRENT_LIST_DIR}/include/lv_conf.h\"" APPEND)

project(attractap)
