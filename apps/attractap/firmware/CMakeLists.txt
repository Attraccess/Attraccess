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

# Lab/test-only `debug.crash` serial topic that panics on purpose (crash report and
# coredump upload tests, ATT-1144). Never ship it: build_firmwares.py forces this OFF
# and tools/check_release_build.py fails a release image that contains it.
option(ATTRACTAP_CRASH_TRIGGER "Compile the debug.crash serial crash trigger (lab builds only)" OFF)

# LVGL FPS/render/flush timing logged to serial (sysmon perf monitor, ATT-554/ATT-1276). Display
# variants only, a developer option: build_firmwares.py forces it OFF and tools/check_release_build.py
# fails a release image compiled with it.
option(ATTRACTAP_LV_PERF_MONITOR "Log LVGL perf monitor FPS/render timing to serial (display variants, dev builds only)" OFF)

# Reader UI self-test (ATT-1187): fills every plugin slot, opens a step and the keyboard, runs the hostile
# fixtures and prints UI_MEM/UI_STACK/UI_HEAP/UI_BUILD lines for `attractap-lab --check-ui-selftest`.
# Real display variants only (not the demo variants), lab builds only; build_firmwares.py never sets it.
option(ATTRACTAP_UI_SELFTEST "Compile the reader UI self-test scenario (lab builds only)" OFF)

# Beeper state of a reader that has no saved beeper setting yet (fresh or
# erased). Lab builds set it OFF; the setting itself still works.
option(ATTRACTAP_BEEPER_DEFAULT "Enable the beeper on readers without a saved beeper setting" ON)

# Device-lab TLS CA (PEM path) that a lab image also trusts for wss://, so HIL runs can measure the
# reader over a validated TLS connection (HIL_WSS in apps/attractap-lab). Never ship it:
# build_firmwares.py clears it and tools/check_release_build.py fails an image that contains it.
set(ATTRACTAP_LAB_CA "" CACHE STRING "Device-lab CA certificate (PEM) a lab image trusts (needs ATTRACTAP_TEST_HOOKS)")

set(ATTRACTAP_VARIANT_FILE "${CMAKE_CURRENT_LIST_DIR}/variants/${ATTRACTAP_VARIANT}.cmake")
if(NOT EXISTS "${ATTRACTAP_VARIANT_FILE}")
    file(GLOB _attractap_variants RELATIVE "${CMAKE_CURRENT_LIST_DIR}/variants" "${CMAKE_CURRENT_LIST_DIR}/variants/*.cmake")
    message(FATAL_ERROR "Unknown ATTRACTAP_VARIANT '${ATTRACTAP_VARIANT}'. Available: ${_attractap_variants}")
endif()
include("${ATTRACTAP_VARIANT_FILE}")

# IDF target of the variant (esp32s3 unless the variant sets ATTRACTAP_IDF_TARGET). ESP-IDF then also applies
# sdkconfig.defaults.<target> when it exists (sdkconfig.defaults.esp32 for the BLE bridge).
if(NOT DEFINED ATTRACTAP_IDF_TARGET)
    set(ATTRACTAP_IDF_TARGET "esp32s3")
endif()
if(DEFINED ENV{IDF_TARGET} AND NOT "$ENV{IDF_TARGET}" STREQUAL "${ATTRACTAP_IDF_TARGET}")
    message(FATAL_ERROR "IDF_TARGET=$ENV{IDF_TARGET} in the environment, but variant '${ATTRACTAP_VARIANT}' is built for ${ATTRACTAP_IDF_TARGET}")
endif()
set(IDF_TARGET "${ATTRACTAP_IDF_TARGET}")

# Secure profile (ATT-1166): Secure Boot v2 + flash encryption + locked debug paths.
# Never for demo builds; images stay unsigned, the API signs them per installation.
option(ATTRACTAP_SECURE_PROFILE "Build the secure firmware profile (sdkconfig.secure overlay)" OFF)
# Device-lab secure test reader (sdkconfig.secure-lab on top): development-mode
# flash encryption and a USB console, signed with the committed lab key. Never shipped.
option(ATTRACTAP_SECURE_LAB "Build the lab-only secure test reader profile (needs ATTRACTAP_SECURE_PROFILE)" OFF)
if(ATTRACTAP_SECURE_LAB AND NOT ATTRACTAP_SECURE_PROFILE)
    message(FATAL_ERROR "ATTRACTAP_SECURE_LAB=ON needs ATTRACTAP_SECURE_PROFILE=ON")
endif()
if(ATTRACTAP_CRASH_TRIGGER AND ATTRACTAP_SECURE_PROFILE)
    message(FATAL_ERROR "ATTRACTAP_CRASH_TRIGGER=ON is not available with the secure profile (coredumps are off there)")
endif()
if(NOT "${ATTRACTAP_LAB_CA}" STREQUAL "")
    if(NOT ATTRACTAP_TEST_HOOKS OR (ATTRACTAP_SECURE_PROFILE AND NOT ATTRACTAP_SECURE_LAB))
        message(FATAL_ERROR "ATTRACTAP_LAB_CA is for lab images only: it needs ATTRACTAP_TEST_HOOKS=ON and no release secure profile")
    endif()
    get_filename_component(ATTRACTAP_LAB_CA "${ATTRACTAP_LAB_CA}" ABSOLUTE BASE_DIR "${CMAKE_CURRENT_LIST_DIR}")
    if(NOT EXISTS "${ATTRACTAP_LAB_CA}")
        message(FATAL_ERROR "ATTRACTAP_LAB_CA: ${ATTRACTAP_LAB_CA} does not exist")
    endif()
endif()
if(ATTRACTAP_LV_PERF_MONITOR AND NOT "HAS_LVGL_DISPLAY=1" IN_LIST ATTRACTAP_DEFINES)
    message(FATAL_ERROR "ATTRACTAP_LV_PERF_MONITOR=ON needs a variant with an LVGL display, '${ATTRACTAP_VARIANT}' has none")
endif()
# Run-time stats (the debug.stats serial topic) for every lab image, not for a release secure profile.
# Goes before the secure overlays so they stay last.
if(ATTRACTAP_TEST_HOOKS AND NOT (ATTRACTAP_SECURE_PROFILE AND NOT ATTRACTAP_SECURE_LAB))
    if(NOT SDKCONFIG_DEFAULTS AND DEFINED ENV{SDKCONFIG_DEFAULTS})
        set(SDKCONFIG_DEFAULTS "$ENV{SDKCONFIG_DEFAULTS}")
    endif()
    if(NOT SDKCONFIG_DEFAULTS)
        set(SDKCONFIG_DEFAULTS "${CMAKE_CURRENT_LIST_DIR}/sdkconfig.defaults")
    endif()
    list(APPEND SDKCONFIG_DEFAULTS "${CMAKE_CURRENT_LIST_DIR}/sdkconfig.lab-stats")
endif()
if(ATTRACTAP_SECURE_PROFILE)
    # sdkconfig.secure and the secure bootloader budget are ESP32-S3 only; the bridge has a plan, no build (README).
    if(NOT ATTRACTAP_IDF_TARGET STREQUAL "esp32s3")
        message(FATAL_ERROR "The secure profile is not available for ${ATTRACTAP_IDF_TARGET} variant '${ATTRACTAP_VARIANT}'")
    endif()
    if(ATTRACTAP_FIRMWARE_VARIANT STREQUAL "demo")
        message(FATAL_ERROR "The secure profile is not available for demo variant '${ATTRACTAP_VARIANT}'")
    endif()
    # Keep any defaults the caller passed (e.g. sdkconfig.debug); the secure overlay always comes last.
    if(NOT SDKCONFIG_DEFAULTS AND DEFINED ENV{SDKCONFIG_DEFAULTS})
        set(SDKCONFIG_DEFAULTS "$ENV{SDKCONFIG_DEFAULTS}")
    endif()
    if(NOT SDKCONFIG_DEFAULTS)
        set(SDKCONFIG_DEFAULTS "${CMAKE_CURRENT_LIST_DIR}/sdkconfig.defaults")
    endif()
    list(APPEND SDKCONFIG_DEFAULTS "${CMAKE_CURRENT_LIST_DIR}/sdkconfig.secure")
    # The eFuse report (ATT-1207) is compiled only into secure builds.
    list(APPEND ATTRACTAP_DEFINES ATTRACTAP_SECURE_BUILD=1)
    if(ATTRACTAP_SECURE_LAB)
        # Lab readers keep the console and serial config handler for provisioning.
        list(APPEND SDKCONFIG_DEFAULTS "${CMAKE_CURRENT_LIST_DIR}/sdkconfig.secure-lab")
        list(APPEND ATTRACTAP_DEFINES ATTRACTAP_SECURE_LAB=1)
    else()
        # Compiles out the console: its driver (main.cpp) and the console command input (serialConsoleInput.cpp).
        # The command handler stays for the Bluetooth setup channel (ATT-1371), the only way commands arrive.
        list(APPEND ATTRACTAP_DEFINES ATTRACTAP_SECURE_PROFILE=1)
        if(DEFINED ATTRACTAP_EXCLUDE_REGEX AND NOT "${ATTRACTAP_EXCLUDE_REGEX}" STREQUAL "")
            set(ATTRACTAP_EXCLUDE_REGEX "${ATTRACTAP_EXCLUDE_REGEX}|src/serial/serialConsoleInput\\.cpp$")
        else()
            set(ATTRACTAP_EXCLUDE_REGEX "src/serial/serialConsoleInput\\.cpp$")
        endif()
    endif()
endif()

# "Secure this reader" (ATT-1208): plain builds of a variant that has a secure profile build run the conversion client
# (steps 1-6) and advertise `secureConversion`. Never secure, demo or bridge builds.
if("${ATTRACTAP_SECURE_PROFILE_BUILD}" STREQUAL "true" AND NOT ATTRACTAP_SECURE_PROFILE
   AND ATTRACTAP_IDF_TARGET STREQUAL "esp32s3" AND NOT "DEMO_MODE=1" IN_LIST ATTRACTAP_DEFINES)
    set(ATTRACTAP_CONVERSION_CLIENT ON)
    list(APPEND ATTRACTAP_DEFINES ATTRACTAP_CONVERSION_CLIENT=1)
    # Step 6 writes the bootloader region: allowed in these builds only (sdkconfig.conversion).
    if(NOT SDKCONFIG_DEFAULTS AND DEFINED ENV{SDKCONFIG_DEFAULTS})
        set(SDKCONFIG_DEFAULTS "$ENV{SDKCONFIG_DEFAULTS}")
    endif()
    if(NOT SDKCONFIG_DEFAULTS)
        set(SDKCONFIG_DEFAULTS "${CMAKE_CURRENT_LIST_DIR}/sdkconfig.defaults")
    endif()
    list(APPEND SDKCONFIG_DEFAULTS "${CMAKE_CURRENT_LIST_DIR}/sdkconfig.conversion")
else()
    set(ATTRACTAP_CONVERSION_CLIENT OFF)
endif()
# Lab/HIL only: the conversion runs preflight, transfer, staging and verify, and the reader refuses every burn
# command (reason `stop-before-burn`), so no lab unit ever gets a fuse burned. Every test-hooks build has it on;
# build_firmwares.py forces it OFF and tools/check_release_build.py fails a release image that contains it.
option(ATTRACTAP_CONVERSION_STOP_BEFORE_BURN "Refuse every conversion burn command (lab/HIL builds only)" OFF)
if(ATTRACTAP_CONVERSION_STOP_BEFORE_BURN AND NOT ATTRACTAP_TEST_HOOKS)
    message(FATAL_ERROR "ATTRACTAP_CONVERSION_STOP_BEFORE_BURN is a lab/HIL option: it needs ATTRACTAP_TEST_HOOKS=ON")
endif()
if(ATTRACTAP_TEST_HOOKS)
    list(APPEND ATTRACTAP_DEFINES ATTRACTAP_CONVERSION_STOP_BEFORE_BURN=1)
endif()

# A release build reports `release: true` in READER_FIRMWARE_INFO (ATT-1207): not a lab-only variant
# (ATTRACTAP_RELEASE OFF), no secure lab overlay, no test hooks, crash trigger, UI self-test or LVGL perf
# monitor. The server still treats it as a claim.
if((NOT DEFINED ATTRACTAP_RELEASE OR ATTRACTAP_RELEASE) AND NOT ATTRACTAP_SECURE_LAB AND NOT ATTRACTAP_TEST_HOOKS
   AND NOT ATTRACTAP_CRASH_TRIGGER AND NOT ATTRACTAP_UI_SELFTEST AND NOT ATTRACTAP_LV_PERF_MONITOR)
    list(APPEND ATTRACTAP_DEFINES ATTRACTAP_RELEASE=1)
endif()

# Single source of truth for the firmware version (also read by
# scripts/check-attractap-firmware-version.sh and build_firmwares.py).
file(STRINGS "${CMAKE_CURRENT_LIST_DIR}/version.txt" ATTRACTAP_VERSION LIMIT_COUNT 1)
# Lab builds only: the HIL OTA test builds a second image that must report a
# different version. Release builds never set it (build_firmwares.py).
set(ATTRACTAP_VERSION_OVERRIDE "" CACHE STRING "Firmware version string replacing version.txt (HIL OTA test images)")
if(NOT "${ATTRACTAP_VERSION_OVERRIDE}" STREQUAL "")
    set(ATTRACTAP_VERSION "${ATTRACTAP_VERSION_OVERRIDE}")
endif()

# The lvgl managed component compiles against our lv_conf.h instead of its
# Kconfig (defining LV_CONF_PATH overrides lvgl's CONFIG_LV_CONF_SKIP default;
# the value must be a quoted string — lv_conf_internal.h does `#include LV_CONF_PATH`).
# Directory-scoped so it propagates to every component added below this scope.
add_compile_definitions(LV_CONF_PATH="${CMAKE_CURRENT_LIST_DIR}/include/lv_conf.h")
# The perf monitor is configured in lv_conf.h, so LVGL's own sources need the macro too.
if(ATTRACTAP_LV_PERF_MONITOR)
    add_compile_definitions(ATTRACTAP_LV_PERF_MONITOR=1)
endif()

include($ENV{IDF_PATH}/tools/cmake/project.cmake)
project(attractap)

# ESP-IDF only applies SDKCONFIG_DEFAULTS when the sdkconfig does not exist yet,
# so a reused sdkconfig can silently flip the profile. A standard build must never
# carry fuse-burning options (it is web-flashable); a secure build must have them.
if(ATTRACTAP_SECURE_PROFILE AND NOT (CONFIG_SECURE_BOOT AND CONFIG_SECURE_FLASH_ENC_ENABLED))
    message(FATAL_ERROR "ATTRACTAP_SECURE_PROFILE=ON but ${SDKCONFIG} lacks Secure Boot / flash encryption. "
                        "It predates the secure profile; build in a clean directory with its own -DSDKCONFIG.")
elseif(ATTRACTAP_SECURE_PROFILE AND NOT (CONFIG_ESP_COREDUMP_ENABLE_TO_NONE AND CONFIG_MBEDTLS_CUSTOM_MEM_ALLOC))
    # ESP-IDF enables the fuse options of a stale standard sdkconfig but keeps its explicit
    # coredump/MbedTLS choices, so the profile is only half applied. Check the options
    # that differ between the standard and the secure profile (tools/check_secure_profile.py
    # checks the full overlay on built images).
    message(FATAL_ERROR "ATTRACTAP_SECURE_PROFILE=ON but ${SDKCONFIG} does not carry the full secure profile "
                        "(coredump/MbedTLS options of a standard build). Build in a clean directory with its own -DSDKCONFIG.")
elseif(ATTRACTAP_SECURE_PROFILE AND NOT ATTRACTAP_SECURE_LAB AND NOT CONFIG_ESP_CONSOLE_NONE)
    message(FATAL_ERROR "ATTRACTAP_SECURE_PROFILE=ON but ${SDKCONFIG} still has a console enabled. "
                        "Build in a clean directory with its own -DSDKCONFIG.")
elseif(NOT ATTRACTAP_SECURE_PROFILE AND (CONFIG_SECURE_BOOT OR CONFIG_SECURE_FLASH_ENC_ENABLED
                                           OR CONFIG_NVS_ENCRYPTION OR CONFIG_BOOTLOADER_APP_ANTI_ROLLBACK))
    # NVS encryption (HMAC scheme) burns an eFuse key on first boot even without flash
    # encryption, and anti-rollback burns SECURE_VERSION: neither may reach a web-flashable build.
    message(FATAL_ERROR "${SDKCONFIG} enables a fuse-burning option (Secure Boot, flash encryption, NVS encryption "
                        "or anti-rollback), but ATTRACTAP_SECURE_PROFILE is OFF. If it comes from a secure build, "
                        "build in a clean directory with its own -DSDKCONFIG; otherwise remove the option.")
elseif(ATTRACTAP_SECURE_PROFILE AND CONFIG_SPI_FLASH_DANGEROUS_WRITE_ALLOWED)
    # Only the plain app writes the bootloader region (the conversion, ATT-1208); a secure app never may.
    message(FATAL_ERROR "${SDKCONFIG} allows dangerous flash writes, but ATTRACTAP_SECURE_PROFILE is ON. "
                        "Build in a clean directory with its own -DSDKCONFIG.")
elseif(ATTRACTAP_CONVERSION_CLIENT AND NOT CONFIG_SPI_FLASH_DANGEROUS_WRITE_ALLOWED)
    message(FATAL_ERROR "${SDKCONFIG} refuses writes to the bootloader region, which the conversion client "
                        "(ATT-1208, step 6) needs. sdkconfig.defaults allows them; build in a clean directory.")
elseif(ATTRACTAP_SECURE_LAB AND NOT CONFIG_SECURE_FLASH_ENCRYPTION_MODE_DEVELOPMENT)
    message(FATAL_ERROR "ATTRACTAP_SECURE_LAB=ON but ${SDKCONFIG} uses release-mode flash encryption. "
                        "Build in a clean directory with its own -DSDKCONFIG.")
elseif(ATTRACTAP_SECURE_PROFILE AND NOT ATTRACTAP_SECURE_LAB AND CONFIG_SECURE_FLASH_ENCRYPTION_MODE_DEVELOPMENT)
    message(FATAL_ERROR "${SDKCONFIG} comes from a lab build (development-mode flash encryption), but ATTRACTAP_SECURE_LAB is OFF. "
                        "Build in a clean directory with its own -DSDKCONFIG.")
endif()
