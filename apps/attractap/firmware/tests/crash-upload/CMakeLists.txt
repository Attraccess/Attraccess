cmake_minimum_required(VERSION 3.24)
project(attractap_crash_upload_tests LANGUAGES CXX)

get_filename_component(FIRMWARE_DIR "${CMAKE_CURRENT_SOURCE_DIR}/../.." ABSOLUTE)
include(FetchContent)
FetchContent_Declare(ArduinoJson
    URL https://codeload.github.com/bblanchon/ArduinoJson/tar.gz/refs/tags/v7.4.2
    URL_HASH SHA256=681f703dd237f5b7f1dc1d7009a9cf246e88676b349572e73eae9154e8994a55)
FetchContent_MakeAvailable(ArduinoJson)

# The crash report / chunked coredump upload state machine (ATT-1144) against a protocol-level fake server.
add_executable(crash-upload crash_upload_test.cpp "${FIRMWARE_DIR}/src/api/diagnostics/coredump-upload.cpp")
target_compile_features(crash-upload PRIVATE cxx_std_17)
target_compile_definitions(crash-upload PRIVATE LOGGER_LEVEL_NUM=0)
target_compile_options(crash-upload PRIVATE -Wall -Wextra -Wpedantic -UNDEBUG)
target_include_directories(crash-upload PRIVATE "${FIRMWARE_DIR}/src")
target_link_libraries(crash-upload PRIVATE ArduinoJson)

enable_testing()
add_test(NAME crash-upload COMMAND crash-upload)
set_tests_properties(crash-upload PROPERTIES TIMEOUT 60)
