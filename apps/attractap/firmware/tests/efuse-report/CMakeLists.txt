cmake_minimum_required(VERSION 3.24)
project(attractap_efuse_report_tests LANGUAGES CXX)

get_filename_component(FIRMWARE_DIR "${CMAKE_CURRENT_SOURCE_DIR}/../.." ABSOLUTE)
include(FetchContent)
FetchContent_Declare(ArduinoJson
    URL https://codeload.github.com/bblanchon/ArduinoJson/tar.gz/refs/tags/v7.4.2
    URL_HASH SHA256=681f703dd237f5b7f1dc1d7009a9cf246e88676b349572e73eae9154e8994a55)
FetchContent_MakeAvailable(ArduinoJson)

add_executable(efuse-report-test efuse_report_test.cpp "${FIRMWARE_DIR}/src/api/security/efuse_report.cpp")
target_compile_features(efuse-report-test PRIVATE cxx_std_17)
target_compile_options(efuse-report-test PRIVATE -Wall -Wextra -Wpedantic)
target_include_directories(efuse-report-test PRIVATE "${FIRMWARE_DIR}/src/api/security")
target_link_libraries(efuse-report-test PRIVATE ArduinoJson)

enable_testing()
add_test(NAME efuse-report-test COMMAND efuse-report-test)
