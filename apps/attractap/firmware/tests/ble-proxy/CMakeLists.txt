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
set(BLE_TEST_SOURCES ble_proxy_test.cpp ble_proxy_edge_test.cpp ble_link_test.cpp ble_watch_test.cpp ble_stack_test.cpp
    "${BLE_DIR}/ble_core.cpp" "${BLE_DIR}/ble_core_events.cpp" "${BLE_DIR}/ble_core_watch.cpp" "${BLE_DIR}/ble_codec.cpp"
    "${BLE_DIR}/ble_adv.cpp" "${BLE_DIR}/ble_errors.cpp" "${BLE_DIR}/ble_notification_buffer.cpp" "${BLE_DIR}/ble_watch.cpp")
# ble-proxy-test-internal-ram: the same tests with the smaller bounds of boards without PSRAM (the BLE bridge).
foreach(target ble-proxy-test ble-proxy-test-internal-ram)
    add_executable(${target} ${BLE_TEST_SOURCES})
    target_compile_features(${target} PRIVATE cxx_std_17)
    target_compile_options(${target} PRIVATE -Wall -Wextra -Wpedantic)
    target_include_directories(${target} PRIVATE "${BLE_DIR}" "${FIRMWARE_DIR}/src/display/ui")
    target_link_libraries(${target} PRIVATE ArduinoJson)
endforeach()
target_compile_definitions(ble-proxy-test-internal-ram PRIVATE BLE_PROXY_INTERNAL_RAM=1)

enable_testing()
add_test(NAME ble-proxy-test COMMAND ble-proxy-test)
add_test(NAME ble-proxy-test-internal-ram COMMAND ble-proxy-test-internal-ram)
set_tests_properties(ble-proxy-test ble-proxy-test-internal-ram PROPERTIES TIMEOUT 30)
