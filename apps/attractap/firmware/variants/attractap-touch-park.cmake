# Hardware-lab parking image for Attractap Touch (V3) hardware: screen, LEDs, beeper
# and NFC off, USB kept alive. Lab-only, never part of a release.
include("${CMAKE_CURRENT_LIST_DIR}/attractap-touch.cmake")

set(ATTRACTAP_FIRMWARE_NAME "attractap_touch_park")
set(ATTRACTAP_FIRMWARE_FRIENDLY_NAME "Attractap Touch (V3) parking image")
set(ATTRACTAP_FIRMWARE_VARIANT "park")
set(ATTRACTAP_FIRMWARE_VARIANT_FRIENDLY_NAME "Lab parking")

set(ATTRACTAP_RELEASE OFF)
set(ATTRACTAP_APP "park")
list(APPEND ATTRACTAP_DEFINES ATTRACTAP_PARK_HARDWARE="attractap-touch")
set(SDKCONFIG_DEFAULTS "${CMAKE_CURRENT_LIST_DIR}/../sdkconfig.defaults;${CMAKE_CURRENT_LIST_DIR}/../park/sdkconfig.defaults")
