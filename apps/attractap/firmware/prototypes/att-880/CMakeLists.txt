cmake_minimum_required(VERSION 3.24)
project(att880_prototype LANGUAGES C CXX ASM)
set(CMAKE_CXX_STANDARD 20)
get_filename_component(FIRMWARE_DIR "${CMAKE_CURRENT_SOURCE_DIR}/../.." ABSOLUTE)
# Reuse the existing headless renderer's pinned LVGL configuration and raw assets.
# This target is deliberately outside every production build.
add_subdirectory("${FIRMWARE_DIR}/tests/display-theme" "theme-host" EXCLUDE_FROM_ALL)
include("${FIRMWARE_DIR}/tools/latin1_fonts.cmake")
attractap_latin1_fonts(PROTOTYPE_FONTS)
add_executable(att880-prototype main.cpp "${FIRMWARE_DIR}/src/display/theme.cpp"
    "${CMAKE_CURRENT_BINARY_DIR}/theme-host/logos.S" ${PROTOTYPE_FONTS})
target_include_directories(att880-prototype PRIVATE "${FIRMWARE_DIR}/src")
target_link_libraries(att880-prototype PRIVATE lvgl::lvgl)
