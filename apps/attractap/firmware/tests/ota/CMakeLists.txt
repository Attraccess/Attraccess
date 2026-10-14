cmake_minimum_required(VERSION 3.24)
project(attractap_ota_tests LANGUAGES CXX)

get_filename_component(FIRMWARE_DIR "${CMAKE_CURRENT_SOURCE_DIR}/../.." ABSOLUTE)
include(FetchContent)
FetchContent_Declare(ArduinoJson
    URL https://codeload.github.com/bblanchon/ArduinoJson/tar.gz/refs/tags/v7.4.2
    URL_HASH SHA256=681f703dd237f5b7f1dc1d7009a9cf246e88676b349572e73eae9154e8994a55)
FetchContent_MakeAvailable(ArduinoJson)

add_executable(ota-lifecycle lifecycle_test.cpp "${FIRMWARE_DIR}/src/api/ota/ota_updater.cpp")
target_compile_features(ota-lifecycle PRIVATE cxx_std_17)
target_compile_definitions(ota-lifecycle PRIVATE LOGGER_LEVEL_NUM=0 FIRMWARE_VERSION="test")
target_compile_options(ota-lifecycle PRIVATE -Wall -Wextra -Wpedantic)
# Put real JSON ahead of the existing timing shims' empty ArduinoJson header.
target_include_directories(ota-lifecycle PRIVATE "${arduinojson_SOURCE_DIR}/src"
    shims "${CMAKE_CURRENT_SOURCE_DIR}/../websocket/shims" "${FIRMWARE_DIR}/src")
target_link_libraries(ota-lifecycle PRIVATE ArduinoJson)

enable_testing()
foreach(scenario nfc-before-flash preparation-failure resume invalid-offer)
    add_test(NAME "ota-${scenario}" COMMAND ota-lifecycle "${scenario}")
endforeach()
