cmake_minimum_required(VERSION 3.24)
project(attractap_desktop LANGUAGES C CXX)

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

add_library(attractap-desktop-runtime
    src/host_runtime.cpp
    src/profile_store.cpp
    src/sdl_display.cpp)
target_include_directories(attractap-desktop-runtime PUBLIC
    src
    "${FIRMWARE_DIR}/src")
target_link_libraries(attractap-desktop-runtime PUBLIC SDL3::SDL3 lvgl::lvgl)
target_compile_options(attractap-desktop-runtime PRIVATE "$<$<COMPILE_LANGUAGE:CXX>:-Wall;-Wextra;-Wpedantic>")

add_executable(attractap-desktop MACOSX_BUNDLE src/main.cpp)
target_link_libraries(attractap-desktop PRIVATE attractap-desktop-runtime)
set_target_properties(attractap-desktop PROPERTIES
    MACOSX_BUNDLE_BUNDLE_NAME "Attractap Desktop"
    MACOSX_BUNDLE_GUI_IDENTIFIER "org.attraccess.attractap-desktop")

add_executable(attractap-desktop-tests
    tests/main.cpp
    src/host_runtime.cpp
    src/profile_store.cpp)
target_include_directories(attractap-desktop-tests PRIVATE src)
target_compile_options(attractap-desktop-tests PRIVATE -Wall -Wextra -Wpedantic)

enable_testing()
add_test(NAME attractap-desktop-tests COMMAND attractap-desktop-tests)
