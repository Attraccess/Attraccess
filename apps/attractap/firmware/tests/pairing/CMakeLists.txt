cmake_minimum_required(VERSION 3.24)
project(attractap_pairing_host LANGUAGES C CXX)
set(CMAKE_CXX_STANDARD 20)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
get_filename_component(FIRMWARE_DIR "${CMAKE_CURRENT_SOURCE_DIR}/../.." ABSOLUTE)

include("${FIRMWARE_DIR}/tools/mbedtls_host.cmake")
include(FetchContent)
FetchContent_Declare(ArduinoJson
    URL https://codeload.github.com/bblanchon/ArduinoJson/tar.gz/refs/tags/v7.4.2
    URL_HASH SHA256=681f703dd237f5b7f1dc1d7009a9cf246e88676b349572e73eae9154e8994a55)
FetchContent_MakeAvailable(ArduinoJson)

# Codec, pairing client, framing and the TLS session against an in-process mbedTLS TLS 1.3 server.
add_executable(pairing-host-tests
    pairing_test.cpp
    fakes.cpp
    "${FIRMWARE_DIR}/src/api/security/pairing_codec.cpp"
    "${FIRMWARE_DIR}/src/api/security/pairing_client.cpp"
    "${FIRMWARE_DIR}/src/api/security/reader_identity.cpp"
    "${FIRMWARE_DIR}/src/api/security/session_framing.cpp"
    "${FIRMWARE_DIR}/src/api/security/session_tls.cpp"
    "${FIRMWARE_DIR}/src/api/security/session_certificates.cpp")
# The desktop simulator's FreeRTOS/esp_netif shims let state.hpp compile on the host.
target_include_directories(pairing-host-tests PRIVATE "${FIRMWARE_DIR}/src" "${FIRMWARE_DIR}/../desktop/src/shims")
target_compile_definitions(pairing-host-tests PRIVATE
    ATTRACTAP_HOST LOGGER_LEVEL_NUM=0
    PAIRING_VECTORS="${CMAKE_CURRENT_SOURCE_DIR}/vectors.json")
target_compile_options(pairing-host-tests PRIVATE -Wall -Wextra -UNDEBUG)
target_link_libraries(pairing-host-tests PRIVATE ArduinoJson ${ATTRACTAP_MBEDTLS_LIBRARIES})

enable_testing()
add_test(NAME pairing-host-tests COMMAND pairing-host-tests)
set_tests_properties(pairing-host-tests PROPERTIES TIMEOUT 60)
