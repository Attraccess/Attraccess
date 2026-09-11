cmake_minimum_required(VERSION 3.24)
project(attractap_desktop LANGUAGES C CXX ASM)

set(CMAKE_CXX_STANDARD 20)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_EXPORT_COMPILE_COMMANDS ON)

get_filename_component(FIRMWARE_DIR "${CMAKE_CURRENT_SOURCE_DIR}/../firmware" ABSOLUTE)

set(LVGL_SOURCE_DIR "" CACHE PATH "Existing LVGL 9.3.0 source tree (never modified)")
set(LV_BUILD_CONF_PATH "${CMAKE_CURRENT_SOURCE_DIR}/lv_conf.h" CACHE PATH "" FORCE)
set(CONFIG_LV_BUILD_DEMOS OFF CACHE BOOL "" FORCE)
set(CONFIG_LV_BUILD_EXAMPLES OFF CACHE BOOL "" FORCE)
set(CONFIG_LV_USE_THORVG_INTERNAL OFF CACHE BOOL "" FORCE)
set(BUILD_SHARED_LIBS OFF CACHE BOOL "" FORCE)

if(NOT LVGL_SOURCE_DIR AND EXISTS "${FIRMWARE_DIR}/managed_components/lvgl__lvgl/CMakeLists.txt")
    set(LVGL_SOURCE_DIR "${FIRMWARE_DIR}/managed_components/lvgl__lvgl")
endif()
if(LVGL_SOURCE_DIR)
    add_subdirectory("${LVGL_SOURCE_DIR}" "${CMAKE_CURRENT_BINARY_DIR}/lvgl" EXCLUDE_FROM_ALL)
else()
    include(FetchContent)
    FetchContent_Declare(lvgl
        URL https://codeload.github.com/lvgl/lvgl/tar.gz/108e5aff3c90cc4d969331ed61aff2bbd365d430
        URL_HASH SHA256=6a3a9960c544a0339d831fbf7b63d24d048e8f9a606f0b245ad5f1c165bae921
        DOWNLOAD_EXTRACT_TIMESTAMP TRUE)
    FetchContent_MakeAvailable(lvgl)
endif()

find_package(SDL3 REQUIRED CONFIG)
# The macOS SDK libcurl omits WebSocket support. Prefer Homebrew's curl when
# available so the host transport can use CURLOPT_CONNECT_ONLY with ws:// URLs.
if(APPLE)
    foreach(CURL_PREFIX /opt/homebrew/opt/curl /usr/local/opt/curl)
        if(EXISTS "${CURL_PREFIX}/include/curl/curl.h" AND EXISTS "${CURL_PREFIX}/lib/libcurl.dylib")
            set(CURL_INCLUDE_DIR "${CURL_PREFIX}/include" CACHE PATH "" FORCE)
            set(CURL_LIBRARY_RELEASE "${CURL_PREFIX}/lib/libcurl.dylib" CACHE FILEPATH "" FORCE)
            set(CURL_LIBRARY_DEBUG "${CURL_PREFIX}/lib/libcurl.dylib" CACHE FILEPATH "" FORCE)
            break()
        endif()
    endforeach()
endif()
find_package(CURL 8.7 REQUIRED)
find_package(Threads REQUIRED)

include(FetchContent)
FetchContent_Declare(ArduinoJson
    URL https://codeload.github.com/bblanchon/ArduinoJson/tar.gz/refs/tags/v7.4.2
    URL_HASH SHA256=681f703dd237f5b7f1dc1d7009a9cf246e88676b349572e73eae9154e8994a55)
FetchContent_MakeAvailable(ArduinoJson)

file(GLOB_RECURSE ATTRACTAP_FIRMWARE_SOURCES "${FIRMWARE_DIR}/src/*.cpp")
list(FILTER ATTRACTAP_FIRMWARE_SOURCES EXCLUDE REGEX "/main\\.cpp$")
list(FILTER ATTRACTAP_FIRMWARE_SOURCES EXCLUDE REGEX "/nfc/")
list(FILTER ATTRACTAP_FIRMWARE_SOURCES EXCLUDE REGEX "/websocket/")
list(FILTER ATTRACTAP_FIRMWARE_SOURCES EXCLUDE REGEX "/api/demo_websocket\\.cpp$")
list(FILTER ATTRACTAP_FIRMWARE_SOURCES EXCLUDE REGEX "/api/ota/")
list(FILTER ATTRACTAP_FIRMWARE_SOURCES EXCLUDE REGEX "/display/driver/")
list(FILTER ATTRACTAP_FIRMWARE_SOURCES EXCLUDE REGEX "/network/(wifi|ethernet)/")
list(FILTER ATTRACTAP_FIRMWARE_SOURCES EXCLUDE REGEX "/ioexpander/")
list(FILTER ATTRACTAP_FIRMWARE_SOURCES EXCLUDE REGEX "/led/")
list(FILTER ATTRACTAP_FIRMWARE_SOURCES EXCLUDE REGEX "/beeper/beeper\\.cpp$")
list(FILTER ATTRACTAP_FIRMWARE_SOURCES EXCLUDE REGEX "/serial/serialCommandHandler\\.cpp$")
list(FILTER ATTRACTAP_FIRMWARE_SOURCES EXCLUDE REGEX "/utils\\.cpp$")

set(ATTRACTAP_IMAGE_DIR "${FIRMWARE_DIR}/src/display/images")
configure_file("${ATTRACTAP_IMAGE_DIR}/logos.S.in" "${CMAKE_CURRENT_BINARY_DIR}/logos.S" @ONLY)
set_source_files_properties("${CMAKE_CURRENT_BINARY_DIR}/logos.S" PROPERTIES
    OBJECT_DEPENDS "${ATTRACTAP_IMAGE_DIR}/logo_133x40.rgb565a8;${ATTRACTAP_IMAGE_DIR}/logo_400x120.rgb565a8;${ATTRACTAP_IMAGE_DIR}/lockscreen.rgb565")

add_library(attractap-production-host
    ${ATTRACTAP_FIRMWARE_SOURCES}
    src/host_beeper.cpp
    src/host_utils.cpp
    "${CMAKE_CURRENT_BINARY_DIR}/logos.S")
target_include_directories(attractap-production-host PUBLIC
    "${CMAKE_CURRENT_SOURCE_DIR}/src/shims"
    "${CMAKE_CURRENT_SOURCE_DIR}/src"
    "${FIRMWARE_DIR}/src")
target_compile_definitions(attractap-production-host PUBLIC
    ATTRACTAP_HOST
    HAS_LVGL_DISPLAY
    FIRMWARE_NAME="attractap-desktop"
    FIRMWARE_VARIANT="desktop"
    PIN_ETH_SPI_CS=-1
    LOG_LEVEL_NUM=3
    FIRMWARE_VERSION="desktop"
    FIRMWARE_FRIENDLY_NAME="Attractap"
    FIRMWARE_VARIANT_FRIENDLY_NAME="Desktop")
target_link_libraries(attractap-production-host PUBLIC SDL3::SDL3 lvgl::lvgl ArduinoJson Threads::Threads)

add_library(attractap-desktop-runtime
    src/api_endpoint.cpp
    src/host_runtime.cpp
    src/host_websocket.cpp
    src/profile_store.cpp
    src/virtual_nfc.cpp
    src/sdl_display.cpp)
target_include_directories(attractap-desktop-runtime PUBLIC
    src/shims
    src
    "${FIRMWARE_DIR}/src")
target_link_libraries(attractap-desktop-runtime PUBLIC SDL3::SDL3 lvgl::lvgl CURL::libcurl Threads::Threads attractap-production-host)
target_compile_options(attractap-desktop-runtime PRIVATE "$<$<COMPILE_LANGUAGE:CXX>:-Wall;-Wextra;-Wpedantic>")

add_executable(attractap-desktop MACOSX_BUNDLE src/main.cpp)
target_link_libraries(attractap-desktop PRIVATE attractap-desktop-runtime attractap-production-host)
set_target_properties(attractap-desktop PROPERTIES
    MACOSX_BUNDLE_BUNDLE_NAME "Attractap Desktop"
    MACOSX_BUNDLE_GUI_IDENTIFIER "org.attraccess.attractap-desktop")

add_executable(attractap-desktop-tests
    tests/main.cpp
    src/api_endpoint.cpp
    src/host_runtime.cpp
    src/host_websocket.cpp
    src/profile_store.cpp
    src/virtual_nfc.cpp)
target_include_directories(attractap-desktop-tests PRIVATE src "${FIRMWARE_DIR}/src")
target_compile_definitions(attractap-desktop-tests PRIVATE ATTRACTAP_HOST)
target_link_libraries(attractap-desktop-tests PRIVATE CURL::libcurl Threads::Threads attractap-production-host)
target_compile_options(attractap-desktop-tests PRIVATE -Wall -Wextra -Wpedantic)

enable_testing()
add_test(NAME attractap-desktop-tests COMMAND attractap-desktop-tests)
