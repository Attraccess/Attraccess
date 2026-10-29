cmake_minimum_required(VERSION 3.24)
project(attractap_test_hooks_host LANGUAGES C CXX)

# Host tests for the ATTRACTAP_TEST_HOOKS serial hooks: touch gestures and
# screenshot encoding (pure logic) plus widget lookup and injected touches
# against a real LVGL 9.3.0 with the firmware's lv_conf.h.
set(CMAKE_C_STANDARD 99)
set(CMAKE_CXX_STANDARD 20)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
get_filename_component(FIRMWARE_DIR "${CMAKE_CURRENT_SOURCE_DIR}/../.." ABSOLUTE)
set(HOOKS_DIR "${FIRMWARE_DIR}/src/testhooks")

add_executable(test-hooks-logic logic_test.cpp
    "${HOOKS_DIR}/touch_injector.cpp"
    "${HOOKS_DIR}/frame_encoding.cpp")
target_include_directories(test-hooks-logic PRIVATE "${FIRMWARE_DIR}/src")
target_compile_options(test-hooks-logic PRIVATE -Wall -Wextra)

set(LV_BUILD_CONF_PATH "${FIRMWARE_DIR}/tests/display-theme/lv_conf.h" CACHE PATH "" FORCE)
set(CONFIG_LV_BUILD_DEMOS OFF CACHE BOOL "" FORCE)
set(CONFIG_LV_BUILD_EXAMPLES OFF CACHE BOOL "" FORCE)
set(CONFIG_LV_USE_THORVG_INTERNAL OFF CACHE BOOL "" FORCE)
set(BUILD_SHARED_LIBS OFF CACHE BOOL "" FORCE)
set(LVGL_SOURCE_DIR "" CACHE PATH "Existing LVGL 9.3.0 source tree (never modified)")
if(NOT LVGL_SOURCE_DIR AND EXISTS "${FIRMWARE_DIR}/managed_components/lvgl__lvgl/CMakeLists.txt")
    set(LVGL_SOURCE_DIR "${FIRMWARE_DIR}/managed_components/lvgl__lvgl")
endif()
if(LVGL_SOURCE_DIR)
    add_subdirectory("${LVGL_SOURCE_DIR}" "${CMAKE_CURRENT_BINARY_DIR}/lvgl" EXCLUDE_FROM_ALL)
else()
    include(FetchContent)
    # LVGL v9.3.0, pinned to the tag's commit rather than a moving branch.
    FetchContent_Declare(lvgl
        URL https://codeload.github.com/lvgl/lvgl/tar.gz/108e5aff3c90cc4d969331ed61aff2bbd365d430
        DOWNLOAD_EXTRACT_TIMESTAMP TRUE)
    FetchContent_MakeAvailable(lvgl)
endif()

add_executable(test-hooks-lvgl lvgl_test.cpp
    "${HOOKS_DIR}/touch_injector.cpp"
    "${HOOKS_DIR}/widget_finder.cpp")
target_include_directories(test-hooks-lvgl PRIVATE "${FIRMWARE_DIR}/src")
target_compile_options(test-hooks-lvgl PRIVATE "$<$<COMPILE_LANGUAGE:CXX>:-Wall;-Wextra>")
target_link_libraries(test-hooks-lvgl PRIVATE lvgl::lvgl)
if(UNIX AND NOT APPLE)
    target_link_libraries(test-hooks-lvgl PRIVATE m)
endif()

enable_testing()
add_test(NAME test-hooks-logic COMMAND test-hooks-logic)
add_test(NAME test-hooks-lvgl COMMAND test-hooks-lvgl)
set_tests_properties(test-hooks-logic test-hooks-lvgl PROPERTIES TIMEOUT 60)
