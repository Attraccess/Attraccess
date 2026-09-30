# Attractap Touch Ethernet: Adafruit Qualia S3 RGB666, TL040WVS03 480x480 RGB
# panel behind an XCA9554 expander (3-wire SPI init + backlight), FocalTech
# FT6206-protocol touch @0x48, W5500 SPI ethernet.
#
# GPIO numbers were resolved from arduino-esp32's
# variants/adafruit_qualia_s3_rgb666/pins_arduino.h (A0=17, A1=16, SDA=8, SCL=18);
# panel pin constants live in src/display/driver/qualia/qualia_pins.hpp.
set(ATTRACTAP_FIRMWARE_NAME "attractap_touch")
set(ATTRACTAP_FIRMWARE_FRIENDLY_NAME "Attractap Touch")
set(ATTRACTAP_FIRMWARE_VARIANT "ethernet")
set(ATTRACTAP_FIRMWARE_VARIANT_FRIENDLY_NAME "Ethernet")

set(ATTRACTAP_DEFINES
    FIRMWARE_NAME="${ATTRACTAP_FIRMWARE_NAME}"
    FIRMWARE_FRIENDLY_NAME="${ATTRACTAP_FIRMWARE_FRIENDLY_NAME}"
    FIRMWARE_VARIANT="${ATTRACTAP_FIRMWARE_VARIANT}"
    FIRMWARE_VARIANT_FRIENDLY_NAME="${ATTRACTAP_FIRMWARE_VARIANT_FRIENDLY_NAME}"

    LOGGER_LEVEL_NUM=3

    # NFC/touch share the Qualia's default I2C bus (SDA=8, SCL=18)
    PIN_NFC_I2C_SDA=8
    PIN_NFC_I2C_SCL=18

    PIN_ETH_SPI_CS=15
    PIN_W5500_INT=17
    PIN_W5500_RESET=-1
    PIN_ETH_SPI_MOSI=7
    PIN_ETH_SPI_MISO=6
    PIN_ETH_SPI_SCK=5

    HAS_LVGL_DISPLAY=1

    DISPLAY_DRIVER_QUALIA=1
    # The Adafruit Qualia S3 RGB666 board uses a FocalTech-protocol capacitive
    # touch controller (CST826 speaking the FT6206 register map) at 0x48.
    TOUCH_DRIVER_FT6206=1
    BEEPER_PIN=16
)

set(ATTRACTAP_EXCLUDE_REGEX "src/(display/driver/gt911|ioexpander)/")
