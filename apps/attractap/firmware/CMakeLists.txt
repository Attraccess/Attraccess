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

# The lvgl managed component compiles against our lv_conf.h instead of its
# Kconfig (defining LV_CONF_PATH overrides lvgl's CONFIG_LV_CONF_SKIP default;
# the value must be a quoted string — lv_conf_internal.h does `#include LV_CONF_PATH`).
# Directory-scoped so it propagates to every component added below this scope.
add_compile_definitions(LV_CONF_PATH="${CMAKE_CURRENT_LIST_DIR}/include/lv_conf.h")

option(ATTRACTAP_PRODUCTION "Build an unqualified production image for local provisioning" OFF)
if(ATTRACTAP_PRODUCTION)
    if(ATTRACTAP_VARIANT MATCHES "demo")
        message(FATAL_ERROR "Demo variants cannot use production credentials")
    endif()
    list(APPEND SDKCONFIG_DEFAULTS "${CMAKE_CURRENT_LIST_DIR}/sdkconfig.defaults"
        "${CMAKE_CURRENT_LIST_DIR}/sdkconfig.production")
    list(APPEND ATTRACTAP_DEFINES ATTRACTAP_PRODUCTION=1)
endif()

include($ENV{IDF_PATH}/tools/cmake/project.cmake)
project(attractap)

# Validate the resolved configuration, including overrides from an existing
# sdkconfig. Defaults alone cannot enforce a production security profile.
if(ATTRACTAP_PRODUCTION)
    if(NOT CONFIG_SECURE_BOOT OR NOT CONFIG_SECURE_BOOT_V2_ENABLED OR
       NOT CONFIG_SECURE_BOOT_BUILD_SIGNED_BINARIES OR NOT CONFIG_SECURE_FLASH_ENC_ENABLED OR
       NOT CONFIG_SECURE_FLASH_ENCRYPTION_MODE_RELEASE OR NOT CONFIG_NVS_ENCRYPTION OR
       NOT CONFIG_NVS_SEC_KEY_PROTECT_USING_FLASH_ENC OR NOT CONFIG_BOOTLOADER_APP_ANTI_ROLLBACK OR
       CONFIG_BOOTLOADER_APP_SECURE_VERSION LESS 1 OR
       NOT CONFIG_MBEDTLS_HARDWARE_RSA_DS_PERIPHERAL OR NOT CONFIG_MBEDTLS_INTERNAL_MEM_ALLOC OR
       NOT CONFIG_MBEDTLS_PLATFORM_TIME_ALT OR
       NOT CONFIG_MBEDTLS_SSL_IN_CONTENT_LEN EQUAL 16384 OR NOT CONFIG_MBEDTLS_SSL_OUT_CONTENT_LEN EQUAL 4096)
        message(FATAL_ERROR "Production protection and reader TLS settings are required")
    endif()
    if(CONFIG_EFUSE_VIRTUAL OR CONFIG_BOOTLOADER_EFUSE_SECURE_VERSION_EMULATE OR
       CONFIG_SECURE_BOOT_ALLOW_JTAG OR CONFIG_SECURE_INSECURE_ALLOW_DL_MODE OR
       CONFIG_SECURE_FLASH_UART_BOOTLOADER_ALLOW_ENC OR CONFIG_SECURE_FLASH_UART_BOOTLOADER_ALLOW_DEC OR
       CONFIG_SECURE_FLASH_UART_BOOTLOADER_ALLOW_CACHE OR CONFIG_MBEDTLS_SSL_RENEGOTIATION OR
       CONFIG_MBEDTLS_CLIENT_SSL_SESSION_TICKETS OR CONFIG_MBEDTLS_SERVER_SSL_SESSION_TICKETS OR
       CONFIG_MBEDTLS_SSL_PROTO_TLS1_3)
        message(FATAL_ERROR "Unsafe production security override")
    endif()
    if(NOT CONFIG_SECURE_DISABLE_ROM_DL_MODE AND NOT CONFIG_SECURE_ENABLE_SECURE_ROM_DL_MODE)
        message(FATAL_ERROR "Production must restrict ROM download access")
    endif()
    if(NOT CONFIG_ESP_COREDUMP_ENABLE_TO_NONE OR
       CONFIG_ESP_COREDUMP_ENABLE_TO_FLASH OR CONFIG_ESP_COREDUMP_ENABLE_TO_UART)
        message(FATAL_ERROR "Production firmware must disable coredumps")
    endif()
    if(NOT CONFIG_ESP_CONSOLE_NONE OR NOT CONFIG_ESP_CONSOLE_SECONDARY_NONE)
        message(FATAL_ERROR "Production firmware must disable interactive consoles")
    endif()
endif()
