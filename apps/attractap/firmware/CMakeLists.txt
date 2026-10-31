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
option(ATTRACTAP_BEEPER_DEFAULT "Enable the beeper on readers without a saved beeper setting" ON)

set(ATTRACTAP_VARIANT_FILE "${CMAKE_CURRENT_LIST_DIR}/variants/${ATTRACTAP_VARIANT}.cmake")
if(NOT EXISTS "${ATTRACTAP_VARIANT_FILE}")
    file(GLOB _attractap_variants RELATIVE "${CMAKE_CURRENT_LIST_DIR}/variants" "${CMAKE_CURRENT_LIST_DIR}/variants/*.cmake")
    message(FATAL_ERROR "Unknown ATTRACTAP_VARIANT '${ATTRACTAP_VARIANT}'. Available: ${_attractap_variants}")
endif()
include("${ATTRACTAP_VARIANT_FILE}")

# Secure profile (ATT-1166): Secure Boot v2 + flash encryption + locked debug paths.
# Never for demo builds; images stay unsigned, the API signs them per installation.
option(ATTRACTAP_SECURE_PROFILE "Build the secure firmware profile (sdkconfig.secure overlay)" OFF)
# Device-lab secure test reader (sdkconfig.secure-lab on top): development-mode
# flash encryption and a USB console, signed with the committed lab key. Never shipped.
option(ATTRACTAP_SECURE_LAB "Build the lab-only secure test reader profile (needs ATTRACTAP_SECURE_PROFILE)" OFF)
if(ATTRACTAP_SECURE_LAB AND NOT ATTRACTAP_SECURE_PROFILE)
    message(FATAL_ERROR "ATTRACTAP_SECURE_LAB=ON needs ATTRACTAP_SECURE_PROFILE=ON")
endif()
if(ATTRACTAP_SECURE_PROFILE)
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
    if(ATTRACTAP_SECURE_LAB)
        # Lab readers keep the console and serial config handler for provisioning.
        list(APPEND SDKCONFIG_DEFAULTS "${CMAKE_CURRENT_LIST_DIR}/sdkconfig.secure-lab")
    else()
        # Compiles out the USB serial config handler and console driver.
        list(APPEND ATTRACTAP_DEFINES ATTRACTAP_SECURE_PROFILE=1)
        if(DEFINED ATTRACTAP_EXCLUDE_REGEX AND NOT "${ATTRACTAP_EXCLUDE_REGEX}" STREQUAL "")
            set(ATTRACTAP_EXCLUDE_REGEX "${ATTRACTAP_EXCLUDE_REGEX}|src/serial/")
        else()
            set(ATTRACTAP_EXCLUDE_REGEX "src/serial/")
        endif()
    endif()
endif()

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

# ESP-IDF only applies SDKCONFIG_DEFAULTS when the sdkconfig does not exist yet,
# so a reused sdkconfig can silently flip the profile. A standard build must never
# carry fuse-burning options (it is web-flashable); a secure build must have them.
if(ATTRACTAP_SECURE_PROFILE AND NOT (CONFIG_SECURE_BOOT AND CONFIG_SECURE_FLASH_ENC_ENABLED))
    message(FATAL_ERROR "ATTRACTAP_SECURE_PROFILE=ON but ${SDKCONFIG} lacks Secure Boot / flash encryption. "
                        "It predates the secure profile; build in a clean directory with its own -DSDKCONFIG.")
elseif(ATTRACTAP_SECURE_PROFILE AND NOT (CONFIG_ESP_COREDUMP_ENABLE_TO_NONE AND CONFIG_MBEDTLS_INTERNAL_MEM_ALLOC))
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
elseif(ATTRACTAP_SECURE_LAB AND NOT CONFIG_SECURE_FLASH_ENCRYPTION_MODE_DEVELOPMENT)
    message(FATAL_ERROR "ATTRACTAP_SECURE_LAB=ON but ${SDKCONFIG} uses release-mode flash encryption. "
                        "Build in a clean directory with its own -DSDKCONFIG.")
elseif(ATTRACTAP_SECURE_PROFILE AND NOT ATTRACTAP_SECURE_LAB AND CONFIG_SECURE_FLASH_ENCRYPTION_MODE_DEVELOPMENT)
    message(FATAL_ERROR "${SDKCONFIG} comes from a lab build (development-mode flash encryption), but ATTRACTAP_SECURE_LAB is OFF. "
                        "Build in a clean directory with its own -DSDKCONFIG.")
endif()
