cmake_minimum_required(VERSION 3.24)
project(attractap_identity_upgrade_host LANGUAGES C CXX)
set(CMAKE_CXX_STANDARD 20)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
get_filename_component(FIRMWARE_DIR "${CMAKE_CURRENT_SOURCE_DIR}/../.." ABSOLUTE)

include("${FIRMWARE_DIR}/tools/mbedtls_host.cmake")
include(FetchContent)
FetchContent_Declare(ArduinoJson
    URL https://codeload.github.com/bblanchon/ArduinoJson/tar.gz/refs/tags/v7.4.2
    URL_HASH SHA256=681f703dd237f5b7f1dc1d7009a9cf246e88676b349572e73eae9154e8994a55)
FetchContent_MakeAvailable(ArduinoJson)

# ATT-1207: proof tuple (shared byte-exact vector with the API spec), RSA/DS helpers, DS record,
# eFuse report, identity upgrade message, NVS erase gate, migration staging header.
add_executable(identity-upgrade-host-tests
    identity_upgrade_test.cpp
    "${FIRMWARE_DIR}/src/api/security/identity_proof.cpp"
    "${FIRMWARE_DIR}/src/api/security/identity_upgrade.cpp"
    "${FIRMWARE_DIR}/src/api/security/rsa_der.cpp"
    "${FIRMWARE_DIR}/src/api/security/ds_params.cpp"
    "${FIRMWARE_DIR}/src/api/security/ds_record.cpp"
    "${FIRMWARE_DIR}/src/api/security/efuse_report.cpp"
    "${FIRMWARE_DIR}/src/api/security/migration_pending.cpp"
    "${FIRMWARE_DIR}/src/api/security/pairing_codec.cpp")
target_include_directories(identity-upgrade-host-tests PRIVATE "${FIRMWARE_DIR}/src")
target_compile_definitions(identity-upgrade-host-tests PRIVATE
    ATTRACTAP_HOST
    PROOF_VECTOR="${CMAKE_CURRENT_SOURCE_DIR}/proof-vector.json"
    DS_PARAMS_VECTOR="${CMAKE_CURRENT_SOURCE_DIR}/ds-params-vector.json")
target_compile_options(identity-upgrade-host-tests PRIVATE -Wall -Wextra -UNDEBUG)
target_link_libraries(identity-upgrade-host-tests PRIVATE ArduinoJson ${ATTRACTAP_MBEDTLS_LIBRARIES})

enable_testing()
add_test(NAME identity-upgrade-host-tests COMMAND identity-upgrade-host-tests)
set_tests_properties(identity-upgrade-host-tests PROPERTIES TIMEOUT 120)
