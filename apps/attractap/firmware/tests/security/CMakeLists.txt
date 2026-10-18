cmake_minimum_required(VERSION 3.24)
project(attractap_security_tests LANGUAGES CXX)
set(CMAKE_CXX_STANDARD 20)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
get_filename_component(FIRMWARE_DIR "${CMAKE_CURRENT_SOURCE_DIR}/../.." ABSOLUTE)
include(FetchContent)
# Match the production desktop peer's pinned ArduinoJson 7.4.2.
FetchContent_Declare(ArduinoJson
    URL https://codeload.github.com/bblanchon/ArduinoJson/tar.gz/refs/tags/v7.4.2
    URL_HASH SHA256=681f703dd237f5b7f1dc1d7009a9cf246e88676b349572e73eae9154e8994a55)
FetchContent_MakeAvailable(ArduinoJson)
add_executable(resource_payload_test
    resource_payload_test.cpp
    "${FIRMWARE_DIR}/src/api/api.cpp"
    "${FIRMWARE_DIR}/src/api/handlers/resources.cpp"
    "${FIRMWARE_DIR}/src/api/handlers/projects.cpp"
    "${FIRMWARE_DIR}/src/api/handlers/forms.cpp"
    "${FIRMWARE_DIR}/../desktop/src/host_utils.cpp")
target_compile_definitions(resource_payload_test PRIVATE ATTRACTAP_HOST LOGGER_LEVEL_NUM=0)
target_include_directories(resource_payload_test PRIVATE
    "${FIRMWARE_DIR}/../desktop/src/shims" "${FIRMWARE_DIR}/src")
target_link_libraries(resource_payload_test PRIVATE ArduinoJson)
target_compile_options(resource_payload_test PRIVATE -Wall -Wextra -UNDEBUG -ffunction-sections -fdata-sections)
if(APPLE)
    target_link_options(resource_payload_test PRIVATE -Wl,-dead_strip)
else()
    target_link_options(resource_payload_test PRIVATE -Wl,--gc-sections)
endif()
enable_testing()
add_test(NAME resource_payload_test COMMAND resource_payload_test)
set(READER_PAYLOAD_FIXTURE_DIR "" CACHE PATH "Temporary actual API encoder outputs")
if(READER_PAYLOAD_FIXTURE_DIR)
    foreach(fixture ten-descriptions empty personalized multibyte escaped flow-buttons)
        add_test(NAME resource_payload_${fixture}
            COMMAND resource_payload_test "${READER_PAYLOAD_FIXTURE_DIR}/${fixture}.json")
    endforeach()
endif()

# Compile the production session/time engines against the actual IDF-vendored
# libraries. Only hardware IO and the DS signer are replaced by host fixtures.
option(READER_TLS_HOST_TESTS "Build software-key host TLS peer (not DS qualification)" OFF)
if(READER_TLS_HOST_TESTS)
    enable_language(C)
    get_filename_component(REPO_ROOT "${FIRMWARE_DIR}/../../.." ABSOLUTE)
    set(IDF_MBEDTLS "${REPO_ROOT}/.tools/esp-idf/components/mbedtls/mbedtls")
    if(NOT EXISTS "${IDF_MBEDTLS}/CMakeLists.txt")
        message(FATAL_ERROR "Run the shared project-local ESP-IDF setup first")
    endif()
    set(GEN_FILES OFF CACHE BOOL "Use the checked-in IDF generated sources" FORCE)
    set(ENABLE_PROGRAMS OFF CACHE BOOL "" FORCE)
    set(ENABLE_TESTING OFF CACHE BOOL "" FORCE)
    file(MAKE_DIRECTORY "${CMAKE_CURRENT_BINARY_DIR}/security-shims/freertos")
    set(SHIMS "${CMAKE_CURRENT_BINARY_DIR}/security-shims")
    file(WRITE "${SHIMS}/sdkconfig.h" "#pragma once\n#define CONFIG_MBEDTLS_HARDWARE_RSA_DS_PERIPHERAL 0\n")
    file(WRITE "${SHIMS}/reader-mbedtls-config.h" "#define MBEDTLS_PLATFORM_TIME_ALT\n")
    file(WRITE "${SHIMS}/esp_timer.h" "#pragma once\n#include <cstdint>\nint64_t esp_timer_get_time();\n")
    file(WRITE "${SHIMS}/esp_random.h" "#pragma once\n#include <cstddef>\nvoid esp_fill_random(void*, size_t);\n")
    file(WRITE "${SHIMS}/esp_heap_caps.h" "#pragma once\n#include <cstdlib>\n#define MALLOC_CAP_INTERNAL 1\n#define MALLOC_CAP_8BIT 2\ninline void *heap_caps_malloc(size_t n, int) { return std::malloc(n); }\ninline void heap_caps_free(void *p) { std::free(p); }\n")
    file(WRITE "${SHIMS}/freertos/FreeRTOS.h" "#pragma once\n#define portMAX_DELAY 0xffffffffU\n")
    file(WRITE "${SHIMS}/freertos/semphr.h" "#pragma once\n#include <mutex>\nusing SemaphoreHandle_t = std::mutex*;\ninline SemaphoreHandle_t xSemaphoreCreateMutex(){return new std::mutex;}\ninline void xSemaphoreTake(SemaphoreHandle_t m,unsigned){m->lock();}\ninline void xSemaphoreGive(SemaphoreHandle_t m){m->unlock();}\ninline void vSemaphoreDelete(SemaphoreHandle_t m){delete m;}\n")
    set(TF_PSA_CRYPTO_USER_CONFIG_FILE "${SHIMS}/reader-mbedtls-config.h" CACHE FILEPATH "" FORCE)
    set(MBEDTLS_USER_CONFIG_FILE "${SHIMS}/reader-mbedtls-config.h" CACHE FILEPATH "" FORCE)
    add_subdirectory("${IDF_MBEDTLS}" "${CMAKE_CURRENT_BINARY_DIR}/mbedtls" EXCLUDE_FROM_ALL)
    foreach(crypto_target builtin tfpsacrypto mbedtls mbedx509 utilities everest p256-m pqcp)
        if(TARGET ${crypto_target})
            target_include_directories(${crypto_target} BEFORE PRIVATE "${SHIMS}" "${IDF_MBEDTLS}/../port/include")
        endif()
    endforeach()
    add_executable(reader_session_test reader_session_test.cpp trusted_time_test.cpp
        "${FIRMWARE_DIR}/src/security/reader_session.cpp"
        "${FIRMWARE_DIR}/src/security/trusted_time.cpp")
    target_compile_definitions(reader_session_test PRIVATE ESP_PLATFORM ATTRACTAP_HOST)
    target_include_directories(reader_session_test PRIVATE "${SHIMS}"
        "${FIRMWARE_DIR}/../desktop/src/shims" "${FIRMWARE_DIR}/src")
    target_link_libraries(reader_session_test PRIVATE mbedtls mbedx509 tfpsacrypto)
    target_compile_options(reader_session_test PRIVATE -Wall -Wextra -UNDEBUG)
endif()
