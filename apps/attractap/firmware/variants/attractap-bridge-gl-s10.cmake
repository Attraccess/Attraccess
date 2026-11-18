# Attractap BLE Bridge (ATT-1315): a GL.iNet GL-S10 BLE gateway as a headless BLE proxy for plugins. Classic
# ESP32 (not S3): internal EMAC Ethernet (LAN8720 on v1.x units, IP101 on v2.x) with Wi-Fi fallback, three status
# LEDs, one button. No NFC, display, beeper or LED ring. Built for IDF target esp32, so ESP-IDF adds
# sdkconfig.defaults.esp32 (4 MB flash, no PSRAM, BLE-only controller) and partitions-4mb.csv. Unfused, no secure
# profile (see README "BLE bridge").
set(ATTRACTAP_IDF_TARGET "esp32")
set(ATTRACTAP_FIRMWARE_NAME "attractap_bridge")
set(ATTRACTAP_FIRMWARE_FRIENDLY_NAME "Attractap BLE Bridge")
set(ATTRACTAP_FIRMWARE_VARIANT "gl_s10")
set(ATTRACTAP_FIRMWARE_VARIANT_FRIENDLY_NAME "GL.iNet GL-S10")

set(ATTRACTAP_DEFINES
    FIRMWARE_NAME="${ATTRACTAP_FIRMWARE_NAME}"
    FIRMWARE_FRIENDLY_NAME="${ATTRACTAP_FIRMWARE_FRIENDLY_NAME}"
    FIRMWARE_VARIANT="${ATTRACTAP_FIRMWARE_VARIANT}"
    FIRMWARE_VARIANT_FRIENDLY_NAME="${ATTRACTAP_FIRMWARE_VARIANT_FRIENDLY_NAME}"

    LOGGER_LEVEL_NUM=3

    ATTRACTAP_BLE_BRIDGE=1
    # No PSRAM (GPIO17 drives the RMII clock): the proxy reports smaller bounds that fit internal RAM.
    BLE_PROXY_INTERNAL_RAM=1

    # Internal EMAC, RMII. The PHY is found at runtime (generic IEEE 802.3 driver).
    ETH_RMII_EMAC=1
    PIN_ETH_MDC=23
    PIN_ETH_MDIO=18
    PIN_ETH_RMII_CLK_OUT=17
    PIN_ETH_PHY_POWER=5

    # Status LEDs (active low) and the button (active low). GPIO0 stays the download button.
    PIN_LED_POWER=14
    PIN_LED_BT=12
    PIN_LED_NETWORK=32
    PIN_BUTTON=33

    PIN_ETH_SPI_CS=-1
    PIN_W5500_INT=-1
    PIN_W5500_RESET=-1
    PIN_ETH_SPI_MOSI=-1
    PIN_ETH_SPI_MISO=-1
    PIN_ETH_SPI_SCK=-1
)

set(ATTRACTAP_EXCLUDE_REGEX "src/(display|ioexpander|rfid)/")
