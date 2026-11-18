cmake_minimum_required(VERSION 3.24)
project(attractap_ble_proxy_tests LANGUAGES CXX)

get_filename_component(FIRMWARE_DIR "${CMAKE_CURRENT_SOURCE_DIR}/../.." ABSOLUTE)
include(FetchContent)
FetchContent_Declare(ArduinoJson
    URL https://codeload.github.com/bblanchon/ArduinoJson/tar.gz/refs/tags/v7.4.2
    URL_HASH SHA256=681f703dd237f5b7f1dc1d7009a9cf246e88676b349572e73eae9154e8994a55)
FetchContent_MakeAvailable(ArduinoJson)

set(BLE_DIR "${FIRMWARE_DIR}/src/ble_proxy")
# The pure part of the proxy only: no NimBLE, no FreeRTOS (ble_proxy.cpp and ble_radio_nimble.cpp stay out).
add_executable(ble-proxy-test ble_proxy_test.cpp ble_proxy_edge_test.cpp ble_link_test.cpp
    "${BLE_DIR}/ble_core.cpp" "${BLE_DIR}/ble_core_events.cpp" "${BLE_DIR}/ble_codec.cpp" "${BLE_DIR}/ble_adv.cpp" "${BLE_DIR}/ble_errors.cpp"
    "${BLE_DIR}/ble_notification_buffer.cpp")
target_compile_features(ble-proxy-test PRIVATE cxx_std_17)
target_compile_options(ble-proxy-test PRIVATE -Wall -Wextra -Wpedantic)
target_include_directories(ble-proxy-test PRIVATE "${BLE_DIR}" "${FIRMWARE_DIR}/src/display/ui")
target_link_libraries(ble-proxy-test PRIVATE ArduinoJson)

enable_testing()
add_test(NAME ble-proxy-test COMMAND ble-proxy-test)
set_tests_properties(ble-proxy-test PROPERTIES TIMEOUT 30)
