# NOTE: ESP-IDF includes this file twice. The first time is the early
# requirements-expansion pass, which runs in an isolated scope where the
# top-level project variables (ATTRACTAP_*) do not exist and where
# idf_component_register() returns immediately after recording REQUIRES.
if(NOT CMAKE_BUILD_EARLY_EXPANSION)
    if(NOT DEFINED ATTRACTAP_DEFINES)
        message(FATAL_ERROR "ATTRACTAP_DEFINES not set — build via the top-level project so a variant file is loaded")
    endif()

    file(GLOB_RECURSE ATTRACTAP_SRCS
         "${CMAKE_CURRENT_LIST_DIR}/../src/*.cpp"
         "${CMAKE_CURRENT_LIST_DIR}/../src/*.c")

    if(DEFINED ATTRACTAP_EXCLUDE_REGEX AND NOT "${ATTRACTAP_EXCLUDE_REGEX}" STREQUAL "")
        list(FILTER ATTRACTAP_SRCS EXCLUDE REGEX "${ATTRACTAP_EXCLUDE_REGEX}")
    endif()
endif()

idf_component_register(
    SRCS ${ATTRACTAP_SRCS}
    INCLUDE_DIRS ../src ../include
    REQUIRES
        driver
        esp_driver_gpio
        esp_driver_i2c
        esp_driver_spi
        esp_driver_usb_serial_jtag
        esp_event
        esp_netif
        esp_wifi
        esp_eth
        esp_timer
        esp_hw_support
        esp_system
        esp_partition
        app_update
        esp_app_format
        espcoredump
        nvs_flash
        mbedtls
        esp_rom
        lwip
        vfs
)

target_compile_definitions(${COMPONENT_LIB} PUBLIC
    ${ATTRACTAP_DEFINES}
    FIRMWARE_VERSION="${ATTRACTAP_VERSION}"
    LOG_LEVEL=${ATTRACTAP_LOG_LEVEL}
)
