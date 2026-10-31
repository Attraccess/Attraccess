# Host builds (desktop simulator, firmware host tests) use the same Mbed TLS release as
# ESP-IDF v6.0.2 (Mbed TLS 4.1.0 / TF-PSA-Crypto), so pairing and session code is identical.
# Set ATTRACTAP_MBEDTLS_SOURCE_DIR to an unpacked mbedtls-4.1.0 release to build offline.
include_guard(GLOBAL)

set(ATTRACTAP_MBEDTLS_SOURCE_DIR "" CACHE PATH "Unpacked Mbed TLS 4.1.0 release (optional)")
set(ENABLE_TESTING OFF CACHE BOOL "" FORCE)
set(ENABLE_PROGRAMS OFF CACHE BOOL "" FORCE)
set(MBEDTLS_FATAL_WARNINGS OFF CACHE BOOL "" FORCE)
set(TF_PSA_CRYPTO_FATAL_WARNINGS OFF CACHE BOOL "" FORCE)
set(USE_SHARED_MBEDTLS_LIBRARY OFF CACHE BOOL "" FORCE)
set(USE_STATIC_MBEDTLS_LIBRARY ON CACHE BOOL "" FORCE)
# Record buffers as on the device (CONFIG_MBEDTLS_SSL_IN/OUT_CONTENT_LEN 8192/4096): records the reader
# cannot take must fail here as well. Public definition, so our sources see the same value.
set(MBEDTLS_USER_CONFIG_FILE "${CMAKE_CURRENT_LIST_DIR}/mbedtls_host_user_config.h" CACHE FILEPATH "" FORCE)

if(ATTRACTAP_MBEDTLS_SOURCE_DIR)
    add_subdirectory("${ATTRACTAP_MBEDTLS_SOURCE_DIR}" "${CMAKE_BINARY_DIR}/mbedtls" EXCLUDE_FROM_ALL)
else()
    include(FetchContent)
    FetchContent_Declare(attractap_mbedtls
        URL https://github.com/Mbed-TLS/mbedtls/releases/download/mbedtls-4.1.0/mbedtls-4.1.0.tar.bz2
        URL_HASH SHA256=377a09cf8eb81b5fb2707045e5522d5489d3309fed5006c9874e60558fc81d10
        DOWNLOAD_EXTRACT_TIMESTAMP TRUE
        EXCLUDE_FROM_ALL)
    FetchContent_MakeAvailable(attractap_mbedtls)
endif()

# mbedtls links mbedx509 and tfpsacrypto.
set(ATTRACTAP_MBEDTLS_LIBRARIES mbedtls mbedx509 tfpsacrypto)
