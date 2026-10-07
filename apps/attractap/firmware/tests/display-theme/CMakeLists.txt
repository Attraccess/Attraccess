cmake_minimum_required(VERSION 3.24)
project(attractap_display_theme_host LANGUAGES C CXX ASM)

set(CMAKE_C_STANDARD 99)
set(CMAKE_CXX_STANDARD 20)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
get_filename_component(FIRMWARE_DIR "${CMAKE_CURRENT_SOURCE_DIR}/../.." ABSOLUTE)

include("${FIRMWARE_DIR}/tools/latin1_fonts.cmake")
attractap_latin1_fonts(ATTRACTAP_LATIN1_FONTS)

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
    OBJECT_DEPENDS "${ATTRACTAP_IMAGE_DIR}/logo_133x40.rgb565a8;${ATTRACTAP_IMAGE_DIR}/logo_400x120.rgb565a8;${ATTRACTAP_IMAGE_DIR}/lockscreen.rgb565")

add_executable(display-theme-host
    main.cpp
    theme_surfaces.cpp
    theme_widgets.cpp
    boot_and_connection.cpp
    card_flows.cpp
    background_and_list.cpp
    resource_details.cpp
    host_shims.cpp
    "${CMAKE_CURRENT_BINARY_DIR}/logos.S"
    "${FIRMWARE_DIR}/src/display/theme.cpp"
    "${FIRMWARE_DIR}/src/display/screens/boot/bootscreen.cpp"
    "${FIRMWARE_DIR}/src/display/screens/init/initscreen.cpp"
    "${FIRMWARE_DIR}/src/display/screens/lockscreen/lockscreen.cpp"
    "${FIRMWARE_DIR}/src/display/screens/noResources/noResourcesScreen.cpp"
    "${FIRMWARE_DIR}/src/display/screens/resourceList/resourceListScreen.cpp"
    "${FIRMWARE_DIR}/src/display/screens/enrollment/enrollmentScreen.cpp"
    "${FIRMWARE_DIR}/src/display/screens/reset/resetScreen.cpp"
    "${FIRMWARE_DIR}/src/display/screens/supervision/supervisionScreen.cpp"
    "${FIRMWARE_DIR}/src/display/screens/resourceDetails/resourceDetailsScreen.cpp"
    "${FIRMWARE_DIR}/src/display/screens/resourceDetails/resourceDetailsSession.cpp"
    "${FIRMWARE_DIR}/src/display/screens/resourceDetails/resourceDetailsProjects.cpp"
    "${FIRMWARE_DIR}/src/display/screens/resourceDetails/resourceDetailsForms.cpp"
    "${FIRMWARE_DIR}/src/display/screens/resourceDetails/resourceDetailsActionFeedback.cpp"
    "${FIRMWARE_DIR}/src/display/screens/init/initscreen_createNetworkRows.cpp"
    "${FIRMWARE_DIR}/src/display/screens/init/initscreen_createConnectionDetails.cpp"
    "${FIRMWARE_DIR}/src/display/screens/init/initscreen_refresh.cpp"
    "${FIRMWARE_DIR}/src/display/screens/init/initscreen_status.cpp"
    "${FIRMWARE_DIR}/src/display/screens/init/initscreen_createApiRows.cpp"
    "${FIRMWARE_DIR}/src/display/screens/enrollment/enrollmentScreen_status.cpp"
    "${FIRMWARE_DIR}/src/display/screens/reset/resetScreen_status.cpp"
    "${FIRMWARE_DIR}/src/display/screens/supervision/supervisionScreen_status.cpp"
    "${FIRMWARE_DIR}/src/display/screens/resourceDetails/resourceDetailsFormModal.cpp"
    "${FIRMWARE_DIR}/src/display/screens/resourceDetails/resourceDetailsFormSelect.cpp"
    "${FIRMWARE_DIR}/src/display/screens/resourceDetails/resourceDetailsProjectModal.cpp"
    "${FIRMWARE_DIR}/src/display/screens/resourceDetails/resourceDetailsFormEditorLayout.cpp"
    "${FIRMWARE_DIR}/src/display/screens/resourceDetails/resourceDetailsProjectEvents.cpp"
    "${FIRMWARE_DIR}/src/display/screens/resourceDetails/resourceDetailsScreen_createDoorControls.cpp"
    "${FIRMWARE_DIR}/src/display/screens/resourceDetails/resourceDetailsScreen_createSessionDetails.cpp"
    "${FIRMWARE_DIR}/src/display/screens/resourceDetails/resourceDetailsScreen_createStatusPanels.cpp"
    "${FIRMWARE_DIR}/src/display/screens/resourceDetails/resourceDetailsLifecycle.cpp"
    "${FIRMWARE_DIR}/src/display/screens/resourceDetails/resourceDetailsResourceUpdate.cpp"
    "${FIRMWARE_DIR}/src/display/screens/resourceDetails/resourceDetailsFormBusy.cpp"
    "${FIRMWARE_DIR}/src/display/screens/resourceDetails/resourceDetailsFormField.cpp"
    "${FIRMWARE_DIR}/src/display/screens/resourceDetails/resourceDetailsFormBreadcrumb.cpp"
    "${FIRMWARE_DIR}/src/display/screens/resourceDetails/resourceDetailsScreen_createResourceHeader.cpp"
    "${FIRMWARE_DIR}/src/display/screens/resourceDetails/resourceDetailsProjectList.cpp"
    "${FIRMWARE_DIR}/src/display/screens/resourceDetails/resourceDetailsFormEditor.cpp"
    "${FIRMWARE_DIR}/src/display/screens/resourceDetails/resourceDetailsFormText.cpp"
    "${FIRMWARE_DIR}/src/display/screens/resourceDetails/resourceDetailsScreen_createSessionControls.cpp"
    "${FIRMWARE_DIR}/src/display/screens/resourceDetails/resourceDetailsAccess.cpp"
    "${FIRMWARE_DIR}/src/display/screens/resourceDetails/resourceDetailsFormSelectLayout.cpp"
    "${FIRMWARE_DIR}/src/display/screens/resourceDetails/resourceDetailsFormNavigation.cpp"
    "${FIRMWARE_DIR}/src/display/screens/resourceDetails/resourceDetailsFormEditorEvents.cpp"
    "${FIRMWARE_DIR}/src/display/screens/resourceDetails/resourceDetailsFormValues.cpp"
    ${ATTRACTAP_LATIN1_FONTS}
    "${FIRMWARE_DIR}/src/display/shared/pinInput/pinInputPage.cpp")
target_include_directories(display-theme-host PRIVATE shims "${FIRMWARE_DIR}/src")
target_compile_definitions(display-theme-host PRIVATE
    FIRMWARE_FRIENDLY_NAME="Attractap Host"
    FIRMWARE_VERSION="test"
    PIN_ETH_SPI_CS=1
    DEMO_MODE=1
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

# Exercise the production introducer parser with real ArduinoJson, not JSON shims.
include(FetchContent)
FetchContent_Declare(arduinojson
    URL https://codeload.github.com/bblanchon/ArduinoJson/tar.gz/e868711b56df8c9db2967fed989bd795e81866a3
    DOWNLOAD_EXTRACT_TIMESTAMP TRUE)
FetchContent_MakeAvailable(arduinojson)
add_executable(resource-introducers-parser resource_introducers_test.cpp)
target_include_directories(resource-introducers-parser PRIVATE "${FIRMWARE_DIR}/src")
target_link_libraries(resource-introducers-parser PRIVATE ArduinoJson)
add_test(NAME resource-introducers-parser COMMAND resource-introducers-parser)
