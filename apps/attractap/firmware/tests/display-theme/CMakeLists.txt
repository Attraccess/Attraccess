cmake_minimum_required(VERSION 3.24)
project(attractap_display_theme_host LANGUAGES C CXX ASM)

set(CMAKE_C_STANDARD 99)
set(CMAKE_CXX_STANDARD 20)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
get_filename_component(FIRMWARE_DIR "${CMAKE_CURRENT_SOURCE_DIR}/../.." ABSOLUTE)

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
    # LVGL v9.3.0, pinned to the tag's commit rather than a moving branch.
    FetchContent_Declare(lvgl
        URL https://codeload.github.com/lvgl/lvgl/tar.gz/108e5aff3c90cc4d969331ed61aff2bbd365d430
        DOWNLOAD_EXTRACT_TIMESTAMP TRUE)
    FetchContent_MakeAvailable(lvgl)
    set(LVGL_SOURCE_DIR "${lvgl_SOURCE_DIR}")
endif()
message(STATUS "Host renderer LVGL source: ${LVGL_SOURCE_DIR}")

# Use the production descriptors and bytes, not regenerated or recolored logos.
# Use the production alignment wrapper, also without an ESP-IDF installation.
set(ATTRACTAP_IMAGE_DIR "${FIRMWARE_DIR}/src/display/images")
configure_file("${ATTRACTAP_IMAGE_DIR}/logos.S.in" "${CMAKE_CURRENT_BINARY_DIR}/logos.S" @ONLY)
set_source_files_properties("${CMAKE_CURRENT_BINARY_DIR}/logos.S" PROPERTIES
    OBJECT_DEPENDS "${FIRMWARE_DIR}/src/display/images/logo_133x40.rgb565a8;${FIRMWARE_DIR}/src/display/images/logo_400x120.rgb565a8")

add_executable(display-theme-host
    main.cpp
    host_shims.cpp
    "${CMAKE_CURRENT_BINARY_DIR}/logos.S"
    "${FIRMWARE_DIR}/src/display/theme.cpp"
    "${FIRMWARE_DIR}/src/display/screens/boot/bootscreen.cpp"
    "${FIRMWARE_DIR}/src/display/screens/init/initscreen.cpp"
    "${FIRMWARE_DIR}/src/display/screens/enrollment/enrollmentScreen.cpp"
    "${FIRMWARE_DIR}/src/display/screens/reset/resetScreen.cpp"
    "${FIRMWARE_DIR}/src/display/screens/supervision/supervisionScreen.cpp"
    "${FIRMWARE_DIR}/src/display/shared/pinInput/pinInputPage.cpp")
target_include_directories(display-theme-host PRIVATE shims "${FIRMWARE_DIR}/src")
target_compile_definitions(display-theme-host PRIVATE
    FIRMWARE_FRIENDLY_NAME="Attractap Host"
    FIRMWARE_VERSION="test"
    PIN_ETH_SPI_CS=1
    LOGGER_LEVEL_NUM=0)
target_compile_options(display-theme-host PRIVATE
    "$<$<COMPILE_LANGUAGE:CXX>:-Wall;-Wextra>")
target_link_libraries(display-theme-host PRIVATE lvgl::lvgl)
if(UNIX AND NOT APPLE)
    target_link_libraries(display-theme-host PRIVATE m)
endif()

enable_testing()
add_test(NAME display-theme-host COMMAND display-theme-host)
add_test(NAME display-theme-repeatability COMMAND "${CMAKE_COMMAND}"
    "-DHARNESS=$<TARGET_FILE:display-theme-host>"
    "-DOUTPUT=${CMAKE_CURRENT_BINARY_DIR}/repeatability"
    -P "${CMAKE_CURRENT_SOURCE_DIR}/verify_repeatability.cmake")
set_tests_properties(display-theme-host display-theme-repeatability PROPERTIES TIMEOUT 120)
