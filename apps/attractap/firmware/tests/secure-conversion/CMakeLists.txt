cmake_minimum_required(VERSION 3.24)
project(attractap_secure_conversion_tests LANGUAGES C CXX)
set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
get_filename_component(FIRMWARE_DIR "${CMAKE_CURRENT_SOURCE_DIR}/../.." ABSOLUTE)

include("${FIRMWARE_DIR}/tools/mbedtls_host.cmake")
include(FetchContent)
FetchContent_Declare(ArduinoJson
    URL https://codeload.github.com/bblanchon/ArduinoJson/tar.gz/refs/tags/v7.4.2
    URL_HASH SHA256=681f703dd237f5b7f1dc1d7009a9cf246e88676b349572e73eae9154e8994a55)
FetchContent_MakeAvailable(ArduinoJson)

set(CONVERSION_DIR "${FIRMWARE_DIR}/src/api/conversion")
enable_testing()

# "Secure this reader" (ATT-1208): the staging format, the NVS backup codec, the conversion messages and burn decision
# (incl. stop-before-burn), and the signature check against espsecure's own output (the API's signer fixture).
add_executable(secure-conversion-tests
    secure_conversion_test.cpp
    signed_image_test.cpp
    "${CONVERSION_DIR}/staging_format.cpp"
    "${CONVERSION_DIR}/nvs_backup_codec.cpp"
    "${CONVERSION_DIR}/conversion_messages.cpp"
    "${CONVERSION_DIR}/signed_image.cpp")
target_include_directories(secure-conversion-tests PRIVATE "${FIRMWARE_DIR}/src")
target_compile_definitions(secure-conversion-tests PRIVATE
    SIGNER_FIXTURES="${FIRMWARE_DIR}/../../api/src/attractap/secure-boot/fixtures")
target_compile_options(secure-conversion-tests PRIVATE -Wall -Wextra -UNDEBUG)
target_link_libraries(secure-conversion-tests PRIVATE ArduinoJson ${ATTRACTAP_MBEDTLS_LIBRARIES})
add_test(NAME secure-conversion-tests COMMAND secure-conversion-tests)

# The RD_DIS lock is compiled only into release secure images. One executable per build flavour, each checking
# conversion_build.hpp under exactly the defines CMakeLists.txt sets for that flavour.
function(rd_dis_case name expected)
    add_executable(rd-dis-${name} rd_dis_policy_test.cpp)
    target_include_directories(rd-dis-${name} PRIVATE "${FIRMWARE_DIR}/src")
    target_compile_definitions(rd-dis-${name} PRIVATE EXPECT_LOCK=${expected} ${ARGN})
    add_test(NAME rd-dis-${name} COMMAND rd-dis-${name})
endfunction()
rd_dis_case(release-secure 1 ATTRACTAP_SECURE_BUILD=1 ATTRACTAP_SECURE_PROFILE=1 ATTRACTAP_RELEASE=1)
rd_dis_case(secure-lab 0 ATTRACTAP_SECURE_BUILD=1 ATTRACTAP_SECURE_LAB=1)
rd_dis_case(secure-lab-hooks 0 ATTRACTAP_SECURE_BUILD=1 ATTRACTAP_SECURE_LAB=1 ATTRACTAP_TEST_HOOKS=1
            ATTRACTAP_CONVERSION_STOP_BEFORE_BURN=1)
rd_dis_case(secure-test-hooks 0 ATTRACTAP_SECURE_BUILD=1 ATTRACTAP_SECURE_PROFILE=1 ATTRACTAP_TEST_HOOKS=1)
rd_dis_case(secure-not-release 0 ATTRACTAP_SECURE_BUILD=1 ATTRACTAP_SECURE_PROFILE=1)
rd_dis_case(secure-debug 0 ATTRACTAP_SECURE_BUILD=1 ATTRACTAP_SECURE_PROFILE=1 ATTRACTAP_RELEASE=1
            CONFIG_COMPILER_OPTIMIZATION_DEBUG=1)
rd_dis_case(demo 0 DEMO_MODE=1 ATTRACTAP_RELEASE=1)
rd_dis_case(plain 0 ATTRACTAP_RELEASE=1 ATTRACTAP_CONVERSION_CLIENT=1)
rd_dis_case(plain-lab 0 ATTRACTAP_CONVERSION_CLIENT=1 ATTRACTAP_TEST_HOOKS=1 ATTRACTAP_CONVERSION_STOP_BEFORE_BURN=1)
