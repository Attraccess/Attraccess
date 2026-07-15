# Attractap Touch Demo: same hardware as attractap-touch, but with a local mock
# API (no network/WebSocket) and a card-registration settings screen.
# Excluded from production/docker builds — build_firmwares.py skips -demo variants.
set(ATTRACTAP_FIRMWARE_NAME "attractap_touch_demo")
set(ATTRACTAP_FIRMWARE_FRIENDLY_NAME "Attractap Touch Demo")
set(ATTRACTAP_FIRMWARE_VARIANT "demo")
set(ATTRACTAP_FIRMWARE_VARIANT_FRIENDLY_NAME "Demo")

set(ATTRACTAP_DEFINES
    FIRMWARE_NAME="${ATTRACTAP_FIRMWARE_NAME}"
    FIRMWARE_FRIENDLY_NAME="${ATTRACTAP_FIRMWARE_FRIENDLY_NAME}"
    FIRMWARE_VARIANT="${ATTRACTAP_FIRMWARE_VARIANT}"
    FIRMWARE_VARIANT_FRIENDLY_NAME="${ATTRACTAP_FIRMWARE_VARIANT_FRIENDLY_NAME}"

    LOGGER_LEVEL_NUM=3

    DEMO_MODE=1

    PIN_NFC_I2C_SDA=15
    PIN_NFC_I2C_SCL=7
    PIN_TOUCH_I2C_SDA=15
    PIN_TOUCH_I2C_SCL=7

    PIN_ETH_SPI_CS=-1
    PIN_W5500_INT=-1
    PIN_W5500_RESET=-1
    PIN_ETH_SPI_MOSI=-1
    PIN_ETH_SPI_MISO=-1
    PIN_ETH_SPI_SCK=-1

    HAS_LVGL_DISPLAY=1
    DISPLAY_DRIVER_GT911=1
    HAS_IO_EXPANDER=1
)

set(ATTRACTAP_EXCLUDE_REGEX "src/display/driver/qualia/")
