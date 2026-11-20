cmake_minimum_required(VERSION 3.24)
project(attractap_tls_memory_tests LANGUAGES C)

get_filename_component(FIRMWARE_DIR "${CMAKE_CURRENT_SOURCE_DIR}/../.." ABSOLUTE)
set(TF_PSA_CRYPTO_USER_CONFIG_FILE "${CMAKE_CURRENT_SOURCE_DIR}/tf_psa_crypto_user_config.h" CACHE FILEPATH "" FORCE)
include("${FIRMWARE_DIR}/tools/mbedtls_host.cmake")
# The record buffer lengths and handshake structures live in private mbedTLS headers, as on the device.
if(ATTRACTAP_MBEDTLS_SOURCE_DIR)
    set(MBEDTLS_SRC "${ATTRACTAP_MBEDTLS_SOURCE_DIR}")
else()
    set(MBEDTLS_SRC "${attractap_mbedtls_SOURCE_DIR}")
endif()

add_executable(tls-memory tls_memory_test.c)
target_compile_features(tls-memory PRIVATE c_std_11)
target_include_directories(tls-memory PRIVATE "${FIRMWARE_DIR}/src" "${MBEDTLS_SRC}/library"
                           "${MBEDTLS_SRC}/tf-psa-crypto/core" "${MBEDTLS_SRC}/tf-psa-crypto/drivers/builtin/src"
                           "${MBEDTLS_SRC}/tf-psa-crypto/extras")
target_link_libraries(tls-memory PRIVATE ${ATTRACTAP_MBEDTLS_LIBRARIES})

enable_testing()
add_test(NAME tls-memory COMMAND tls-memory)
set_tests_properties(tls-memory PROPERTIES TIMEOUT 20)
