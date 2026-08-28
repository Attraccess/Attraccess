# Attractap Touch V2 (V4 hardware): like attractap-touch, but with a 16-bit
# PCA9555-compatible IO expander @0x24 and the PN532 behind a DFRobot Fermion
# I2C address shifter (DFR1185, both DIP switches OFF: 0x24 -> 0x64).
set(ATTRACTAP_FIRMWARE_NAME "attractap_touch_v2")
set(ATTRACTAP_FIRMWARE_FRIENDLY_NAME "Attractap Touch V2")
set(ATTRACTAP_FIRMWARE_VARIANT "wifi")
set(ATTRACTAP_FIRMWARE_VARIANT_FRIENDLY_NAME "WiFi")

set(ATTRACTAP_DEFINES
    FIRMWARE_NAME="${ATTRACTAP_FIRMWARE_NAME}"
    FIRMWARE_FRIENDLY_NAME="${ATTRACTAP_FIRMWARE_FRIENDLY_NAME}"
    FIRMWARE_VARIANT="${ATTRACTAP_FIRMWARE_VARIANT}"
    FIRMWARE_VARIANT_FRIENDLY_NAME="${ATTRACTAP_FIRMWARE_VARIANT_FRIENDLY_NAME}"

    LOGGER_LEVEL_NUM=3

    # Show the "power off" button in settings — drives SYS_EN low to cut
    # battery power. V4 hardware with SYS_EN latch only.
    HAS_POWER_BUTTON=1

    PIN_NFC_I2C_SDA=15
    PIN_NFC_I2C_SCL=7
    PIN_TOUCH_I2C_SDA=15
    PIN_TOUCH_I2C_SCL=7

    # PN532 behind DFRobot Fermion I2C Address Shifter (DFR1185)
    # Both DIP switches OFF -> bit A6 inverted -> 0x24 becomes 0x64
    PN532_I2C_ADDRESS=0x64

    # IO expander at shifted address on V4 hardware
    IOEXPANDER_I2C_ADDR=0x24

    PIN_ETH_SPI_CS=-1
    PIN_W5500_INT=-1
    PIN_W5500_RESET=-1
    PIN_ETH_SPI_MOSI=-1
    PIN_ETH_SPI_MISO=-1
    PIN_ETH_SPI_SCK=-1

    HAS_LVGL_DISPLAY=1
    DISPLAY_DRIVER_GT911=1
    HAS_IO_EXPANDER=1

    # V4 uses a 16-bit IO expander (PCA9555-compatible) at 0x24
    IO_EXPANDER_16BIT=1
)

set(ATTRACTAP_EXCLUDE_REGEX "src/display/driver/qualia/")
