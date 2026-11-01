cmake_minimum_required(VERSION 3.24)
project(attractap_ui_schema_tests LANGUAGES CXX)

get_filename_component(FIRMWARE_DIR "${CMAKE_CURRENT_SOURCE_DIR}/../.." ABSOLUTE)
include(FetchContent)
FetchContent_Declare(ArduinoJson
    URL https://codeload.github.com/bblanchon/ArduinoJson/tar.gz/refs/tags/v7.4.2
    URL_HASH SHA256=681f703dd237f5b7f1dc1d7009a9cf246e88676b349572e73eae9154e8994a55)
FetchContent_MakeAvailable(ArduinoJson)

add_executable(ui-schema-test ui_schema_test.cpp "${FIRMWARE_DIR}/src/display/ui/ui_record.cpp"
    "${FIRMWARE_DIR}/src/display/ui/ui_slot_cache.cpp")
target_compile_features(ui-schema-test PRIVATE cxx_std_17)
target_compile_options(ui-schema-test PRIVATE -Wall -Wextra -Wpedantic)
target_compile_definitions(ui-schema-test PRIVATE UI_FIXTURE_DIR="${CMAKE_CURRENT_SOURCE_DIR}/../ui-fixtures")
target_include_directories(ui-schema-test PRIVATE "${FIRMWARE_DIR}/src/display/ui")
target_link_libraries(ui-schema-test PRIVATE ArduinoJson)

enable_testing()
add_test(NAME ui-schema-test COMMAND ui-schema-test)
